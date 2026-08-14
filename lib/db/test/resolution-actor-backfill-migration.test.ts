import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  fileURLToPath(
    new URL("../drizzle/0021_backfill_resolution_actors.sql", import.meta.url),
  ),
  "utf8",
);

function createLegacyDatabase(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT,
      username TEXT UNIQUE
    );
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      estado_anterior TEXT,
      estado_nuevo TEXT,
      asignado_anterior_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      asignado_nuevo_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      autor_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      autor TEXT,
      fecha_creacion INTEGER NOT NULL
    );
  `);
  sqlite.exec(`
    INSERT INTO usuarios (id, nombre, apellido, username) VALUES
      (1, 'Ana', 'Suarez', 'ana'),
      (2, 'Bruno', 'Díaz', 'bruno.operador');

    -- La asignación y la resolución quedaron en el mismo evento.
    INSERT INTO seguimientos VALUES
      (1, 10, 'en_proceso', 'resuelto', NULL, 1, NULL, 'Ana Suarez', 1000);

    -- La resolución reutiliza una asignación estructurada anterior.
    INSERT INTO seguimientos VALUES
      (2, 20, 'nuevo', 'en_proceso', NULL, 2, NULL, 'Bruno Díaz', 1000),
      (3, 20, 'en_proceso', 'cerrado', NULL, NULL, NULL, 'bruno.operador', 2000);

    -- La asignación posterior nunca puede atribuir una resolución previa.
    INSERT INTO seguimientos VALUES
      (4, 30, 'en_proceso', 'resuelto', NULL, NULL, NULL, 'Ana Suarez', 1000),
      (5, 30, 'resuelto', 'en_proceso', NULL, 1, NULL, 'Ana Suarez', 2000);

    -- Una discrepancia entre autor y asignación no se completa.
    INSERT INTO seguimientos VALUES
      (6, 40, 'en_proceso', 'resuelto', NULL, 1, NULL, 'Bruno Díaz', 1000);

    -- Nunca se pisa una identidad ya estructurada.
    INSERT INTO seguimientos VALUES
      (7, 50, 'en_proceso', 'resuelto', NULL, 1, 2, 'Bruno Díaz', 1000);

    -- Los cambios que no son resoluciones quedan fuera del backfill.
    INSERT INTO seguimientos VALUES
      (8, 60, 'nuevo', 'pendiente', NULL, 1, NULL, 'Ana Suarez', 1000);

    -- Una asignación anterior coincidente no debe ocultar que la última difiere.
    INSERT INTO seguimientos VALUES
      (9, 70, 'nuevo', 'en_proceso', NULL, 1, NULL, 'Ana Suarez', 1000),
      (10, 70, 'en_proceso', 'pendiente', 1, 2, NULL, 'Bruno Díaz', 2000),
      (11, 70, 'pendiente', 'resuelto', NULL, NULL, NULL, 'Ana Suarez', 3000);

    -- Una desasignación posterior invalida al responsable anterior.
    INSERT INTO seguimientos VALUES
      (12, 80, 'nuevo', 'en_proceso', NULL, 1, NULL, 'Ana Suarez', 1000),
      (13, 80, 'en_proceso', 'pendiente', 1, NULL, NULL, 'Ana Suarez', 2000),
      (14, 80, 'pendiente', 'resuelto', NULL, NULL, NULL, 'Ana Suarez', 3000);
  `);
  return sqlite;
}

describe("backfill de autores de resoluciones históricas", () => {
  it("recupera solo identidades corroboradas por la asignación auditada", () => {
    const sqlite = createLegacyDatabase();

    sqlite.exec(migrationSql);

    const rows = sqlite
      .prepare("SELECT id, autor_usuario_id FROM seguimientos ORDER BY id")
      .all();
    assert.deepEqual(rows, [
      { id: 1, autor_usuario_id: 1 },
      { id: 2, autor_usuario_id: null },
      { id: 3, autor_usuario_id: 2 },
      { id: 4, autor_usuario_id: null },
      { id: 5, autor_usuario_id: null },
      { id: 6, autor_usuario_id: null },
      { id: 7, autor_usuario_id: 2 },
      { id: 8, autor_usuario_id: null },
      { id: 9, autor_usuario_id: null },
      { id: 10, autor_usuario_id: null },
      { id: 11, autor_usuario_id: null },
      { id: 12, autor_usuario_id: null },
      { id: 13, autor_usuario_id: null },
      { id: 14, autor_usuario_id: null },
    ]);

    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("es idempotente", () => {
    const sqlite = createLegacyDatabase();

    sqlite.exec(migrationSql);
    const afterFirstRun = sqlite
      .prepare("SELECT id, autor_usuario_id FROM seguimientos ORDER BY id")
      .all();
    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare("SELECT id, autor_usuario_id FROM seguimientos ORDER BY id")
        .all(),
      afterFirstRun,
    );
    sqlite.close();
  });
});
