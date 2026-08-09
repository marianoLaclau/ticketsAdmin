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
    admin_elevacion_hasta INTEGER,
    admin_elevacion_clave_hash TEXT,
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

async function crearSeedHeredado(email = "sysadmin") {
  const roleExistente = sqlite
    .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
    .get() as { id: number } | undefined;
  const roleId = roleExistente
    ? roleExistente.id
    : Number(
        sqlite.prepare("INSERT INTO roles (nombre) VALUES ('SysAdmin')").run()
          .lastInsertRowid,
      );
  const passwordHash = await hashPassword(passwordHeredado);
  const usuario = sqlite
    .prepare(
      `INSERT INTO usuarios
       (nombre, username, email, password_hash, debe_cambiar_password, role_id)
       VALUES ('SysAdmin', ?, ?, ?, 0, ?)`,
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
      "a".repeat(16),
      "generar-una-clave-larga-y-aleatoria",
      "generar-otra-clave-larga-y-aleatoria",
      "generar-una-clave-inicial-larga-y-unica",
      "not-used-for-readonly-command",
      "not-used-by-backup",
      " password-largo-pero-invalido ",
      "x".repeat(129),
      "password-largo-pero-invalido\u00a0",
      "password\ninterno-invalido-2026",
      "password\u0000interno-invalido-2026",
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
        `SELECT u.username, u.email, u.password_hash,
                u.debe_cambiar_password, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.role_id
         WHERE u.username = 'sysadmin'`,
      )
      .get() as {
      username: string;
      email: string;
      password_hash: string;
      debe_cambiar_password: number;
      rol: string;
    };

    assert.equal(usuario.email, "sysadmin");
    assert.equal(usuario.rol, "SysAdmin");
    assert.equal(usuario.debe_cambiar_password, 1);
    assert.notEqual(usuario.password_hash, passwordInicial);
    assert.equal(
      await verifyPassword(passwordInicial, usuario.password_hash),
      true,
    );
  });

  it("no exige la variable ni sobrescribe una credencial existente", async () => {
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();
    sqlite
      .prepare(
        `
        UPDATE usuarios SET debe_cambiar_password = 0
        WHERE username = 'sysadmin'
      `,
      )
      .run();

    const anterior = sqlite
      .prepare(
        `SELECT id, password_hash, debe_cambiar_password
         FROM usuarios WHERE username = 'sysadmin'`,
      )
      .get() as {
      id: number;
      password_hash: string;
      debe_cambiar_password: number;
    };

    delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
    await ensureAdminSeed();

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordDiferente;
    await ensureAdminSeed();

    const actual = sqlite
      .prepare(
        `SELECT id, password_hash, debe_cambiar_password
         FROM usuarios WHERE username = 'sysadmin'`,
      )
      .get() as {
      id: number;
      password_hash: string;
      debe_cambiar_password: number;
    };
    assert.deepEqual(actual, anterior);
    assert.equal(
      await verifyPassword(passwordInicial, actual.password_hash),
      true,
    );
    assert.equal(
      await verifyPassword(passwordDiferente, actual.password_hash),
      false,
    );
  });

  it("exige el secreto para una credencial semilla heredada", async () => {
    const heredado = await crearSeedHeredado();

    await assert.rejects(
      ensureAdminSeed(),
      /BOOTSTRAP_SYSADMIN_PASSWORD es obligatoria/,
    );

    const actual = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = ?
      `,
      )
      .get(heredado.id) as {
      password_hash: string;
      debe_cambiar_password: number;
    };
    assert.equal(actual.password_hash, heredado.passwordHash);
    assert.equal(actual.debe_cambiar_password, 0);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(heredado.id)!.total,
      1,
    );
  });

  it("rota la credencial heredada, revoca solo sus sesiones y es idempotente", async () => {
    const heredado = await crearSeedHeredado("admin");
    const roleId = sqlite
      .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
      .get()!.id;
    const otroHash = await hashPassword("Operador-2026-clave-segura");
    const otroUsuario = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id)
         VALUES ('Otra', 'otra', 'otra@example.test', ?, 0, ?)`,
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
        `SELECT username, email, password_hash, debe_cambiar_password
         FROM usuarios WHERE id = ?`,
      )
      .get(heredado.id) as {
      username: string;
      email: string;
      password_hash: string;
      debe_cambiar_password: number;
    };
    assert.equal(rotado.username, "sysadmin");
    assert.equal(rotado.email, "sysadmin");
    assert.equal(rotado.debe_cambiar_password, 1);
    assert.equal(
      await verifyPassword(passwordHeredado, rotado.password_hash),
      false,
    );
    assert.equal(
      await verifyPassword(passwordInicial, rotado.password_hash),
      true,
    );
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
    sqlite
      .prepare("UPDATE usuarios SET debe_cambiar_password = 0 WHERE id = ?")
      .run(heredado.id);
    delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;
    await ensureAdminSeed();
    const segundaEjecucion = sqlite
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = ?
      `,
      )
      .get(heredado.id) as {
      password_hash: string;
      debe_cambiar_password: number;
    };
    assert.equal(segundaEjecucion.password_hash, hashRotado);
    assert.equal(segundaEjecucion.debe_cambiar_password, 0);
  });

  it("rota un admin heredado sin promoverlo cuando ya existe el sysadmin canónico", async () => {
    const heredado = await crearSeedHeredado("admin");
    const roleId = sqlite
      .prepare("SELECT id FROM roles WHERE nombre = 'SysAdmin'")
      .get()!.id;
    const operadorRoleId = Number(
      sqlite.prepare("INSERT INTO roles (nombre) VALUES ('Operador')").run()
        .lastInsertRowid,
    );
    sqlite
      .prepare("UPDATE usuarios SET role_id = ? WHERE id = ?")
      .run(operadorRoleId, heredado.id);
    const hashSeguro = await hashPassword(passwordDiferente);
    const sysadminSeguro = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id)
         VALUES ('SysAdmin seguro', 'sysadmin', 'sysadmin', ?, 0, ?)`,
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

    const adminRotado = sqlite
      .prepare(
        `SELECT u.password_hash, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ?`,
      )
      .get(heredado.id) as { password_hash: string; rol: string };
    const hashSeguroActual = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE id = ?")
      .get(sysadminSeguro.lastInsertRowid)!.password_hash;
    assert.equal(
      await verifyPassword(passwordInicial, adminRotado.password_hash),
      true,
    );
    assert.equal(adminRotado.rol, "Operador");
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
    const admin = await crearSeedHeredado("admin");
    const sysadmin = await crearSeedHeredado("sysadmin");
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;

    await ensureAdminSeed();

    const rows = [admin.id, sysadmin.id].map(
      (id) =>
        sqlite
          .prepare(
            `
            SELECT password_hash, debe_cambiar_password
            FROM usuarios WHERE id = ?
          `,
          )
          .get(id) as {
          password_hash: string;
          debe_cambiar_password: number;
        },
    );
    assert.equal(
      await verifyPassword(passwordInicial, rows[0].password_hash),
      true,
    );
    assert.equal(
      await verifyPassword(passwordInicial, rows[1].password_hash),
      true,
    );
    assert.equal(rows[0].debe_cambiar_password, 1);
    assert.equal(rows[1].debe_cambiar_password, 1);
    assert.notEqual(
      rows[0].password_hash,
      rows[1].password_hash,
      "cada cuenta debe recibir una sal única",
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS total FROM sesiones").get()!.total,
      0,
    );
  });

  it("migra solo la identidad histórica sin promover a los demás administradores", async () => {
    const roleId = Number(
      sqlite
        .prepare("INSERT INTO roles (nombre) VALUES ('Administrador')")
        .run().lastInsertRowid,
    );
    const hashHeredado = await hashPassword(passwordHeredado);
    const hashSeguro = await hashPassword(passwordDiferente);
    const seed = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id)
         VALUES ('Admin histórico', NULL, 'admin', ?, 0, ?)`,
      )
      .run(hashHeredado, roleId);
    const colega = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id)
         VALUES ('Colega', 'colega', 'colega@example.test', ?, 0, ?)`,
      )
      .run(hashSeguro, roleId);

    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();

    const asignaciones = sqlite
      .prepare(
        `SELECT u.id, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id IN (?, ?)
         ORDER BY u.id`,
      )
      .all(seed.lastInsertRowid, colega.lastInsertRowid);
    assert.deepEqual(asignaciones, [
      { id: Number(seed.lastInsertRowid), rol: "SysAdmin" },
      { id: Number(colega.lastInsertRowid), rol: "Administrador" },
    ]);
    const rolOriginal = sqlite
      .prepare("SELECT nombre FROM roles WHERE id = ?")
      .get(roleId) as { nombre: string };
    assert.equal(rolOriginal.nombre, "Administrador");
  });

  it("migra al SysAdmin una identidad histórica con contraseña ya asegurada", async () => {
    const roleId = Number(
      sqlite
        .prepare("INSERT INTO roles (nombre) VALUES ('Administrador')")
        .run().lastInsertRowid,
    );
    const hashSeguro = await hashPassword(passwordDiferente);
    const usuario = sqlite
      .prepare(
        `INSERT INTO usuarios
         (nombre, username, email, password_hash, debe_cambiar_password, role_id)
         VALUES ('Admin histórico', NULL, 'admin', ?, 0, ?)`,
      )
      .run(hashSeguro, roleId);
    sqlite
      .prepare(
        `INSERT INTO sesiones (token, usuario_id, fecha_expiracion)
         VALUES ('sesion-admin-seguro', ?, ?)`,
      )
      .run(usuario.lastInsertRowid, Date.now() + 60_000);

    await ensureAdminSeed();

    const migrado = sqlite
      .prepare(
        `SELECT u.username, u.email, u.password_hash, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ?`,
      )
      .get(usuario.lastInsertRowid) as {
      username: string;
      email: string;
      password_hash: string;
      rol: string;
    };
    assert.deepEqual(
      {
        username: migrado.username,
        email: migrado.email,
        rol: migrado.rol,
      },
      { username: "sysadmin", email: "sysadmin", rol: "SysAdmin" },
    );
    assert.equal(migrado.password_hash, hashSeguro);
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS total FROM sesiones WHERE usuario_id = ?")
        .get(usuario.lastInsertRowid)!.total,
      0,
    );
  });

  it("reactiva los roles base sin modificar contraseñas seguras", async () => {
    process.env.BOOTSTRAP_SYSADMIN_PASSWORD = passwordInicial;
    await ensureAdminSeed();
    const hashAnterior = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE username = 'sysadmin'")
      .get()!.password_hash;
    sqlite.prepare("UPDATE roles SET activo = 0").run();
    delete process.env.BOOTSTRAP_SYSADMIN_PASSWORD;

    await ensureAdminSeed();

    const roles = sqlite
      .prepare("SELECT nombre, activo FROM roles ORDER BY nombre")
      .all();
    assert.deepEqual(roles, [
      { nombre: "Administrador", activo: 1 },
      { nombre: "Operador", activo: 1 },
      { nombre: "SysAdmin", activo: 1 },
    ]);
    const hashActual = sqlite
      .prepare("SELECT password_hash FROM usuarios WHERE username = 'sysadmin'")
      .get()!.password_hash;
    assert.equal(hashActual, hashAnterior);
  });

  it("revierte el hash si no puede revocar las sesiones", async () => {
    const heredado = await crearSeedHeredado();
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
      .prepare(
        `
        SELECT password_hash, debe_cambiar_password
        FROM usuarios WHERE id = ?
      `,
      )
      .get(heredado.id) as {
      password_hash: string;
      debe_cambiar_password: number;
    };
    assert.equal(actual.password_hash, heredado.passwordHash);
    assert.equal(actual.debe_cambiar_password, 0);
    assert.equal(
      await verifyPassword(passwordHeredado, actual.password_hash),
      true,
    );
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
