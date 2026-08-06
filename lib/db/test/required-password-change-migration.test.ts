import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const migrationSql = readFileSync(
  new URL("../drizzle/0010_require_password_change.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("migración de cambio obligatorio de contraseña", () => {
  it("preserva usuarios históricos y falla cerrado en altas futuras", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE roles (id INTEGER PRIMARY KEY);
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT
      );
      CREATE TABLE sesiones (
        token TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
      );
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
      );
      INSERT INTO roles (id) VALUES (1);
      INSERT INTO usuarios (id, nombre, email, password_hash, role_id)
      VALUES (10, 'Histórica', 'historica@example.test', 'hash-preservado', 1);
      INSERT INTO sesiones (token, usuario_id) VALUES ('sesion-vigente', 10);
      INSERT INTO tickets (id, asignado_usuario_id) VALUES (20, 10);
    `);

    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare(
          `
          SELECT id, password_hash, debe_cambiar_password
          FROM usuarios WHERE id = 10
        `,
        )
        .get(),
      {
        id: 10,
        password_hash: "hash-preservado",
        debe_cambiar_password: 0,
      },
    );
    assert.deepEqual(
      sqlite.prepare("SELECT token, usuario_id FROM sesiones").get(),
      { token: "sesion-vigente", usuario_id: 10 },
    );
    assert.deepEqual(
      sqlite.prepare("SELECT id, asignado_usuario_id FROM tickets").get(),
      { id: 20, asignado_usuario_id: 10 },
    );

    sqlite
      .prepare(
        `
        INSERT INTO usuarios (id, nombre, email, password_hash, role_id)
        VALUES (11, 'Nueva', 'nueva@example.test', 'hash-nuevo', 1)
      `,
      )
      .run();
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT debe_cambiar_password AS flag FROM usuarios WHERE id = 11",
          )
          .get() as { flag: number }
      ).flag,
      1,
    );
    const invalidInsert = sqlite.prepare(`
      INSERT INTO usuarios
        (id, nombre, email, password_hash, role_id, debe_cambiar_password)
      VALUES (?, 'Inválida', ?, 'hash', 1, ?)
    `);
    for (const [id, flag] of [
      [12, 2],
      [13, -1],
      [14, null],
    ] as const) {
      assert.throws(
        () => invalidInsert.run(id, `invalida-${id}@example.test`, flag),
        /constraint failed/i,
      );
    }
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("forma parte de la cadena real y el migrador completo es idempotente", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);

    migrate(database, { migrationsFolder });
    migrate(database, { migrationsFolder });

    const column = (
      sqlite.pragma("table_info('usuarios')") as Array<{
        name: string;
        notnull: number;
        dflt_value: string | null;
      }>
    ).find(({ name }) => name === "debe_cambiar_password");
    assert.ok(column);
    assert.equal(column.notnull, 1);
    assert.equal(column.dflt_value, "true");
    assert.equal(
      (
        sqlite
          .prepare("SELECT count(*) AS total FROM __drizzle_migrations")
          .get() as { total: number }
      ).total,
      14,
    );
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
