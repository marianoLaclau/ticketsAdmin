import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0011_invalidate_plaintext_sessions.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("migración de hashes de sesión", () => {
  it("revoca bearer históricos sin romper la columna compatible con rollback", () => {
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
        ('${"a".repeat(64)}', 7, 2000000000000, 1000000000000);
    `);

    sqlite.exec(migrationSql);

    assert.deepEqual(sqlite.prepare("SELECT id, role_id FROM usuarios").get(), {
      id: 7,
      role_id: 3,
    });
    assert.deepEqual(sqlite.prepare("SELECT id FROM roles").get(), { id: 3 });
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM sesiones").get() as {
          total: number;
        }
      ).total,
      0,
    );
    const columns = sqlite.pragma("table_info('sesiones')") as Array<{
      name: string;
      pk: number;
    }>;
    assert.equal(columns.find(({ name }) => name === "token")?.pk, 1);
    assert.equal(
      columns.some(({ name }) => name === "token_hash"),
      false,
    );

    const digest = `sha256:${"b".repeat(64)}`;
    sqlite
      .prepare(
        `INSERT INTO sesiones
         (token, usuario_id, fecha_expiracion, fecha_creacion)
         VALUES (?, 7, 2000000000000, 1000000000000)`,
      )
      .run(digest);
    assert.equal(
      (
        sqlite.prepare("SELECT token FROM sesiones").get() as {
          token: string;
        }
      ).token,
      digest,
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
    assert.deepEqual(sqlite.prepare("SELECT id FROM roles").get(), { id: 3 });
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
