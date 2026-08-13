import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";
import { hashSessionToken } from "../src/modules/auth/security/session-cookie.ts";

const testDirectory = join(process.cwd(), "tmp", "backend-rbac-tests");
const databasePath = join(testDirectory, `rbac-${process.pid}.db`);
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
    debe_cambiar_password INTEGER NOT NULL DEFAULT 1 CHECK (debe_cambiar_password IN (0, 1)),
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_expiracion INTEGER NOT NULL,
    fecha_creacion INTEGER NOT NULL DEFAULT 0
  );
`);
bootstrap.close();

const [
  { default: authRouter },
  { default: adminRouter },
  { default: productionRouter },
  {
    getSessionContext,
    purgeExpiredSessions,
    requirePasswordChangeCompleted,
    requireSession,
  },
  { hashPassword, needsPasswordRehash, verifyPassword },
  {
    LOGIN_ACCOUNT_MAX_ATTEMPTS,
    LOGIN_KDF_MAX_CONCURRENT,
    LOGIN_KDF_MAX_QUEUED,
    loginAttemptLimiter,
    loginKdfGate,
    loginKdfThroughputLimiter,
  },
  { sqlite },
  { purgeUnsafeStoredSessions },
] = await Promise.all([
  import("../src/modules/auth/index.ts"),
  import("../src/modules/administracion/index.ts"),
  import("../src/routes/index.ts"),
  import("../src/modules/auth/application/session.ts"),
  import("../src/modules/auth/security/passwords.ts"),
  import("../src/modules/auth/security/login-rate-limit.ts"),
  import("@workspace/db"),
  import("../src/modules/auth/data/session-store.ts"),
]);

const password = "Clave-RBAC-2026-segura";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
app.use(requireSession);
app.use(requirePasswordChangeCompleted);
app.get("/protected-test", (_req, res) => {
  res.json({ ok: true });
});
app.get("/session-context-test", (_req, res) => {
  const session = res.locals.authSession as
    NonNullable<Awaited<ReturnType<typeof getSessionContext>>> | undefined;
  if (!session) {
    res.status(500).json({ error: "Contexto interno ausente" });
    return;
  }
  res.json(session);
});
app.use(adminRouter);
app.use("/api", productionRouter);
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
const baseUrl = `http://127.0.0.1:${port}`;

async function login(
  usuario: string,
  passwordValue = password,
): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, password: passwordValue }),
  });
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "el login debe devolver la cookie de sesión");
  const cookie = header.split(";", 1)[0];
  assert.match(cookie, /^gsb_session=[0-9a-f]{64}$/);
  return cookie;
}

function assertClearedSessionCookie(response: Response): void {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "la respuesta debe eliminar la cookie inválida");
  const attributes = header.split(";").map((part) => part.trim());
  assert.equal(attributes[0], "gsb_session=");
  assert.ok(attributes.includes("Path=/"));
  assert.ok(attributes.includes("HttpOnly"));
  assert.ok(attributes.includes("SameSite=Lax"));
  const expires = attributes.find((attribute) =>
    attribute.startsWith("Expires="),
  );
  assert.ok(expires, "la cookie eliminada debe incluir una expiración");
  assert.ok(
    Date.parse(expires.slice("Expires=".length)) < Date.now(),
    "la expiración de la cookie eliminada debe estar en el pasado",
  );
}

