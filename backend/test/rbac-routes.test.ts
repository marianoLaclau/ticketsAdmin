import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "backend-rbac-tests");
const databasePath = join(testDirectory, `rbac-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.ADMIN_API_KEY = "rbac-admin-key";
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
  { requireSession },
  { hashPassword, needsPasswordRehash, verifyPassword },
  { sqlite },
] = await Promise.all([
  import("../src/routes/auth.ts"),
  import("../src/routes/admin.ts"),
  import("../src/lib/auth.ts"),
  import("../src/lib/passwords.ts"),
  import("@workspace/db"),
]);

const password = "Clave-RBAC-2026-segura";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
app.use(requireSession);
app.use(adminRouter);
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

async function login(usuario: string): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, password }),
  });
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "el login debe devolver la cookie de sesión");
  return header.split(";", 1)[0];
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
  const headers = new Headers(init.headers);
  headers.set("x-admin-key", "rbac-admin-key");
  return requestWithSession(path, cookie, { ...init, headers });
}

beforeEach(async () => {
  const passwordHash = await hashPassword(password);
  sqlite.exec("DELETE FROM sesiones; DELETE FROM usuarios; DELETE FROM roles;");
  sqlite
    .prepare(
      `INSERT INTO roles (id, nombre, activo) VALUES
       (1, 'SysAdmin', 1),
       (2, 'Administrador', 1),
       (3, 'Operador', 1),
       (4, 'Rol inactivo', 0),
       (5, 'Mesa personalizada', 1)`,
    )
    .run();
  const insertUser = sqlite.prepare(
    `INSERT INTO usuarios
     (id, nombre, username, email, password_hash, role_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  it("rehasea el formato legado después de un login correcto", async () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    sqlite
      .prepare("UPDATE usuarios SET password_hash = ? WHERE id = 1")
      .run(legacy);

    const response = await login("sysadmin");
    assert.equal(response.status, 200);
    const stored = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
      .get() as { password_hash: string };
    assert.notEqual(stored.password_hash, legacy);
    assert.equal(needsPasswordRehash(stored.password_hash), false);
    assert.equal(await verifyPassword(password, stored.password_hash), true);
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

    const stored = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = 1")
      .get() as { password_hash: string };
    const sessions = sqlite
      .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = 1")
      .get() as { total: number };
    assert.equal(needsPasswordRehash(stored.password_hash), false);
    assert.equal(await verifyPassword(password, stored.password_hash), true);
    assert.equal(sessions.total, 2);
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
});

describe("roles base protegidos", () => {
  it("impide renombrar, desactivar o eliminar cada rol del sistema", async () => {
    const cookie = await adminSession();

    for (const id of [1, 2, 3]) {
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
      .prepare("SELECT nombre, activo FROM roles WHERE id <= 3 ORDER BY id")
      .all();
    assert.deepEqual(roles, [
      { nombre: "SysAdmin", activo: 1 },
      { nombre: "Administrador", activo: 1 },
      { nombre: "Operador", activo: 1 },
    ]);
  });

  it("reserva sus nombres sin distinguir mayúsculas", async () => {
    const cookie = await adminSession();
    const create = await adminRequest("/admin/roles", cookie, {
      method: "POST",
      body: JSON.stringify({ nombre: " sysadmin ", activo: true }),
    });
    assert.equal(create.status, 409);

    const rename = await adminRequest("/admin/roles/5", cookie, {
      method: "PATCH",
      body: JSON.stringify({ nombre: "oPeRaDoR" }),
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
         (nombre, username, email, password_hash, role_id, activo)
         VALUES ('Sin clave', 'sinclave', 'sinclave@example.test', NULL, 1, 1)`,
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
         (nombre, username, email, password_hash, role_id, activo)
         VALUES ('Respaldo', 'respaldo', 'respaldo@example.test', ?, 1, 1)`,
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
