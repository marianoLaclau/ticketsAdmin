import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "admin-elevation-tests");
const databasePath = join(testDirectory, `admin-elevation-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.NODE_ENV = "test";

const bootstrap = new Database(databasePath);
bootstrap.pragma("foreign_keys = ON");
bootstrap.exec(`
  CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT,
    username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    debe_cambiar_password INTEGER NOT NULL DEFAULT 1
      CHECK (debe_cambiar_password IN (0, 1)),
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_expiracion INTEGER NOT NULL,
    admin_elevacion_hasta INTEGER,
    admin_elevacion_clave_hash TEXT,
    fecha_creacion INTEGER NOT NULL DEFAULT 0
  );
`);
bootstrap.close();

const [
  { default: authRouter },
  { adminElevationInvalidJsonErrorHandler },
  { adminElevationRateLimiter },
  { fingerprintAdminApiKey },
  { hashPassword },
  { hashSessionToken },
  { loginAttemptLimiter, loginKdfThroughputLimiter },
  { sqlite },
] = await Promise.all([
  import("../src/routes/auth.ts"),
  import("../src/routes/auth-admin-elevation-handler.ts"),
  import("../src/lib/admin-elevation-rate-limit.ts"),
  import("../src/lib/admin-elevation.ts"),
  import("../src/lib/passwords.ts"),
  import("../src/lib/session-cookie.ts"),
  import("../src/lib/login-rate-limit.ts"),
  import("@workspace/db"),
]);

const ADMIN_KEY = "admin-elevation-key-v1";
const ROTATED_ADMIN_KEY = "admin-elevation-key-v2";
const PASSWORD = "Clave-elevacion-2026-segura";
const passwordHash = await hashPassword(PASSWORD);

const app = express();
app.use(express.json());
app.use(adminElevationInvalidJsonErrorHandler);
app.use(cookieParser());
app.use("/api", authRouter);
app.use(
  (
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(500).json({ error: "Error de prueba" });
  },
);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}/api`;

interface TestSession {
  rawToken: string;
  tokenHash: string;
  cookie: string;
  expiresAt: Date;
  userId: number;
}

interface StoredElevation {
  admin_elevacion_hasta: number | null;
  admin_elevacion_clave_hash: string | null;
}

let sessionSequence = 0;

function insertSession(
  userId: number,
  expiresAt = new Date(Date.now() + 60 * 60_000),
  rawToken?: string,
): TestSession {
  sessionSequence += 1;
  const token =
    rawToken ?? sessionSequence.toString(16).padStart(64, String(userId));
  const tokenHash = hashSessionToken(token);
  sqlite
    .prepare(
      `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
       VALUES (?, ?, ?)`,
    )
    .run(tokenHash, userId, expiresAt.getTime());
  return {
    rawToken: token,
    tokenHash,
    cookie: `gsb_session=${token}`,
    expiresAt,
    userId,
  };
}

function reinsertSession(session: TestSession): void {
  sqlite
    .prepare(
      `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
       VALUES (?, ?, ?)`,
    )
    .run(session.tokenHash, session.userId, session.expiresAt.getTime());
}

function readElevation(tokenHash: string): StoredElevation | undefined {
  return sqlite
    .prepare(
      `SELECT admin_elevacion_hasta, admin_elevacion_clave_hash
       FROM sesiones WHERE token = ?`,
    )
    .get(tokenHash) as StoredElevation | undefined;
}

async function requestWithSession(
  path: string,
  cookie?: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function elevationRequest(
  method: "GET" | "POST" | "DELETE",
  cookie?: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  let serializedBody: string | undefined;
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    serializedBody = JSON.stringify(body);
  }
  return requestWithSession("/auth/admin-elevation", cookie, {
    method,
    headers,
    body: serializedBody,
  });
}

async function login(username: string): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: username, password: PASSWORD }),
  });
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header);
  const cookie = header.split(";", 1)[0];
  assert.match(cookie, /^gsb_session=[0-9a-f]{64}$/);
  return cookie;
}

function assertClearedSessionCookie(response: Response): void {
  assert.match(response.headers.get("set-cookie") ?? "", /^gsb_session=;/);
}

