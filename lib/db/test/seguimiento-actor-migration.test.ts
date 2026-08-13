import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0019_add_seguimiento_actor.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

function createLegacyDatabase(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
    CREATE TABLE tickets (id INTEGER PRIMARY KEY);
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      nota TEXT NOT NULL,
      autor TEXT,
      fecha_creacion INTEGER NOT NULL
    );
    INSERT INTO usuarios (id, nombre) VALUES (10, 'Ana Pérez');
    INSERT INTO tickets (id) VALUES (1);
    INSERT INTO seguimientos (
      ticket_id, nota, autor, fecha_creacion
    ) VALUES (1, 'Registro histórico', 'Ana Pérez', 1000);
  `);
  return sqlite;
}

describe("migración del actor estructurado de seguimientos", () => {
  it("conserva el historial legado sin atribuirlo por coincidencia de texto", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT autor_usuario_id, autor, nota FROM seguimientos WHERE id = 1",
        )
        .get(),
      {
        autor_usuario_id: null,
        autor: "Ana Pérez",
        nota: "Registro histórico",
      },
    );
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("aplica la FK con SET NULL y conserva el snapshot legible del actor", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(migrationSql);
    sqlite
      .prepare(
        `INSERT INTO seguimientos (
           ticket_id, nota, autor_usuario_id, autor, fecha_creacion
         ) VALUES (1, 'Acción nueva', 10, 'Ana Pérez', 2000)`,
      )
      .run();

    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO seguimientos (
               ticket_id, nota, autor_usuario_id, autor, fecha_creacion
             ) VALUES (1, 'Actor inexistente', 999, 'Desconocido', 3000)`,
          )
          .run(),
      /foreign key constraint failed/i,
    );

    sqlite.prepare("DELETE FROM usuarios WHERE id = 10").run();
    assert.deepEqual(
      sqlite
        .prepare(
          `SELECT autor_usuario_id, autor
           FROM seguimientos WHERE nota = 'Acción nueva'`,
        )
        .get(),
      { autor_usuario_id: null, autor: "Ana Pérez" },
    );
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    sqlite.close();
  });

  it("crea el índice compuesto para consultas por actor y período", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(migrationSql);

    const columns = (
      sqlite.pragma("index_info('seguimientos_autor_fecha_id_idx')") as Array<{
        name: string;
      }>
    ).map(({ name }) => name);
    assert.deepEqual(columns, ["autor_usuario_id", "fecha_creacion", "id"]);

    const plan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM seguimientos
         WHERE autor_usuario_id = ?
           AND fecha_creacion >= ? AND fecha_creacion <= ?
         ORDER BY fecha_creacion, id`,
      )
      .all(10, 0, 3000) as Array<{ detail: string }>;
    assert.ok(
      plan.some(({ detail }) =>
        detail.includes("seguimientos_autor_fecha_id_idx"),
      ),
    );
    sqlite.close();
  });
});
