import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0016_admin_session_elevation.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("migración de elevación administrativa por sesión", () => {
  it("preserva sesiones existentes y agrega estado de elevación anulable", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE roles (id INTEGER PRIMARY KEY);
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT
      );
      CREATE TABLE sesiones (
        token TEXT PRIMARY KEY NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        fecha_expiracion INTEGER NOT NULL,
        fecha_creacion INTEGER NOT NULL
      );
      INSERT INTO roles (id) VALUES (3);
      INSERT INTO usuarios (id, role_id) VALUES (7, 3);
      INSERT INTO sesiones
        (token, usuario_id, fecha_expiracion, fecha_creacion)
      VALUES
        ('sha256:${"a".repeat(64)}', 7, 2000000000000, 1000000000000);
    `);

    sqlite.exec(migrationSql);

    const columns = sqlite.pragma("table_info('sesiones')") as Array<{
      name: string;
      notnull: number;
    }>;
    assert.deepEqual(
      columns
        .filter(({ name }) => name.startsWith("admin_elevacion_"))
        .map(({ name, notnull }) => ({ name, notnull })),
      [
        { name: "admin_elevacion_hasta", notnull: 0 },
        { name: "admin_elevacion_clave_hash", notnull: 0 },
      ],
    );
    assert.deepEqual(
      sqlite
        .prepare(
          `SELECT admin_elevacion_hasta, admin_elevacion_clave_hash
           FROM sesiones`,
        )
        .get(),
      {
        admin_elevacion_hasta: null,
        admin_elevacion_clave_hash: null,
      },
    );

    const fingerprint = `sha256:${"b".repeat(64)}`;
    sqlite
      .prepare(
        `UPDATE sesiones
         SET admin_elevacion_hasta = ?, admin_elevacion_clave_hash = ?`,
      )
      .run(1500000000000, fingerprint);
    assert.deepEqual(
      sqlite
        .prepare(
          `SELECT admin_elevacion_hasta, admin_elevacion_clave_hash
           FROM sesiones`,
        )
        .get(),
      {
        admin_elevacion_hasta: 1500000000000,
        admin_elevacion_clave_hash: fingerprint,
      },
    );

    sqlite.prepare("DELETE FROM usuarios WHERE id = 7").run();
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM sesiones").get() as {
          total: number;
        }
      ).total,
      0,
    );
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