async function expectElevationSuccess(
  cookie: string,
  key = ADMIN_KEY,
): Promise<{ active: boolean; expires_at: string | null }> {
  const response = await elevationRequest("POST", cookie, { admin_key: key });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    active: boolean;
    expires_at: string | null;
  };
  assert.equal(payload.active, true);
  assert.equal(typeof payload.expires_at, "string");
  return payload;
}

void beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  adminElevationRateLimiter.resetAll();
  loginAttemptLimiter.resetAll();
  loginKdfThroughputLimiter.resetAll();
  sqlite.exec(`
    DROP TRIGGER IF EXISTS delete_session_during_elevation;
    DROP TRIGGER IF EXISTS fail_elevation_write;
    DELETE FROM sesiones;
    DELETE FROM usuarios;
    DELETE FROM roles;
  `);
  sqlite
    .prepare(
      `INSERT INTO roles (id, nombre, activo) VALUES
       (1, 'SysAdmin', 1),
       (2, 'Operador', 1)`,
    )
    .run();
  const insertUser = sqlite.prepare(
    `INSERT INTO usuarios
       (id, nombre, username, email, password_hash,
        debe_cambiar_password, role_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  insertUser.run(
    1,
    "Sistema",
    "sysadmin",
    "sysadmin@example.test",
    passwordHash,
    0,
    1,
  );
  insertUser.run(
    2,
    "Operadora",
    "operadora",
    "operadora@example.test",
    passwordHash,
    0,
    2,
  );
  insertUser.run(
    3,
    "Temporal",
    "temporal",
    "temporal@example.test",
    passwordHash,
    1,
    1,
  );
});

void after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  sqlite.close();
  rmSync(databasePath, { force: true });
});

void describe("elevación administrativa por sesión", () => {
  void it("aplica sesión, contraseña definitiva y rol SysAdmin en ese orden", async () => {
    const missing = await elevationRequest("GET");
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
    assert.equal(missing.headers.get("set-cookie"), null);

    const malformed = await elevationRequest(
      "GET",
      "gsb_session=no-es-un-token",
    );
    assert.equal(malformed.status, 401);
    assert.deepEqual(await malformed.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
    assertClearedSessionCookie(malformed);

    const operator = await elevationRequest("GET", insertSession(2).cookie);
    assert.equal(operator.status, 403);
    assert.deepEqual(await operator.json(), {
      code: "SYSADMIN_REQUIRED",
      error: "Requiere rol SysAdmin",
    });

    const temporary = await elevationRequest("GET", insertSession(3).cookie);
    assert.equal(temporary.status, 403);
    assert.deepEqual(await temporary.json(), {
      code: "PASSWORD_CHANGE_REQUIRED",
      error: "Debés cambiar la contraseña temporal antes de continuar",
    });
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM sesiones").get() as {
          total: number;
        }
      ).total,
      2,
    );
  });

  void it("informa de forma estable cuando la clave no está configurada", async () => {
    const session = insertSession(1);
    delete process.env.ADMIN_API_KEY;

    const response = await elevationRequest("GET", session.cookie);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "ADMIN_ELEVATION_UNAVAILABLE",
      error: "La elevación administrativa no está disponible",
    });
    assert.deepEqual(readElevation(session.tokenHash), {
      admin_elevacion_hasta: null,
      admin_elevacion_clave_hash: null,
    });
  });

  void it("reembolsa reservas ante cuerpos inválidos o configuración ausente", async () => {
    const session = insertSession(1);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const invalid = await elevationRequest("POST", session.cookie, {
        ...(attempt === 0 ? { admin_key: ADMIN_KEY, extra: true } : {}),
      });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), {
        code: "ADMIN_ELEVATION_INVALID_BODY",
        error: "Solicitud de elevación inválida",
      });
    }
    await expectElevationSuccess(session.cookie);

    const deleted = await elevationRequest("DELETE", session.cookie);
    assert.equal(deleted.status, 200);
    delete process.env.ADMIN_API_KEY;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const unavailable = await elevationRequest("POST", session.cookie, {
        admin_key: ADMIN_KEY,
      });
      assert.equal(unavailable.status, 503);
      assert.deepEqual(await unavailable.json(), {
        code: "ADMIN_ELEVATION_UNAVAILABLE",
        error: "La elevación administrativa no está disponible",
      });
    }
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    await expectElevationSuccess(session.cookie);
  });

  void it("responde JSON estable ante un cuerpo JSON malformado", async () => {
    const session = insertSession(1);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const malformed = await requestWithSession(
        "/auth/admin-elevation",
        session.cookie,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        },
      );
      assert.equal(malformed.status, 400);
      assert.match(
        malformed.headers.get("content-type") ?? "",
        /application\/json/,
      );
      assert.deepEqual(await malformed.json(), {
        code: "ADMIN_ELEVATION_INVALID_BODY",
        error: "Solicitud de elevación inválida",
      });
    }

    await expectElevationSuccess(session.cookie);
  });

  void it("confirma sólo cinco claves incorrectas y bloquea el sexto intento", async () => {
    const session = insertSession(1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await elevationRequest("POST", session.cookie, {
        admin_key: `incorrecta-${attempt}`,
      });
      assert.equal(invalid.status, 401);
      assert.deepEqual(await invalid.json(), {
        code: "ADMIN_KEY_INVALID",
        error: "Clave de administración inválida",
      });
    }

    const blocked = await elevationRequest("POST", session.cookie, {
      admin_key: ADMIN_KEY,
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
    assert.deepEqual(await blocked.json(), {
      code: "ADMIN_ELEVATION_RATE_LIMITED",
      error: "Demasiados intentos de elevación. Intentá nuevamente más tarde",
      retry_after_seconds: 900,
    });
    assert.deepEqual(readElevation(session.tokenHash), {
      admin_elevacion_hasta: null,
      admin_elevacion_clave_hash: null,
    });
  });

  void it("persiste sólo la huella y conserva login, me y logout", async () => {
    const startedAt = Date.now();
    const authenticated = await login("sysadmin");
    assert.equal(authenticated.status, 200);
    const cookie = sessionCookie(authenticated);

    const elevated = await expectElevationSuccess(cookie);
    const finishedAt = Date.now();
    assert.ok(elevated.expires_at);
    const elevationTime = Date.parse(elevated.expires_at);
    assert.ok(elevationTime >= startedAt + 15 * 60_000);
    assert.ok(elevationTime <= finishedAt + 15 * 60_000);

    const rawToken = cookie.slice("gsb_session=".length);
    const tokenHash = hashSessionToken(rawToken);
    const stored = readElevation(tokenHash);
    assert.ok(stored);
    assert.equal(
      stored.admin_elevacion_clave_hash,
      fingerprintAdminApiKey(ADMIN_KEY),
    );
    assert.notEqual(stored.admin_elevacion_clave_hash, ADMIN_KEY);
    assert.equal(stored.admin_elevacion_hasta, elevationTime);
    assert.equal(JSON.stringify(elevated).includes(ADMIN_KEY), false);
    assert.equal(JSON.stringify(stored).includes(ADMIN_KEY), false);

    const status = await elevationRequest("GET", cookie);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), elevated);

    const me = await requestWithSession("/auth/me", cookie);
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      id: 1,
      nombre: "Sistema",
      apellido: null,
      email: "sysadmin@example.test",
      rol: "SysAdmin",
      debe_cambiar_password: false,
    });

    const logout = await requestWithSession("/auth/logout", cookie, {
      method: "POST",
    });
    assert.equal(logout.status, 204);
    assert.equal(readElevation(tokenHash), undefined);
    const afterLogout = await elevationRequest("GET", cookie);
    assert.equal(afterLogout.status, 401);
    assertClearedSessionCookie(afterLogout);
  });

  void it("acota la elevación al vencimiento exacto de la sesión", async () => {
    const expiresAt = new Date(Date.now() + 2 * 60_000);
    const session = insertSession(1, expiresAt);

    const elevated = await expectElevationSuccess(session.cookie);
    assert.equal(elevated.expires_at, expiresAt.toISOString());
    assert.deepEqual(readElevation(session.tokenHash), {
      admin_elevacion_hasta: expiresAt.getTime(),
      admin_elevacion_clave_hash: fingerprintAdminApiKey(ADMIN_KEY),
    });
  });

  void it("invalida la elevación al rotar la clave y permite renovarla", async () => {
    const session = insertSession(1);
    await expectElevationSuccess(session.cookie);
    const originalFingerprint = readElevation(
      session.tokenHash,
    )?.admin_elevacion_clave_hash;

    process.env.ADMIN_API_KEY = ROTATED_ADMIN_KEY;
    const inactive = await elevationRequest("GET", session.cookie);
    assert.equal(inactive.status, 200);
    assert.deepEqual(await inactive.json(), {
      active: false,
      expires_at: null,
    });
    assert.equal(
      readElevation(session.tokenHash)?.admin_elevacion_clave_hash,
      originalFingerprint,
    );

    await expectElevationSuccess(session.cookie, ROTATED_ADMIN_KEY);
    assert.equal(
      readElevation(session.tokenHash)?.admin_elevacion_clave_hash,
      fingerprintAdminApiKey(ROTATED_ADMIN_KEY),
    );
  });

  void it("revoca de forma idempotente sin permitir que DELETE vacío evada el límite", async () => {
    const session = insertSession(1);
    await expectElevationSuccess(session.cookie);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await elevationRequest("POST", session.cookie, {
        admin_key: `incorrecta-${attempt}`,
      });
      assert.equal(invalid.status, 401);
    }

    const revoked = await elevationRequest("DELETE", session.cookie);
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), {
      active: false,
      expires_at: null,
    });
    assert.deepEqual(readElevation(session.tokenHash), {
      admin_elevacion_hasta: null,
      admin_elevacion_clave_hash: null,
    });

    await expectElevationSuccess(session.cookie);
    const clearedAgain = await elevationRequest("DELETE", session.cookie);
    assert.equal(clearedAgain.status, 200);

    const idempotentDelete = await elevationRequest("DELETE", session.cookie);
    assert.equal(idempotentDelete.status, 200);
    assert.deepEqual(await idempotentDelete.json(), {
      active: false,
      expires_at: null,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await elevationRequest("POST", session.cookie, {
        admin_key: `otra-incorrecta-${attempt}`,
      });
      assert.equal(invalid.status, 401);
    }

    const emptyDelete = await elevationRequest("DELETE", session.cookie);
    assert.equal(emptyDelete.status, 200);

    const stillBlocked = await elevationRequest("POST", session.cookie, {
      admin_key: ADMIN_KEY,
    });
    assert.equal(stillBlocked.status, 429);
    assert.equal(stillBlocked.headers.get("retry-after"), "900");
  });

  void it("falla cerrado y reembolsa si la sesión desaparece al escribir", async () => {
    const session = insertSession(1);
    sqlite.exec(`
      CREATE TRIGGER delete_session_during_elevation
      BEFORE UPDATE OF admin_elevacion_hasta ON sesiones
      BEGIN
        DELETE FROM sesiones WHERE token = OLD.token;
        SELECT RAISE(IGNORE);
      END;
    `);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const raced = await elevationRequest("POST", session.cookie, {
        admin_key: ADMIN_KEY,
      });
      assert.equal(raced.status, 401);
      assert.deepEqual(await raced.json(), {
        code: "SESSION_INVALID",
        error: "Sesión requerida",
      });
      assertClearedSessionCookie(raced);
      reinsertSession(session);
    }

    sqlite.exec("DROP TRIGGER delete_session_during_elevation");
    await expectElevationSuccess(session.cookie);

    sqlite.exec(`
      CREATE TRIGGER delete_session_during_elevation
      BEFORE UPDATE OF admin_elevacion_hasta ON sesiones
      BEGIN
        DELETE FROM sesiones WHERE token = OLD.token;
        SELECT RAISE(IGNORE);
      END;
    `);
    const deletedRace = await elevationRequest("DELETE", session.cookie);
    assert.equal(deletedRace.status, 401);
    assert.deepEqual(await deletedRace.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
    assertClearedSessionCookie(deletedRace);
  });

  void it("reembolsa la reserva si la escritura falla", async () => {
    const session = insertSession(1);
    sqlite.exec(`
      CREATE TRIGGER fail_elevation_write
      BEFORE UPDATE OF admin_elevacion_hasta ON sesiones
      BEGIN
        SELECT RAISE(ABORT, 'forced elevation write failure');
      END;
    `);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await elevationRequest("POST", session.cookie, {
        admin_key: ADMIN_KEY,
      });
      assert.equal(failed.status, 500);
      assert.deepEqual(await failed.json(), { error: "Error de prueba" });
    }

    sqlite.exec("DROP TRIGGER fail_elevation_write");
    await expectElevationSuccess(session.cookie);
  });
});