async function adminSession(): Promise<string> {
  const response = await login("sysadmin");
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

function requestWithSession(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function adminRequest(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return requestWithSession(path, cookie, init);
}

function changeOwnPassword(
  cookie: string,
  currentPassword: string,
  newPassword: string,
): Promise<Response> {
  return requestWithSession("/auth/password", cookie, {
    method: "POST",
    body: JSON.stringify({
      password_actual: currentPassword,
      password_nueva: newPassword,
    }),
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  delayMs = 0,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    } else {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  assert.fail(message);
}

function readStreamChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  message: string,
  timeoutMs = 1_000,
): ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    reader.read().then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function readStreamUntilClosed(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  message: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let payload = "";
  for (;;) {
    const chunk = await readStreamChunkWithTimeout(reader, message);
    if (chunk.done) return payload + decoder.decode();
    payload += decoder.decode(chunk.value, { stream: true });
  }
}

beforeEach(async () => {
  process.env.ADMIN_API_KEY = "rbac-admin-key";
  loginAttemptLimiter.resetAll();
  loginKdfThroughputLimiter.resetAll();
  const passwordHash = await hashPassword(password);
  sqlite.exec("DELETE FROM sesiones; DELETE FROM usuarios; DELETE FROM roles;");
  sqlite
    .prepare(
      `INSERT INTO roles (id, nombre, activo) VALUES
       (1, 'SysAdmin', 1),
       (2, 'Administrador', 1),
       (3, 'Operador', 1),
       (4, 'Rol inactivo', 0),
       (5, 'Mesa personalizada', 1),
       (7, 'Controller', 1)`,
    )
    .run();
  const insertUser = sqlite.prepare(
    `INSERT INTO usuarios
     (id, nombre, username, email, password_hash, debe_cambiar_password, role_id, activo)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  insertUser.run(
    1,
    "Sistema",
    "sysadmin",
    "sysadmin@example.test",
    passwordHash,
    1,
    1,
  );
  insertUser.run(
    2,
    "Operadora",
    "operadora",
    "operadora@example.test",
    passwordHash,
    5,
    1,
  );
  insertUser.run(
    3,
    "Suspendida",
    "rolinactivo",
    "inactiva@example.test",
    passwordHash,
    4,
    1,
  );
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  sqlite.close();
  rmSync(databasePath, { force: true });
});

describe("ciclo de la cookie de sesión", () => {
  it("emite atributos acotados y evita cachear respuestas de autenticación", async () => {
    const response = await login("operadora");
    assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie");
    assert.ok(header);
    const attributes = header.split(";").map((part) => part.trim());
    assert.match(attributes[0] ?? "", /^gsb_session=[0-9a-f]{64}$/);
    assert.ok(attributes.includes("Path=/"));
    assert.ok(attributes.includes("Max-Age=604800"));
    assert.ok(attributes.includes("HttpOnly"));
    assert.ok(attributes.includes("SameSite=Lax"));
    assert.equal(attributes.includes("Secure"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const rawToken = sessionCookie(response).slice("gsb_session=".length);
    const storedSession = sqlite
      .prepare("SELECT token FROM sesiones")
      .get() as { token: string };
    assert.equal(storedSession.token, hashSessionToken(rawToken));
    assert.notEqual(storedSession.token, rawToken);

    const stolenDigest = await requestWithSession(
      "/auth/me",
      `gsb_session=${storedSession.token}`,
    );
    assert.equal(stolenDigest.status, 401);
    assertClearedSessionCookie(stolenDigest);
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM sesiones").get() as {
          total: number;
        }
      ).total,
      1,
    );

    const me = await requestWithSession("/auth/me", sessionCookie(response));
    assert.equal(me.status, 200);
    assert.equal(me.headers.get("cache-control"), "no-store");

    const functional = await requestWithSession(
      "/protected-test",
      sessionCookie(response),
    );
    assert.equal(functional.status, 200);
    assert.equal(functional.headers.get("cache-control"), null);
  });

  it("mantiene privado el contexto interno al consultar la identidad", async () => {
    const authenticated = await login("operadora");
    const cookie = sessionCookie(authenticated);
    const rawToken = cookie.slice("gsb_session=".length);
    const tokenHash = hashSessionToken(rawToken);
    const sessionExpiresAt = new Date(Date.now() + 45 * 60_000);
    sqlite
      .prepare(`UPDATE sesiones SET fecha_expiracion = ? WHERE token = ?`)
      .run(sessionExpiresAt.getTime(), tokenHash);

    const me = await requestWithSession("/auth/me", cookie);
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      id: 2,
      nombre: "Operadora",
      apellido: null,
      email: "operadora@example.test",
      rol: "Mesa personalizada",
      debe_cambiar_password: false,
    });

    const context = await requestWithSession("/session-context-test", cookie);
    assert.equal(context.status, 200);
    assert.deepEqual(await context.json(), {
      user: {
        id: 2,
        nombre: "Operadora",
        apellido: null,
        email: "operadora@example.test",
        rol: "Mesa personalizada",
        debe_cambiar_password: false,
      },
      tokenHash,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    });

    const directContext = await getSessionContext({
      cookies: { gsb_session: rawToken },
    } as unknown as express.Request);
    assert.deepEqual(directContext, {
      user: {
        id: 2,
        nombre: "Operadora",
        apellido: null,
        email: "operadora@example.test",
        rol: "Mesa personalizada",
        debe_cambiar_password: false,
      },
      tokenHash,
      sessionExpiresAt,
    });
  });

  it("no crea una cookie de borrado cuando la sesión nunca fue enviada", async () => {
    const response = await fetch(`${baseUrl}/auth/me`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("rechaza el cambio de contraseña sin sesión y limpia una cookie malformada", async () => {
    const missing = await fetch(`${baseUrl}/auth/password`, { method: "POST" });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      code: "SESSION_INVALID",
      error: "Sin sesión válida",
    });
    assert.equal(missing.headers.get("cache-control"), "no-store");

    const malformed = await requestWithSession(
      "/auth/password",
      "gsb_session=no-es-un-token",
      { method: "POST" },
    );
    assert.equal(malformed.status, 401);
    assert.deepEqual(await malformed.json(), {
      code: "SESSION_INVALID",
      error: "Sin sesión válida",
    });
    assertClearedSessionCookie(malformed);
    assert.equal(malformed.headers.get("cache-control"), "no-store");
  });

  it("limpia una cookie malformada también desde el candado global", async () => {
    const missing = await fetch(`${baseUrl}/protected-test`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
    assert.equal(missing.headers.get("set-cookie"), null);

    const malformed = await requestWithSession(
      "/protected-test",
      "gsb_session=no-es-un-token",
    );
    assert.equal(malformed.status, 401);
    assert.deepEqual(await malformed.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
    assertClearedSessionCookie(malformed);
  });

  it("purga el límite exacto y conserva las sesiones futuras", async () => {
    const boundary = new Date("2030-01-02T03:04:05.000Z");
    const exactToken = "c".repeat(64);
    const futureToken = "d".repeat(64);
    const insert = sqlite.prepare(
      "INSERT INTO sesiones (token, usuario_id, fecha_expiracion) VALUES (?, 2, ?)",
    );
    const exactTokenHash = hashSessionToken(exactToken);
    const futureTokenHash = hashSessionToken(futureToken);
    insert.run(exactTokenHash, boundary.getTime());
    insert.run(futureTokenHash, boundary.getTime() + 1);

    await purgeExpiredSessions(boundary);

    const storedTokens = sqlite
      .prepare("SELECT token FROM sesiones ORDER BY token")
      .all() as Array<{ token: string }>;
    assert.deepEqual(storedTokens, [{ token: futureTokenHash }]);
  });

  it("sanea almacenamiento legado y conserva únicamente hashes válidos", async () => {
    const boundary = new Date("2031-02-03T04:05:06.000Z");
    const validFuture = hashSessionToken("e".repeat(64));
    const validExpired = hashSessionToken("f".repeat(64));
    const insert = sqlite.prepare(
      "INSERT INTO sesiones (token, usuario_id, fecha_expiracion) VALUES (?, 2, ?)",
    );
    for (const invalid of [
      "1".repeat(64),
      `sha256:${"A".repeat(64)}`,
      `sha256:${"2".repeat(63)}`,
      `sha256:${"g".repeat(64)}`,
    ]) {
      insert.run(invalid, boundary.getTime() + 1);
    }
    insert.run(validFuture, boundary.getTime() + 1);
    insert.run(validExpired, boundary.getTime());

    assert.equal(await purgeUnsafeStoredSessions(), 4);
    assert.equal(await purgeUnsafeStoredSessions(), 0);

    let storedTokens = sqlite
      .prepare("SELECT token FROM sesiones ORDER BY token")
      .all() as Array<{ token: string }>;
    assert.deepEqual(
      storedTokens,
      [validFuture, validExpired].sort().map((token) => ({ token })),
    );

    await purgeExpiredSessions(boundary);
    storedTokens = sqlite
      .prepare("SELECT token FROM sesiones ORDER BY token")
      .all() as Array<{ token: string }>;
    assert.deepEqual(storedTokens, [{ token: validFuture }]);
  });

  it("elimina cookies malformadas, desconocidas y vencidas", async () => {
    for (const cookie of [
      "gsb_session=no-es-un-token",
      `gsb_session=${"a".repeat(64)}`,
    ]) {
      const response = await requestWithSession("/auth/me", cookie);
      assert.equal(response.status, 401);
      assertClearedSessionCookie(response);
    }

    const expiredToken = "b".repeat(64);
    sqlite
      .prepare(
        "INSERT INTO sesiones (token, usuario_id, fecha_expiracion) VALUES (?, 2, ?)",
      )
      .run(hashSessionToken(expiredToken), Date.now() - 1);
    const expired = await requestWithSession(
      "/auth/me",
      `gsb_session=${expiredToken}`,
    );
    assert.equal(expired.status, 401);
    assertClearedSessionCookie(expired);
    const stored = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE token = ?")
      .get(hashSessionToken(expiredToken)) as { total: number };
    assert.equal(stored.total, 0);
  });

  it("elimina la cookie y la fila si la cuenta deja de estar activa", async () => {
    const authenticated = await login("operadora");
    const cookie = sessionCookie(authenticated);
    sqlite.prepare("UPDATE usuarios SET activo = 0 WHERE id = 2").run();

    const response = await requestWithSession("/auth/me", cookie);
    assert.equal(response.status, 401);
    assertClearedSessionCookie(response);
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(sessions.total, 0);
  });

  it("mantiene logout idempotente incluso sin sesión", async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, { method: "POST" });
    assert.equal(response.status, 204);
    assertClearedSessionCookie(response);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("protege el stream SSE detrás de la sesión", async () => {
    const response = await fetch(`${baseUrl}/api/events`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "SESSION_INVALID",
      error: "Sesión requerida",
    });
  });

  it("expone el contrato SSE y cierra el stream al revocar la sesión", async () => {
    const cookie = sessionCookie(await login("operadora"));
    const stream = await requestWithSession("/api/events", cookie);
    assert.equal(stream.status, 200);
    assert.match(
      stream.headers.get("content-type") ?? "",
      /^text\/event-stream(?:;\s*charset=utf-8)?$/i,
    );
    assert.equal(stream.headers.get("cache-control"), "no-cache");
    assert.equal(stream.headers.get("connection"), "keep-alive");
    assert.equal(stream.headers.get("x-accel-buffering"), "no");
    assert.ok(stream.body);
    const reader = stream.body.getReader();

    try {
      const logout = await requestWithSession("/auth/logout", cookie, {
        method: "POST",
      });
      assert.equal(logout.status, 204);

      const payload = await readStreamUntilClosed(
        reader,
        "el stream SSE no se cerró al revocar",
      );
      assert.equal(payload, "retry: 5000\n\n");
    } finally {
      await reader.cancel();
    }
  });
});

describe("autenticación uniforme", () => {
  it("devuelve el mismo error para usuario inexistente, inactivo o clave incorrecta", async () => {
    const responses = await Promise.all([
      login("no-existe"),
      login("rolinactivo"),
      fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuario: "sysadmin", password: "incorrecta" }),
      }),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: "Usuario o contraseña incorrectos",
      });
    }
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones")
      .get() as { total: number };
    assert.equal(sessions.total, 0);
  });

  it("limita por usuario normalizado sin crear sesiones ni revelar la cuenta", async () => {
    const variants = ["operadora", " OPERADORA "];
    for (let index = 0; index < LOGIN_ACCOUNT_MAX_ATTEMPTS; index += 1) {
      const response = await login(
        variants[index % variants.length],
        `incorrecta-${index}`,
      );
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: "Usuario o contraseña incorrectos",
      });
    }

    const blocked = await login("Operadora", password);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.equal(blocked.headers.get("set-cookie"), null);
    assert.deepEqual(await blocked.json(), {
      code: "LOGIN_RATE_LIMITED",
      error:
        "Demasiados intentos de inicio de sesión. Esperá unos minutos e intentá nuevamente.",
      retry_after_seconds: 900,
    });
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones")
      .get() as { total: number };
    assert.equal(sessions.total, 0);

    // El bloqueo de una identidad no afecta a las demás.
    assert.equal((await login("sysadmin")).status, 200);
  });

  it("aplica el mismo límite a identidades inexistentes", async () => {
    for (let index = 0; index < LOGIN_ACCOUNT_MAX_ATTEMPTS; index += 1) {
      assert.equal(
        (await login("no-existe", `incorrecta-${index}`)).status,
        401,
      );
    }
    const blocked = await login(" NO-EXISTE ");
    assert.equal(blocked.status, 429);
    assert.equal(
      ((await blocked.json()) as { code: string }).code,
      "LOGIN_RATE_LIMITED",
    );
  });

  it("la saturación criptográfica reembolsa reservas sin bloquear la cuenta", async () => {
    let releaseAll: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });
    const blockers = Array.from(
      { length: LOGIN_KDF_MAX_CONCURRENT + LOGIN_KDF_MAX_QUEUED },
      () => loginKdfGate.run(() => hold),
    );
    await waitFor(
      () =>
        loginKdfGate.activeCount === LOGIN_KDF_MAX_CONCURRENT &&
        loginKdfGate.queuedCount === LOGIN_KDF_MAX_QUEUED,
      "la compuerta KDF no llego a saturarse",
    );

    try {
      for (let index = 0; index <= LOGIN_ACCOUNT_MAX_ATTEMPTS; index += 1) {
        const response = await login("operadora");
        assert.equal(response.status, 429);
        assert.equal(response.headers.get("retry-after"), "1");
      }
    } finally {
      releaseAll?.();
      await Promise.all(blockers);
    }

    assert.equal((await login("operadora")).status, 200);
  });

  it("un cliente abortado no elude un fallo de credenciales ya admitido", async () => {
    for (let index = 0; index < LOGIN_ACCOUNT_MAX_ATTEMPTS - 1; index += 1) {
      const attempt = loginAttemptLimiter.reserve("operadora");
      assert.equal(attempt.allowed, true);
      if (!attempt.allowed) assert.fail("el intento debia reservarse");
      loginAttemptLimiter.confirmFailure(attempt.reservation);
    }

    const releases: Array<() => void> = [];
    const blockers = Array.from({ length: LOGIN_KDF_MAX_CONCURRENT }, () =>
      loginKdfGate.run(
        () => new Promise<void>((resolve) => releases.push(resolve)),
      ),
    );
    await waitFor(
      () => loginKdfGate.activeCount === LOGIN_KDF_MAX_CONCURRENT,
      "la compuerta KDF no llego a ocuparse",
    );

    const controller = new AbortController();
    const abortedLogin = fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        usuario: "operadora",
        password: "incorrecta-abortada",
      }),
      signal: controller.signal,
    });
    try {
      await waitFor(
        () => loginKdfGate.queuedCount === 1,
        "el login abortable no quedo esperando en la compuerta",
      );
      controller.abort();
      await assert.rejects(abortedLogin, { name: "AbortError" });
    } finally {
      controller.abort();
      for (const release of releases) release();
      await Promise.all(blockers);
    }
    await waitFor(
      () => loginKdfGate.activeCount === 0 && loginKdfGate.queuedCount === 0,
      "la verificacion abortada no termino de procesarse",
      10,
    );

    const blocked = await login("operadora");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
  });

  it("un reset administrativo libera el límite de la cuenta", async () => {
    for (let index = 0; index < LOGIN_ACCOUNT_MAX_ATTEMPTS; index += 1) {
      assert.equal(
        (await login("operadora", `incorrecta-${index}`)).status,
        401,
      );
    }
    assert.equal((await login("operadora")).status, 429);

    const adminCookie = await adminSession();
    const newPassword = "Clave operadora restablecida 2026";
    const reset = await adminRequest("/admin/users/2/password", adminCookie, {
      method: "POST",
      body: JSON.stringify({ password: newPassword }),
    });
    assert.equal(reset.status, 204);
    assert.equal((await login("operadora", newPassword)).status, 200);
  });

  it("alta y renombre no heredan un bloqueo previo de esa identidad", async () => {
    const exhaust = (identity: string) => {
      for (let index = 0; index < LOGIN_ACCOUNT_MAX_ATTEMPTS; index += 1) {
        const attempt = loginAttemptLimiter.reserve(identity);
        assert.equal(attempt.allowed, true);
        if (!attempt.allowed) assert.fail("el intento debia reservarse");
        loginAttemptLimiter.confirmFailure(attempt.reservation);
      }
      assert.equal(loginAttemptLimiter.reserve(identity).allowed, false);
    };
    exhaust("cuenta-nueva");
    exhaust("cuenta-renombrada");

    const adminCookie = await adminSession();
    const createdPassword = "Clave segura para cuenta nueva 2026";
    const created = await adminRequest("/admin/users", adminCookie, {
      method: "POST",
      body: JSON.stringify({
        nombre: "Cuenta nueva",
        username: "cuenta-nueva",
        password: createdPassword,
        email: "cuenta-nueva@example.test",
        role_id: 5,
        activo: true,
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await login("cuenta-nueva", createdPassword)).status, 200);

    const renamed = await adminRequest("/admin/users/2", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ username: "cuenta-renombrada" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await login("cuenta-renombrada")).status, 200);
  });

  it("un login en espera no sobrevive al renombre de su identidad", async () => {
    const adminCookie = await adminSession();
    const releases: Array<() => void> = [];
    const blockers = Array.from({ length: LOGIN_KDF_MAX_CONCURRENT }, () =>
      loginKdfGate.run(
        () => new Promise<void>((resolve) => releases.push(resolve)),
      ),
    );
    await waitFor(
      () => loginKdfGate.activeCount === LOGIN_KDF_MAX_CONCURRENT,
      "la compuerta KDF no llego a ocuparse",
    );

    const pendingLogin = login("operadora");
    await waitFor(
      () => loginKdfGate.queuedCount === 1,
      "el login no quedo esperando en la compuerta",
    );

    try {
      const renamed = await adminRequest("/admin/users/2", adminCookie, {
        method: "PATCH",
        body: JSON.stringify({ username: "operadora-renombrada" }),
      });
      assert.equal(renamed.status, 200);
    } finally {
      for (const release of releases) release();
      await Promise.all(blockers);
    }

    const response = await pendingLogin;
    assert.equal(response.status, 401);
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(sessions.total, 0);
    assert.equal((await login("operadora-renombrada")).status, 200);
  });

  it("rehasea el formato legado después de un login correcto", async () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    sqlite
      .prepare(
        `
        UPDATE usuarios
        SET password_hash = ?, debe_cambiar_password = 1
        WHERE id = 1
      `,
      )
      .run(legacy);

    const response = await login("sysadmin");
    assert.equal(response.status, 200);
    assert.equal(
      ((await response.json()) as { debe_cambiar_password: boolean })
        .debe_cambiar_password,
      true,
    );
    const stored = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 1
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    assert.notEqual(stored.password_hash, legacy);
    assert.equal(needsPasswordRehash(stored.password_hash), false);
    assert.equal(await verifyPassword(password, stored.password_hash), true);
    assert.equal(stored.debe_cambiar_password, 1);
  });

  it("acepta dos logins simultáneos mientras migra un hash legado", async () => {
    const salt = "fedcba9876543210fedcba9876543210";
    const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    sqlite
      .prepare("UPDATE usuarios SET password_hash = ? WHERE id = 1")
      .run(legacy);

    const responses = await Promise.all([login("sysadmin"), login("sysadmin")]);
    assert.deepEqual(
      responses.map(({ status }) => status),
      [200, 200],
    );
    const rawTokens = responses.map((response) =>
      sessionCookie(response).slice("gsb_session=".length),
    );

    const stored = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
      .get() as { password_hash: string };
    const sessions = sqlite
      .prepare("SELECT token FROM sesiones WHERE usuario_id = 1 ORDER BY token")
      .all() as Array<{ token: string }>;
    assert.equal(needsPasswordRehash(stored.password_hash), false);
    assert.equal(await verifyPassword(password, stored.password_hash), true);
    assert.deepEqual(
      sessions.map(({ token }) => token),
      rawTokens.map(hashSessionToken).sort(),
    );
    for (const rawToken of rawTokens) {
      assert.equal(
        sessions.some(({ token }) => token === rawToken),
        false,
      );
    }
  });

  it("revierte el rehash si no puede crear la sesión", async () => {
    const salt = "00112233445566778899aabbccddeeff";
    const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    sqlite
      .prepare("UPDATE usuarios SET password_hash = ? WHERE id = 1")
      .run(legacy);
    sqlite.exec(`
      CREATE TRIGGER bloquear_sesion_sysadmin
      BEFORE INSERT ON sesiones
      WHEN NEW.usuario_id = 1
      BEGIN
        SELECT RAISE(ABORT, 'sesión bloqueada por prueba');
      END;
    `);

    let response: Response;
    try {
      response = await login("sysadmin");
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_sesion_sysadmin");
    }

    assert.equal(response.status, 500);
    const stored = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
      .get() as { password_hash: string };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 1")
      .get() as { total: number };
    assert.equal(stored.password_hash, legacy);
    assert.equal(sessions.total, 0);
    assert.equal(
      loginAttemptLimiter.size,
      0,
      "un 5xx no debe conservar una reserva como fallo de contraseña",
    );
  });

  it("no conserva una sesión creada mientras se resetea la contraseña", async () => {
    const salt = "ffeeddccbbaa99887766554433221100";
    const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    const newPassword = "Clave-RBAC-2026-reemplazada";
    sqlite
      .prepare("UPDATE usuarios SET password_hash = ? WHERE id = 2")
      .run(legacy);
    const cookie = await adminSession();

    const [loginResponse, resetResponse] = await Promise.all([
      login("operadora"),
      adminRequest("/admin/users/2/password", cookie, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      }),
    ]);

    assert.equal(resetResponse.status, 204);
    assert.ok(
      loginResponse.status === 200 || loginResponse.status === 401,
      "el login puede ganar o perder la carrera, pero no fallar de otra forma",
    );
    if (loginResponse.status === 200) {
      const me = await requestWithSession(
        "/auth/me",
        sessionCookie(loginResponse),
      );
      assert.equal(
        me.status,
        401,
        "el reset debe revocar la sesión recién creada",
      );
    }

    const stored = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = 2")
      .get() as { password_hash: string };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(sessions.total, 0);
    assert.equal(await verifyPassword(password, stored.password_hash), false);
    assert.equal(await verifyPassword(newPassword, stored.password_hash), true);
  });

  it("acepta y rehashea contraseñas históricas fuera de la política de altas", async () => {
    const salt = "abcdefabcdefabcdefabcdefabcdefab";
    for (const legacyPassword of [
      "x",
      "passwordpassword",
      " Frase histórica segura ",
      "x".repeat(128),
    ]) {
      const legacy = `scrypt:${salt}:${scryptSync(legacyPassword, salt, 64).toString("hex")}`;
      sqlite
        .prepare("UPDATE usuarios SET password_hash = ? WHERE id = 2")
        .run(legacy);

      const response = await login("operadora", legacyPassword);
      assert.equal(response.status, 200);
      const stored = sqlite
        .prepare("SELECT password_hash FROM usuarios WHERE id = 2")
        .get() as { password_hash: string };
      assert.equal(needsPasswordRehash(stored.password_hash), false);
      assert.equal(
        await verifyPassword(legacyPassword, stored.password_hash),
        true,
      );
    }
  });

  it("limita el tamaño del password recibido por login", async () => {
    assert.equal((await login("operadora", "")).status, 400);
    assert.equal((await login("operadora", "x".repeat(129))).status, 400);
    assert.equal((await login("operadora", "x".repeat(128))).status, 401);
  });
});

describe("cambio obligatorio de contraseña", () => {
  const definitivePassword = "Definitiva interna segura 2026";

  it("informa la clave temporal y bloquea toda ruta funcional", async () => {
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 1")
      .run();
    const response = await login("sysadmin");
    assert.equal(response.status, 200);
    assert.equal(
      ((await response.json()) as { debe_cambiar_password: boolean })
        .debe_cambiar_password,
      true,
    );
    const cookie = sessionCookie(response);
    const storedTokenHash = (
      sqlite
        .prepare("SELECT token FROM sesiones WHERE usuario_id = 1")
        .get() as { token: string }
    ).token;
    assert.equal(
      storedTokenHash,
      hashSessionToken(cookie.slice("gsb_session=".length)),
    );

    const me = await requestWithSession("/auth/me", cookie);
    assert.equal(me.status, 200);
    assert.equal(
      ((await me.json()) as { debe_cambiar_password: boolean })
        .debe_cambiar_password,
      true,
    );

    for (const request of [
      requestWithSession("/protected-test", cookie),
      adminRequest("/admin/users", cookie),
      requestWithSession("/api/tickets", cookie),
    ]) {
      const blocked = await request;
      assert.equal(blocked.status, 403);
      assert.deepEqual(await blocked.json(), {
        code: "PASSWORD_CHANGE_REQUIRED",
        error: "Debés cambiar la contraseña temporal antes de continuar",
      });
    }

    const logout = await requestWithSession("/auth/logout", cookie, {
      method: "POST",
    });
    assert.equal(logout.status, 204);
    assert.equal(
      (
        sqlite
          .prepare("SELECT count(*) AS total FROM sesiones WHERE token = ?")
          .get(storedTokenHash) as { total: number }
      ).total,
      0,
    );
    assert.equal((await requestWithSession("/auth/me", cookie)).status, 401);
  });

  it("falla cerrado si el contexto no contiene un flag booleano", () => {
    let statusCode = 0;
    let payload: unknown;
    let nextCalled = false;
    const response = {
      locals: {
        authUser: {
          id: 1,
          nombre: "Contexto incompleto",
          apellido: null,
          email: "incompleto@example.test",
          rol: "SysAdmin",
        },
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        payload = body;
        return this;
      },
    } as unknown as express.Response;

    requirePasswordChangeCompleted({} as express.Request, response, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
    assert.deepEqual(payload, {
      code: "PASSWORD_CHANGE_REQUIRED",
      error: "Debés cambiar la contraseña temporal antes de continuar",
    });
  });

  it("rechaza actual incorrecta, nueva inválida o reutilizada sin mutar nada", async () => {
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 2")
      .run();
    const firstLogin = await login("operadora");
    const secondLogin = await login("operadora");
    const cookie = sessionCookie(firstLogin);
    sessionCookie(secondLogin);
    const before = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };

    const wrongCurrent = await changeOwnPassword(
      cookie,
      "Temporal-incorrecta-2026",
      definitivePassword,
    );
    assert.equal(wrongCurrent.status, 400);
    assert.equal(
      ((await wrongCurrent.json()) as { code: string }).code,
      "CURRENT_PASSWORD_INVALID",
    );

    const invalidNew = await changeOwnPassword(
      cookie,
      password,
      "passwordpassword",
    );
    assert.equal(invalidNew.status, 400);
    assert.equal(
      ((await invalidNew.json()) as { code: string }).code,
      "NEW_PASSWORD_POLICY_VIOLATION",
    );

    const reused = await changeOwnPassword(cookie, password, password);
    assert.equal(reused.status, 409);
    assert.equal(
      ((await reused.json()) as { code: string }).code,
      "PASSWORD_REUSE_NOT_ALLOWED",
    );

    const after = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.deepEqual(after, before);
    assert.equal(sessions.total, 2);
  });

  it("cambia el hash, limpia el flag y rota todas las sesiones atómicamente", async () => {
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 2")
      .run();
    const firstLogin = await login("operadora");
    const secondLogin = await login("operadora");
    const firstCookie = sessionCookie(firstLogin);
    const secondCookie = sessionCookie(secondLogin);

    const changed = await changeOwnPassword(
      firstCookie,
      password,
      definitivePassword,
    );
    assert.equal(changed.status, 200);
    const rotatedCookie = sessionCookie(changed);
    assert.notEqual(rotatedCookie, firstCookie);
    assert.equal(
      ((await changed.json()) as { debe_cambiar_password: boolean })
        .debe_cambiar_password,
      false,
    );

    assert.equal(
      (await requestWithSession("/auth/me", firstCookie)).status,
      401,
    );
    assert.equal(
      (await requestWithSession("/auth/me", secondCookie)).status,
      401,
    );
    const me = await requestWithSession("/auth/me", rotatedCookie);
    assert.equal(me.status, 200);
    assert.equal(
      ((await me.json()) as { debe_cambiar_password: boolean })
        .debe_cambiar_password,
      false,
    );
    assert.equal(
      (await requestWithSession("/protected-test", rotatedCookie)).status,
      200,
    );

    const stored = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT token FROM sesiones WHERE usuario_id = 2")
      .all() as Array<{ token: string }>;
    assert.equal(
      await verifyPassword(definitivePassword, stored.password_hash),
      true,
    );
    assert.equal(stored.debe_cambiar_password, 0);
    assert.deepEqual(sessions, [
      {
        token: hashSessionToken(rotatedCookie.slice("gsb_session=".length)),
      },
    ]);
    assert.equal((await login("operadora", password)).status, 401);
    assert.equal((await login("operadora", definitivePassword)).status, 200);
  });

  it("revierte hash, flag y sesiones si no puede crear el token rotado", async () => {
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 2")
      .run();
    const loginResponse = await login("operadora");
    const cookie = sessionCookie(loginResponse);
    const tokenHashBefore = (
      sqlite
        .prepare("SELECT token FROM sesiones WHERE usuario_id = 2")
        .get() as { token: string }
    ).token;
    const before = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    sqlite.exec(`
      CREATE TRIGGER bloquear_sesion_rotada
      BEFORE INSERT ON sesiones
      WHEN NEW.usuario_id = 2
      BEGIN
        SELECT RAISE(ABORT, 'rotación bloqueada por prueba');
      END;
    `);

    let response: Response;
    try {
      response = await changeOwnPassword(cookie, password, definitivePassword);
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_sesion_rotada");
    }

    assert.equal(response.status, 500);
    const after = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT token FROM sesiones WHERE usuario_id = 2")
      .all() as Array<{ token: string }>;
    assert.deepEqual(after, before);
    assert.deepEqual(sessions, [{ token: tokenHashBefore }]);
    assert.equal((await requestWithSession("/auth/me", cookie)).status, 200);
  });

  it("permite confirmar como máximo uno de dos cambios concurrentes", async () => {
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 2")
      .run();
    const firstCookie = sessionCookie(await login("operadora"));
    const secondCookie = sessionCookie(await login("operadora"));
    const candidates = [
      "Definitiva concurrente Alfa 2026",
      "Definitiva concurrente Beta 2026",
    ];

    const responses = await Promise.all([
      changeOwnPassword(firstCookie, password, candidates[0]),
      changeOwnPassword(secondCookie, password, candidates[1]),
    ]);
    assert.deepEqual(
      responses.map(({ status }) => status).sort((a, b) => a - b),
      [200, 401],
    );
    const winner = responses.findIndex(({ status }) => status === 200);
    const winnerCookie = sessionCookie(responses[winner]);
    const stored = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT token FROM sesiones WHERE usuario_id = 2")
      .all() as Array<{ token: string }>;
    assert.equal(
      await verifyPassword(candidates[winner], stored.password_hash),
      true,
    );
    assert.equal(stored.debe_cambiar_password, 0);
    assert.deepEqual(sessions, [
      {
        token: hashSessionToken(winnerCookie.slice("gsb_session=".length)),
      },
    ]);
  });

  it("un reset administrativo concurrente siempre conserva su clave temporal", async () => {
    const adminCookie = await adminSession();
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = 2")
      .run();
    const operatorCookie = sessionCookie(await login("operadora"));
    const adminTemporaryPassword = "Temporal administrativa segura 2026";

    const [ownChange, adminReset] = await Promise.all([
      changeOwnPassword(operatorCookie, password, definitivePassword),
      adminRequest("/admin/users/2/password", adminCookie, {
        method: "POST",
        body: JSON.stringify({ password: adminTemporaryPassword }),
      }),
    ]);

    assert.equal(adminReset.status, 204);
    assert.ok(ownChange.status === 200 || ownChange.status === 401);
    const stored = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(
      await verifyPassword(adminTemporaryPassword, stored.password_hash),
      true,
    );
    assert.equal(
      await verifyPassword(definitivePassword, stored.password_hash),
      false,
    );
    assert.equal(stored.debe_cambiar_password, 1);
    assert.equal(sessions.total, 0);
    if (ownChange.status === 200) {
      assert.equal(
        (await requestWithSession("/auth/me", sessionCookie(ownChange))).status,
        401,
      );
    }
  });
});

describe("política de contraseñas nuevas", () => {
  const boundaryPassword = (length: number): string =>
    `A${"b".repeat(length - 2)}1`;
  const invalidPasswords = [
    "x".repeat(15),
    "x".repeat(129),
    " Frase-larga-y-segura-2026",
    "PASSWORDPASSWORD",
    "a".repeat(16),
    "generar-una-clave-larga-y-aleatoria",
    "generar-otra-clave-larga-y-aleatoria",
    "not-used-for-readonly-command",
    "not-used-by-backup",
    "Frase\ninterna segura 2026",
    "Frase\u0000interna segura 2026",
  ];

  it("rechaza altas inválidas antes de crear o hashear el usuario", async () => {
    const cookie = await adminSession();
    for (const invalidPassword of invalidPasswords) {
      const response = await adminRequest("/admin/users", cookie, {
        method: "POST",
        body: JSON.stringify({
          nombre: "Inválida",
          username: "invalida",
          password: invalidPassword,
          email: "invalida@example.test",
          role_id: 5,
          activo: true,
        }),
      });
      assert.equal(response.status, 400);
      assert.match(
        ((await response.json()) as { error: string }).error,
        /contraseña/i,
      );
    }

    const created = sqlite
      .prepare(
        "SELECT count(*) AS total FROM usuarios WHERE username = 'invalida'",
      )
      .get() as { total: number };
    assert.equal(created.total, 0);
  });

  it("un reset inválido conserva el hash y las sesiones existentes", async () => {
    const operatorResponse = await login("operadora");
    assert.equal(operatorResponse.status, 200);
    const cookie = await adminSession();
    const before = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };

    for (const invalidPassword of invalidPasswords) {
      const response = await adminRequest("/admin/users/2/password", cookie, {
        method: "POST",
        body: JSON.stringify({ password: invalidPassword }),
      });
      assert.equal(response.status, 400);
    }

    const after = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.deepEqual(after, before);
    assert.equal(sessions.total, 1);
  });

  it("revierte hash y flag si no puede revocar las sesiones durante un reset", async () => {
    const operatorResponse = await login("operadora");
    assert.equal(operatorResponse.status, 200);
    const operatorCookie = sessionCookie(operatorResponse);
    const adminCookie = await adminSession();
    const before = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };

    sqlite.exec(`
      CREATE TRIGGER bloquear_revocacion_reset
      BEFORE DELETE ON sesiones
      WHEN OLD.usuario_id = 2
      BEGIN
        SELECT RAISE(ABORT, 'revocación bloqueada por prueba');
      END;
    `);

    let response: Response;
    try {
      response = await adminRequest("/admin/users/2/password", adminCookie, {
        method: "POST",
        body: JSON.stringify({
          password: "Temporal de rollback segura 2026",
        }),
      });
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_revocacion_reset");
    }

    assert.equal(response.status, 500);
    const after = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = 2
      `,
      )
      .get() as { password_hash: string; debe_cambiar_password: number };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.deepEqual(after, before);
    assert.equal(sessions.total, 1);
    assert.equal(
      (await requestWithSession("/auth/me", operatorCookie)).status,
      200,
    );
  });

  it("acepta los límites y espacios interiores", async () => {
    const cookie = await adminSession();
    for (const [index, validPassword] of [
      boundaryPassword(16),
      "Frase interna segura 2026",
      boundaryPassword(128),
    ].entries()) {
      const response = await adminRequest("/admin/users", cookie, {
        method: "POST",
        body: JSON.stringify({
          nombre: `Válida ${index}`,
          username: `valida${index}`,
          password: validPassword,
          email: `valida${index}@example.test`,
          role_id: 5,
          activo: true,
        }),
      });
      assert.equal(response.status, 201);
      const stored = sqlite
        .prepare(
          `
          SELECT password_hash, debe_cambiar_password
          FROM usuarios WHERE username = ?
        `,
        )
        .get(`valida${index}`) as {
        password_hash: string;
        debe_cambiar_password: number;
      };
      assert.equal(
        await verifyPassword(validPassword, stored.password_hash),
        true,
      );
      assert.equal(stored.debe_cambiar_password, 1);
    }
  });

  it("acepta ambos límites también al resetear y revoca la sesión", async () => {
    const cookie = await adminSession();
    let currentPassword = password;

    for (const validPassword of [boundaryPassword(16), boundaryPassword(128)]) {
      const operatorResponse = await login("operadora", currentPassword);
      assert.equal(operatorResponse.status, 200);

      const reset = await adminRequest("/admin/users/2/password", cookie, {
        method: "POST",
        body: JSON.stringify({ password: validPassword }),
      });
      assert.equal(reset.status, 204);

      const stored = sqlite
        .prepare(
          `
          SELECT password_hash, debe_cambiar_password
          FROM usuarios WHERE id = 2
        `,
        )
        .get() as { password_hash: string; debe_cambiar_password: number };
      const sessions = sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
        .get() as { total: number };
      assert.equal(
        await verifyPassword(validPassword, stored.password_hash),
        true,
      );
      assert.equal(stored.debe_cambiar_password, 1);
      assert.equal(sessions.total, 0);
      currentPassword = validPassword;
    }
  });
});

describe("módulo de Rendimiento", () => {
  it("expone solo el estado auditable a SysAdmin y Controller", async () => {
    const withoutSession = await fetch(`${baseUrl}/api/rendimiento`);
    assert.equal(withoutSession.status, 401);

    const sysAdminResponse = await requestWithSession(
      "/api/rendimiento",
      await adminSession(),
    );
    assert.equal(sysAdminResponse.status, 200);
    assert.equal(
      sysAdminResponse.headers.get("cache-control"),
      "private, no-store",
    );
    assert.deepEqual(await sysAdminResponse.json(), {
      modulo: "rendimiento",
      estado: "preparacion",
      vistas: ["resumen_equipo", "personas", "reiteraciones", "calidad_datos"],
    });

    const passwordHash = (
      sqlite
        .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
        .get() as { password_hash: string }
    ).password_hash;
    sqlite
      .prepare(
        `INSERT INTO usuarios
         (id, nombre, username, email, password_hash, debe_cambiar_password, role_id, activo)
         VALUES (4, 'Control', 'controller', 'controller@example.test', ?, 0, 7, 1)`,
      )
      .run(passwordHash);

    const controllerLogin = await login("controller");
    assert.equal(controllerLogin.status, 200);
    const controllerResponse = await requestWithSession(
      "/api/rendimiento",
      sessionCookie(controllerLogin),
    );
    assert.equal(controllerResponse.status, 200);

    const operatorLogin = await login("operadora");
    assert.equal(operatorLogin.status, 200);
    const forbidden = await requestWithSession(
      "/api/rendimiento",
      sessionCookie(operatorLogin),
    );
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), {
      code: "PERFORMANCE_ACCESS_REQUIRED",
      error: "Requiere rol SysAdmin o Controller",
    });
  });
});

