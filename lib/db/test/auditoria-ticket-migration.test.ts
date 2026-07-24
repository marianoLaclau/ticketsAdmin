import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0007_v05_auditoria_ticket.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("migración de auditoría v0.5", () => {
  it("agrega los snapshots y conserva las FK con SET NULL", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY);
      CREATE TABLE tickets (id INTEGER PRIMARY KEY);
      CREATE TABLE seguimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        nota TEXT NOT NULL,
        estado_anterior TEXT,
        estado_nuevo TEXT,
        autor TEXT,
        fecha_creacion INTEGER NOT NULL
      );
    `);

    sqlite.exec(migrationSql);

    const columnas = sqlite
      .prepare("PRAGMA table_info(seguimientos)")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const columna of [
      "prioridad_anterior",
      "prioridad_nueva",
      "asignado_anterior_usuario_id",
      "asignado_anterior",
      "asignado_nuevo_usuario_id",
      "asignado_nuevo",
      "campos_editados",
    ]) {
      assert.ok(columnas.includes(columna), `falta ${columna}`);
    }

    sqlite.exec(`
      INSERT INTO usuarios (id) VALUES (10), (20);
      INSERT INTO tickets (id) VALUES (1);
      INSERT INTO seguimientos (
        ticket_id, nota, asignado_anterior_usuario_id, asignado_anterior,
        asignado_nuevo_usuario_id, asignado_nuevo, campos_editados,
        fecha_creacion
      ) VALUES (1, 'Reasignación', 10, 'Ana', 20, 'Bruno', '["empresa"]', 1);
      DELETE FROM usuarios WHERE id IN (10, 20);
    `);

    assert.deepEqual(
      sqlite
        .prepare(`
          SELECT asignado_anterior_usuario_id, asignado_anterior,
                 asignado_nuevo_usuario_id, asignado_nuevo, campos_editados
          FROM seguimientos
        `)
        .get(),
      {
        asignado_anterior_usuario_id: null,
        asignado_anterior: "Ana",
        asignado_nuevo_usuario_id: null,
        asignado_nuevo: "Bruno",
        campos_editados: '["empresa"]',
      },
    );
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
