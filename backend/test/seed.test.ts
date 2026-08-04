import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const testDirectory = join(process.cwd(), "tmp", "backend-seed-tests");
const databasePath = join(testDirectory, `seed-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.NODE_ENV = "test";

const bootstrap = new Database(databasePath);
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

const [{ ensureAdminSeed }, { sqlite }, { hashPassword, verifyPassword }] =
  await Promise.all([
    import("../src/lib/seed.ts"),
    import("@workspace/db"),
    import("../src/lib/passwords.ts"),
  ]);

const passwordInicial = "Bootstrap-2026-muy-seguro";
const passwordDiferente = "Otra-clave-2026-muy-segura";
const passwordHeredado = "admin";

function crearSeedHeredado(email = "sysadmin") {
  const roleExistente = sqlite
    .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
    .get() as { id: number } | undefined;
  const roleId = roleExistente
    ? roleExistente.id
    : Number(
        sqlite.prepare("INSERT INTO roles (nombre) VALUES ('SysAdmin')").run()
          .lastInsertRowid,
      );
  const passwordHash = hashPassword(passwordHeredado);
  const usuario = sqlite
    .prepare(
      `INSERT INTO usuarios
       (nombre, username, email, password_hash, role_id)
       VALUES ('SysAdmin', ?, ?, ?, ?)`,
    )
    .run(email === "sysadmin" ? "sysadmin" : null, email, passwordHash, roleId);
  sqlite
    .prepare(
      `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
       VALUES (?, ?, ?)`,
    )
    .run(
      `sesion-heredada-${email}`,
      usuario.lastInsertRowid,
      Date.now() + 60_000,
    );

  return {
    id: Number(usuario.lastInsertRowid),
    passwordHash,
  };
}

beforeEach(() => {
  delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
  sqlite.exec("DELETE FROM sesiones; DELETE FROM usuarios; DELETE FROM roles;");
});

after(() => {
  delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
  sqlite.close();
  rmSync(databasePath, { force: true });
});

describe("bootstrap seguro del SysAdmin", () => {
  it("rechaza una base nueva sin secreto antes de crear filas", async () => {
    await assert.rejects(
      ensureAdminSeed(),
      /BOOTSTRAP_SYSADMIN_PASSWORD es obligatoria/,
    );

    const roles = sqlite
      .prepare("SELECT count(*) AS total FROM roles")
      .get() as {
      total: number;
    };
    const usuarios = sqlite
      .prepare("SELECT count(*) AS total FROM usuarios")
      .get() as { total: number };
    assert.equal(roles.total, 0);
    assert.equal(usuarios.total, 0);
  });

  it("rechaza secretos débiles, conocidos o con espacios exteriores", async () => {
    for (const password of [
      "demasiado-corta",
      "passwordpassword",
      "generar-una-clave-inicial-larga-y-unica",
      " password-largo-pero-invalido ",
    ]) {
      process.env.BOOTSTRAP_SYSADMIN_PASSWORD = password;
      await assert.rejects(ensureAdminSeed(), /BOOTSTRAP_SYSADMIN_PASSWORD/);
    }

    const usuarios = sqlite
      .prepare("SELECT count(*) AS total FROM usuarios")
      .get() as { total: number };
    assert.equal(usuarios.total, 0);
  });

  it("crea el SysAdmin con el secreto externo y guarda solo su hash", async () => {
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();

    const usuario = sqlite
      .prepare(
        `SELECT u.username, u.email, u.password_hash, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.role_id
         WHERE u.username = 'sysadmin'`,
      )
      .get() as {
      username: string;
      email: string;
      password_hash: string;
      rol: string;
    };

    assert.equal(usuario.email, "sysadmin");
    assert.equal(usuario.rol, "SysAdmin");
    assert.notEqual(usuario.password_hash, passwordInicial);
    assert.equal(verifyPassword(passwordInicial, usuario.password_hash), true);
  });

  it("no exige la variable ni sobrescribe una credencial existente", async () => {
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();

    const anterior = sqlite
      .prepare(
        "SELECT id, password_hash FROM usuarios WHERE username = 'sysadmin'",
      )
      .get() as { id: number; password_hash: string };

    delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
    await ensureAdminSeed();

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordDiferente;
    await ensureAdminSeed();

    const actual = sqlite
      .prepare(
        "SELECT id, password_hash FROM usuarios WHERE username = 'sysadmin'",
      )
      .get() as { id: number; password_hash: string };
    assert.deepEqual(actual, anterior);
    assert.equal(verifyPassword(passwordInicial, actual.password_hash), true);
    assert.equal(
      verifyPassword(passwordDiferente, actual.password_hash),
      false,
    );
  });

  it("exige el secreto para una credencial semilla heredada", async () => {
    const heredado = crearSeedHeredado();

    await assert.rejects(
      ensureAdminSeed(),
      /BOOTSTRAP_SYSADMIN_PASSWORD es obligatoria/,
    );

    const actual = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(heredado.id) as { password_hash: string };
    assert.equal(actual.password_hash, heredado.passwordHash);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(heredado.id)!.total,
      1,
    );
  });

  it("rota la credencial heredada, revoca solo sus sesiones y es idempotente", async () => {
    const heredado = crearSeedHeredado("admin");
    const roleId = sqlite
      .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
      .get()!.id;
    const otroHash = hashPassword("Operador-2026-clave-segura");
    const otroUsuario = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, role_id)
         VALUES ('Otra', 'otra', 'otra@example.test', ?, ?)`,
      )
      .run(otroHash, roleId);
    sqlite
      .prepare(
        `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
         VALUES ('sesion-otra', ?, ?)`,
      )
      .run(otroUsuario.lastInsertRowid, Date.now() + 60_000);

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();

    const rotado = sqlite
      .prepare(
        "SELECT username, email, password_hash FROM usuarios WHERE id = ?",
      )
      .get(heredado.id) as {
      username: string;
      email: string;
      password_hash: string;
    };
    assert.equal(rotado.username, "sysadmin");
    assert.equal(rotado.email, "sysadmin");
    assert.equal(verifyPassword(passwordHeredado, rotado.password_hash), false);
    assert.equal(verifyPassword(passwordInicial, rotado.password_hash), true);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(heredado.id)!.total,
      0,
    );
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(otroUsuario.lastInsertRowid)!.total,
      1,
    );

    const hashRotado = rotado.password_hash;
    delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
    await ensureAdminSeed();
    const segundaEjecucion = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(heredado.id) as { password_hash: string };
    assert.equal(segundaEjecucion.password_hash, hashRotado);
  });

  it("asegura el admin histórico aunque coexista con un sysadmin seguro", async () => {
    const heredado = crearSeedHeredado("admin");
    const roleId = sqlite
      .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
      .get()!.id;
    const hashSeguro = hashPassword(passwordDiferente);
    const sysadminSeguro = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, role_id)
         VALUES ('SysAdmin seguro', 'sysadmin', 'sysadmin', ?, ?)`,
      )
      .run(hashSeguro, roleId);
    sqlite
      .prepare(
        `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
         VALUES ('sesion-sysadmin-seguro', ?, ?)`,
      )
      .run(sysadminSeguro.lastInsertRowid, Date.now() + 60_000);

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();

    const hashHeredadoRotado = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(heredado.id)!.password_hash;
    const hashSeguroActual = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(sysadminSeguro.lastInsertRowid)!.password_hash;
    assert.equal(verifyPassword(passwordInicial, hashHeredadoRotado), true);
    assert.equal(hashSeguroActual, hashSeguro);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(heredado.id)!.total,
      0,
    );
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(sysadminSeguro.lastInsertRowid)!.total,
      1,
    );
  });

  it("rota todas las identidades heredadas que coexisten", async () => {
    const admin = crearSeedHeredado("admin");
    const sysadmin = crearSeedHeredado("sysadmin");
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;

    await ensureAdminSeed();

    const hashes = [admin.id, sysadmin.id].map(
      (id) =>
        sqlite
          .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
          .get(id)!.password_hash,
    );
    assert.equal(verifyPassword(passwordInicial, hashes[0]), true);
    assert.equal(verifyPassword(passwordInicial, hashes[1]), true);
    assert.notEqual(
      hashes[0],
      hashes[1],
      "cada cuenta debe recibir una sal única",
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS total FROM sesiones").get()!.total,
      0,
    );
  });

  it("revierte el hash si no puede revocar las sesiones", async () => {
    const heredado = crearSeedHeredado();
    sqlite.exec(`
      CREATE TRIGGER bloquear_revocacion
      BEFORE DELETE ON sesiones
      WHEN OLD.usuario_id = ${heredado.id}
      BEGIN
        SELECT RAISE(ABORT, 'fallo de revocacion simulado');
      END;
    `);

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    try {
      await assert.rejects(ensureAdminSeed(), /fallo de revocacion simulado/);
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_revocacion");
    }

    const actual = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(heredado.id) as { password_hash: string };
    assert.equal(actual.password_hash, heredado.passwordHash);
    assert.equal(verifyPassword(passwordHeredado, actual.password_hash), true);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(heredado.id)!.total,
      1,
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS total FROM roles").get()!.total,
      1,
    );
  });

  it("revierte los roles si falla el alta inicial", async () => {
    sqlite.exec(`
      CREATE TRIGGER bloquear_alta
      BEFORE INSERT ON usuarios
      BEGIN
        SELECT RAISE(ABORT, 'fallo de alta simulado');
      END;
    `);
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;

    try {
      await assert.rejects(ensureAdminSeed(), /fallo de alta simulado/);
    } finally {
      sqlite.exec("DROP TRIGGER bloquear_alta");
    }

    assert.equal(
      sqlite.prepare("SELECT count(*) AS total FROM roles").get()!.total,
      0,
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS total FROM usuarios").get()!.total,
      0,
    );
  });
});