describe("catálogo administrativo de roles", () => {
  it("mantiene el subrouter detrás del rol SysAdmin", async () => {
    const sysAdminCookie = await adminSession();
    const comoSysAdmin = await requestWithSession(
      "/admin/roles",
      sysAdminCookie,
    );
    assert.equal(comoSysAdmin.status, 200);

    const operatorLogin = await login("operadora");
    assert.equal(operatorLogin.status, 200);
    const asOperator = await adminRequest(
      "/admin/roles",
      sessionCookie(operatorLogin),
    );
    assert.equal(asOperator.status, 403);
    assert.deepEqual(await asOperator.json(), {
      code: "SYSADMIN_REQUIRED",
      error: "Requiere rol SysAdmin",
    });

    const controllerHash = (
      sqlite
        .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
        .get() as { password_hash: string }
    ).password_hash;
    sqlite
      .prepare(
        `INSERT INTO usuarios
         (id, nombre, username, email, password_hash, debe_cambiar_password, role_id, activo)
         VALUES (4, 'Control', 'controller', 'controller@example.test', ?, 0, 7, 1)`,
      )
      .run(controllerHash);
    const controllerLogin = await login("controller");
    assert.equal(controllerLogin.status, 200);
    const asController = await adminRequest(
      "/admin/roles",
      sessionCookie(controllerLogin),
    );
    assert.equal(asController.status, 403);
    assert.deepEqual(await asController.json(), {
      code: "SYSADMIN_REQUIRED",
      error: "Requiere rol SysAdmin",
    });
  });

  it("conserva el alta y el catálogo filtrado y paginado", async () => {
    const cookie = await adminSession();
    const create = await adminRequest("/admin/roles", cookie, {
      method: "POST",
      body: JSON.stringify({
        nombre: "Cobranza estratégica",
        descripcion: "Atención de acuerdos de cobranza",
        activo: true,
      }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as {
      id: number;
      nombre: string;
      descripcion: string | null;
      activo: boolean;
    };
    assert.equal(created.nombre, "Cobranza estratégica");
    assert.equal(created.descripcion, "Atención de acuerdos de cobranza");
    assert.equal(created.activo, true);

    const catalog = await adminRequest(
      "/admin/roles?search=Cobranza&page=1&limit=1",
      cookie,
    );
    assert.equal(catalog.status, 200);
    const payload = (await catalog.json()) as {
      roles: Array<{ id: number; nombre: string }>;
      total: number;
      page: number;
      limit: number;
    };
    assert.equal(payload.total, 1);
    assert.equal(payload.page, 1);
    assert.equal(payload.limit, 1);
    assert.equal(payload.roles.length, 1);
    assert.equal(payload.roles[0]?.id, created.id);
    assert.equal(payload.roles[0]?.nombre, created.nombre);
  });

  it("busca por nombre o descripción antes de ordenar y paginar", async () => {
    const insertRole = sqlite.prepare(
      `INSERT INTO roles (id, nombre, descripcion, activo)
       VALUES (?, ?, ?, 1)`,
    );
    insertRole.run(101, "Zulu", "Filtro descripcion");
    insertRole.run(102, "Alfa Filtro", "Sin coincidencia");
    insertRole.run(103, "Ajeno", "Externo");
    const cookie = await adminSession();

    const payloads = [];
    for (const page of [1, 2]) {
      const response = await adminRequest(
        `/admin/roles?search=Filtro&page=${page}&limit=1`,
        cookie,
      );
      assert.equal(response.status, 200);
      payloads.push(
        (await response.json()) as {
          roles: Array<{
            id: number;
            nombre: string;
            descripcion: string | null;
          }>;
          total: number;
          page: number;
          limit: number;
        },
      );
    }

    assert.deepEqual(
      payloads.map(({ total, page, limit, roles }) => ({
        total,
        page,
        limit,
        ids: roles.map((role) => role.id),
        nombres: roles.map((role) => role.nombre),
      })),
      [
        {
          total: 2,
          page: 1,
          limit: 1,
          ids: [102],
          nombres: ["Alfa Filtro"],
        },
        {
          total: 2,
          page: 2,
          limit: 1,
          ids: [101],
          nombres: ["Zulu"],
        },
      ],
    );
    for (const { roles } of payloads) assert.equal(roles.length, 1);
  });

  it("rechaza paginación fraccionaria en el catálogo", async () => {
    const cookie = await adminSession();

    for (const query of ["page=1.5", "limit=1.5"]) {
      const response = await adminRequest(`/admin/roles?${query}`, cookie);
      assert.equal(response.status, 400, query);
      assert.deepEqual(
        await response.json(),
        { error: "Invalid pagination params" },
        query,
      );
    }
  });
});

describe("eliminación definitiva de usuarios", () => {
  async function crearDescartable(
    cookie: string,
    username: string,
  ): Promise<number> {
    const creado = await adminRequest("/admin/users", cookie, {
      method: "POST",
      body: JSON.stringify({
        nombre: "Descartable",
        username,
        password: "Clave-descartable-2026",
        email: `${username}@example.test`,
        role_id: 5,
        activo: true,
      }),
    });
    assert.equal(creado.status, 201);
    return ((await creado.json()) as { id: number }).id;
  }

  it("exige las dos aprobaciones antes de borrar", async () => {
    const cookie = await adminSession();
    const id = await crearDescartable(cookie, "a-borrar");

    // Sin confirmar.
    const sinConfirmar = await adminRequest(`/admin/users/${id}`, cookie, {
      method: "DELETE",
      body: JSON.stringify({ username: "a-borrar" }),
    });
    assert.equal(sinConfirmar.status, 400);

    // Confirmado, pero con el nombre de otra persona: no debe borrar por id.
    const nombreDistinto = await adminRequest(`/admin/users/${id}`, cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirmar: true, username: "otra-persona" }),
    });
    assert.equal(nombreDistinto.status, 409);
    assert.equal(
      ((await nombreDistinto.json()) as { code: string }).code,
      "USERNAME_MISMATCH",
    );

    // Sigue existiendo tras los dos rechazos.
    const listado = await adminRequest("/admin/users?limit=100", cookie);
    const { users } = (await listado.json()) as {
      users: Array<{ id: number }>;
    };
    assert.ok(users.some((usuario) => usuario.id === id));

    // Con ambas aprobaciones sí borra.
    const borrado = await adminRequest(`/admin/users/${id}`, cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirmar: true, username: "a-borrar" }),
    });
    assert.equal(borrado.status, 204);

    const despues = await adminRequest("/admin/users?limit=100", cookie);
    const listaFinal = (await despues.json()) as {
      users: Array<{ id: number }>;
    };
    assert.equal(
      listaFinal.users.some((usuario) => usuario.id === id),
      false,
    );
  });

  it("cierra la sesión de la persona eliminada", async () => {
    const cookie = await adminSession();
    const id = await crearDescartable(cookie, "con-sesion");

    const suLogin = await login("con-sesion", "Clave-descartable-2026");
    assert.equal(suLogin.status, 200);
    const suCookie = sessionCookie(suLogin);
    assert.equal((await requestWithSession("/auth/me", suCookie)).status, 200);

    const borrado = await adminRequest(`/admin/users/${id}`, cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirmar: true, username: "con-sesion" }),
    });
    assert.equal(borrado.status, 204);

    assert.equal((await requestWithSession("/auth/me", suCookie)).status, 401);
  });

  it("nunca borra la cuenta propia ni el último SysAdmin utilizable", async () => {
    const cookie = await adminSession();
    const yo = await requestWithSession("/auth/me", cookie);
    const { id: miId } = (await yo.json()) as { id: number };

    const propia = await adminRequest(`/admin/users/${miId}`, cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirmar: true, username: "sysadmin" }),
    });
    assert.equal(propia.status, 409);
    assert.equal(
      ((await propia.json()) as { code: string }).code,
      "SELF_DELETE_FORBIDDEN",
    );

    // Sigue pudiendo entrar después del rechazo.
    assert.equal((await requestWithSession("/auth/me", cookie)).status, 200);
  });

  it("rechaza a un Operador y responde 404 para un id inexistente", async () => {
    const operatorLogin = await login("operadora");
    const comoOperador = await adminRequest(
      "/admin/users/1",
      sessionCookie(operatorLogin),
      {
        method: "DELETE",
        body: JSON.stringify({ confirmar: true, username: "sysadmin" }),
      },
    );
    assert.equal(comoOperador.status, 403);

    const cookie = await adminSession();
    const inexistente = await adminRequest("/admin/users/999999", cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirmar: true, username: "fantasma" }),
    });
    assert.equal(inexistente.status, 404);
  });
});

describe("catálogo administrativo de usuarios", () => {
  it("conserva el guard padre y expone el listado sin hashes", async () => {
    const sysAdminCookie = await adminSession();
    const comoSysAdmin = await requestWithSession(
      "/admin/users",
      sysAdminCookie,
    );
    assert.equal(comoSysAdmin.status, 200);

    const operatorLogin = await login("operadora");
    assert.equal(operatorLogin.status, 200);
    const asOperator = await adminRequest(
      "/admin/users",
      sessionCookie(operatorLogin),
    );
    assert.equal(asOperator.status, 403);
    assert.deepEqual(await asOperator.json(), {
      code: "SYSADMIN_REQUIRED",
      error: "Requiere rol SysAdmin",
    });

    const catalog = await adminRequest(
      "/admin/users?page=1&limit=20",
      sysAdminCookie,
    );
    assert.equal(catalog.status, 200);
    const payload = (await catalog.json()) as {
      users: Array<Record<string, unknown>>;
      total: number;
      page: number;
      limit: number;
    };
    assert.equal(payload.page, 1);
    assert.equal(payload.limit, 20);
    assert.ok(payload.total > 0);
    assert.ok(payload.users.length > 0);
    for (const user of payload.users) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(user, "password_hash"),
        false,
      );
    }
  });

  it("combina filtros antes de paginar y conserva el orden estable", async () => {
    const insertUser = sqlite.prepare(
      `INSERT INTO usuarios
       (id, nombre, apellido, username, email, password_hash,
        debe_cambiar_password, role_id, activo)
       VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
    );
    insertUser.run(
      101,
      "Filtro",
      "Zulu",
      "filtro-zulu",
      "filtro-zulu@example.test",
      5,
      0,
    );
    insertUser.run(
      102,
      "Filtro",
      "Alfa",
      "filtro-alfa",
      "filtro-alfa@example.test",
      5,
      0,
    );
    insertUser.run(
      103,
      "Filtro",
      "Otro rol",
      "filtro-otro-rol",
      "filtro-otro-rol@example.test",
      2,
      0,
    );
    insertUser.run(
      104,
      "Filtro",
      "Activo",
      "filtro-activo",
      "filtro-activo@example.test",
      5,
      1,
    );
    insertUser.run(
      105,
      "Ajeno",
      "Externo",
      "ajeno",
      "ajeno@example.test",
      5,
      0,
    );
    const cookie = await adminSession();

    const payloads = [];
    for (const page of [1, 2]) {
      const response = await adminRequest(
        `/admin/users?search=Filtro&role_id=5&activo=false&page=${page}&limit=1`,
        cookie,
      );
      assert.equal(response.status, 200);
      payloads.push(
        (await response.json()) as {
          users: Array<Record<string, unknown>>;
          total: number;
          page: number;
          limit: number;
        },
      );
    }

    assert.deepEqual(
      payloads.map(({ total, page, limit, users }) => ({
        total,
        page,
        limit,
        ids: users.map((user) => user.id),
        apellidos: users.map((user) => user.apellido),
      })),
      [
        { total: 2, page: 1, limit: 1, ids: [102], apellidos: ["Alfa"] },
        { total: 2, page: 2, limit: 1, ids: [101], apellidos: ["Zulu"] },
      ],
    );
    for (const { users } of payloads) {
      assert.equal(users.length, 1);
      assert.equal(users[0]?.role_id, 5);
      assert.equal(users[0]?.activo, false);
      assert.equal(
        Object.prototype.hasOwnProperty.call(users[0], "password_hash"),
        false,
      );
    }
  });

  it("rechaza booleanos y enteros inválidos en el catálogo", async () => {
    const cookie = await adminSession();

    for (const query of ["activo=0", "role_id=1.5", "page=1.5", "limit=1.5"]) {
      const response = await adminRequest(`/admin/users?${query}`, cookie);
      assert.equal(response.status, 400, query);
      assert.deepEqual(
        await response.json(),
        { error: "Invalid query params" },
        query,
      );
    }
  });

  it("rechaza resets con usuario inválido o inexistente sin mutar credenciales", async () => {
    const operatorLogin = await login("operadora");
    assert.equal(operatorLogin.status, 200);
    sessionCookie(operatorLogin);
    const cookie = await adminSession();
    const readAccount = () =>
      sqlite
        .prepare(
          `SELECT password_hash, debe_cambiar_password,
                  (SELECT count(*) FROM sesiones WHERE usuario_id = 2) AS sesiones
           FROM usuarios WHERE id = 2`,
        )
        .get() as {
        password_hash: string;
        debe_cambiar_password: number;
        sesiones: number;
      };
    const before = readAccount();
    assert.equal(before.sesiones, 1);

    for (const [path, status] of [
      ["/admin/users/no-es-id/password", 400],
      ["/admin/users/999/password", 404],
    ] as const) {
      const response = await adminRequest(path, cookie, {
        method: "POST",
        body: JSON.stringify({ password: "Temporal inexistente segura 2026" }),
      });
      assert.equal(response.status, status, path);
    }

    assert.deepEqual(readAccount(), before);
  });
});

describe("roles base protegidos", () => {
  it("impide renombrar, desactivar o eliminar cada rol del sistema", async () => {
    const cookie = await adminSession();

    for (const id of [1, 2, 3, 7]) {
      const rename = await adminRequest(`/admin/roles/${id}`, cookie, {
        method: "PATCH",
        body: JSON.stringify({ nombre: `Renombrado ${id}` }),
      });
      assert.equal(rename.status, 409);

      const deactivate = await adminRequest(`/admin/roles/${id}`, cookie, {
        method: "PATCH",
        body: JSON.stringify({ activo: false }),
      });
      assert.equal(deactivate.status, 409);

      const remove = await adminRequest(`/admin/roles/${id}`, cookie, {
        method: "DELETE",
      });
      assert.equal(remove.status, 409);
    }

    const roles = sqlite
      .prepare(
        "SELECT nombre, activo FROM roles WHERE id IN (1, 2, 3, 7) ORDER BY id",
      )
      .all();
    assert.deepEqual(roles, [
      { nombre: "SysAdmin", activo: 1 },
      { nombre: "Administrador", activo: 1 },
      { nombre: "Operador", activo: 1 },
      { nombre: "Controller", activo: 1 },
    ]);
  });

  it("reserva sus nombres sin distinguir mayúsculas", async () => {
    const cookie = await adminSession();
    const create = await adminRequest("/admin/roles", cookie, {
      method: "POST",
      body: JSON.stringify({ nombre: " controller ", activo: true }),
    });
    assert.equal(create.status, 409);

    const rename = await adminRequest("/admin/roles/5", cookie, {
      method: "PATCH",
      body: JSON.stringify({ nombre: "CoNtRoLlEr" }),
    });
    assert.equal(rename.status, 409);
  });

  it("permite reparar un alias histórico no canónico", async () => {
    sqlite
      .prepare(
        "INSERT INTO roles (id, nombre, activo) VALUES (6, 'sysadmin', 1)",
      )
      .run();
    const cookie = await adminSession();

    const rename = await adminRequest("/admin/roles/6", cookie, {
      method: "PATCH",
      body: JSON.stringify({ nombre: "Perfil histórico reparado" }),
    });
    assert.equal(rename.status, 200);
    const remove = await adminRequest("/admin/roles/6", cookie, {
      method: "DELETE",
    });
    assert.equal(remove.status, 204);
  });

  it("conserva el CRUD de roles personalizados", async () => {
    const cookie = await adminSession();
    const update = await adminRequest("/admin/roles/5", cookie, {
      method: "PATCH",
      body: JSON.stringify({
        nombre: "Mesa temporal",
        descripcion: "Rol de prueba",
        activo: false,
      }),
    });
    assert.equal(update.status, 200);

    sqlite.prepare("UPDATE usuarios SET role_id = 2 WHERE id = 2").run();
    const remove = await adminRequest("/admin/roles/5", cookie, {
      method: "DELETE",
    });
    assert.equal(remove.status, 204);
  });
});

describe("roles inactivos", () => {
  it("rechaza el login aunque el usuario y la contraseña sean válidos", async () => {
    const response = await login("rolinactivo");
    assert.equal(response.status, 401);
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 3")
      .get() as {
      total: number;
    };
    assert.equal(sessions.total, 0);
  });

  it("revoca una sesión existente cuando se desactiva su rol", async () => {
    const operatorLogin = await login("operadora");
    assert.equal(operatorLogin.status, 200);
    const operatorCookie = sessionCookie(operatorLogin);
    const cookie = await adminSession();

    const deactivate = await adminRequest("/admin/roles/5", cookie, {
      method: "PATCH",
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(deactivate.status, 200);

    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as {
      total: number;
    };
    assert.equal(sessions.total, 0);

    const reactivate = await adminRequest("/admin/roles/5", cookie, {
      method: "PATCH",
      body: JSON.stringify({ activo: true }),
    });
    assert.equal(reactivate.status, 200);
    const me = await requestWithSession("/auth/me", operatorCookie);
    assert.equal(me.status, 401, "reactivar el rol no debe revivir la cookie");
  });

  it("impide crear o mover usuarios hacia un rol inactivo", async () => {
    const cookie = await adminSession();
    const create = await adminRequest("/admin/users", cookie, {
      method: "POST",
      body: JSON.stringify({
        nombre: "Nueva",
        username: "nueva",
        password,
        email: "nueva@example.test",
        role_id: 4,
        activo: true,
      }),
    });
    assert.equal(create.status, 409);

    const update = await adminRequest("/admin/users/2", cookie, {
      method: "PATCH",
      body: JSON.stringify({ role_id: 4 }),
    });
    assert.equal(update.status, 409);
    const user = sqlite
      .prepare("SELECT role_id FROM usuarios WHERE id = 2")
      .get() as { role_id: number };
    assert.equal(user.role_id, 5);
  });
});

describe("cambios de rol de usuario", () => {
  it("revoca sus sesiones y cierra su SSE al cambiar realmente de rol", async () => {
    const operatorCookie = sessionCookie(await login("operadora"));
    const secondOperatorCookie = sessionCookie(await login("operadora"));
    const stream = await requestWithSession("/api/events", operatorCookie);
    assert.equal(stream.status, 200);
    assert.ok(stream.body);
    const reader = stream.body.getReader();

    try {
      const initial = await reader.read();
      assert.equal(initial.done, false);

      const adminCookie = await adminSession();
      const changed = await adminRequest("/admin/users/2", adminCookie, {
        method: "PATCH",
        body: JSON.stringify({ role_id: 2 }),
      });
      assert.equal(changed.status, 200);

      const user = sqlite
        .prepare("SELECT role_id FROM usuarios WHERE id = 2")
        .get() as { role_id: number };
      assert.equal(user.role_id, 2);

      const sessions = sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
        .get() as { total: number };
      assert.equal(sessions.total, 0);

      const terminalPayload = await readStreamUntilClosed(
        reader,
        "el SSE siguió abierto tras cambiar el rol",
      );
      assert.match(terminalPayload, /"tipo":"sesion_revocada"/);
      assert.equal(
        (await requestWithSession("/auth/me", operatorCookie)).status,
        401,
      );
      assert.equal(
        (await requestWithSession("/auth/me", secondOperatorCookie)).status,
        401,
      );
    } finally {
      await reader.cancel();
    }
  });

  it("conserva la sesion cuando role_id no cambia", async () => {
    const operatorCookie = sessionCookie(await login("operadora"));
    const adminCookie = await adminSession();

    const unchanged = await adminRequest("/admin/users/2", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ role_id: 5 }),
    });
    assert.equal(unchanged.status, 200);

    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(sessions.total, 1);
    assert.equal(
      (await requestWithSession("/auth/me", operatorCookie)).status,
      200,
    );
  });

  it("revierte el rol si no puede revocar las sesiones", async () => {
    const operatorCookie = sessionCookie(await login("operadora"));
    const adminCookie = await adminSession();
    sqlite.exec(`
      CREATE TRIGGER bloquear_revocacion_por_rol
      BEFORE DELETE ON sesiones
      WHEN OLD.usuario_id = 2
      BEGIN
        SELECT RAISE(ABORT, 'fallo de revocacion forzado');
      END;
    `);

    try {
      const changed = await adminRequest("/admin/users/2", adminCookie, {
        method: "PATCH",
        body: JSON.stringify({ role_id: 2 }),
      });
      assert.equal(changed.status, 500);
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_revocacion_por_rol");
    }

    const user = sqlite
      .prepare("SELECT role_id FROM usuarios WHERE id = 2")
      .get() as { role_id: number };
    assert.equal(user.role_id, 5);
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 2")
      .get() as { total: number };
    assert.equal(sessions.total, 1);
    assert.equal(
      (await requestWithSession("/auth/me", operatorCookie)).status,
      200,
    );
  });
});

describe("último SysAdmin autenticable", () => {
  it("impide desactivarlo o degradarlo", async () => {
    const cookie = await adminSession();
    for (const data of [{ activo: false }, { role_id: 2 }]) {
      const response = await adminRequest("/admin/users/1", cookie, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      assert.equal(response.status, 409);
    }

    const user = sqlite
      .prepare("SELECT activo, role_id FROM usuarios WHERE id = 1")
      .get();
    assert.deepEqual(user, { activo: 1, role_id: 1 });
  });

  it("no cuenta un reemplazo sin contraseña utilizable", async () => {
    sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id, activo)
         VALUES ('Sin clave', 'sinclave', 'sinclave@example.test', NULL, 0, 1, 1)`,
      )
      .run();
    const cookie = await adminSession();
    const response = await adminRequest("/admin/users/1", cookie, {
      method: "PATCH",
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(response.status, 409);

    sqlite
      .prepare(
        "UPDATE usuarios SET password_hash = 'hash-invalido' WHERE username = 'sinclave'",
      )
      .run();
    const malformed = await adminRequest("/admin/users/1", cookie, {
      method: "PATCH",
      body: JSON.stringify({ role_id: 2 }),
    });
    assert.equal(malformed.status, 409);
  });

  it("permite desactivar uno cuando queda otro SysAdmin utilizable", async () => {
    const backupHash = await hashPassword(password);
    sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id, activo)
         VALUES ('Respaldo', 'respaldo', 'respaldo@example.test', ?, 0, 1, 1)`,
      )
      .run(backupHash);
    const cookie = await adminSession();
    const response = await adminRequest("/admin/users/1", cookie, {
      method: "PATCH",
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(response.status, 200);

    const user = sqlite
      .prepare("SELECT activo FROM usuarios WHERE id = 1")
      .get() as { activo: number };
    assert.equal(user.activo, 0);
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 1")
      .get() as {
      total: number;
    };
    assert.equal(sessions.total, 0);
  });
});
