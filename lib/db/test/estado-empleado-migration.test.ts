import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0007_add_estado_empleado.sql", import.meta.url),
  "utf8",
);

describe("migración del estado del empleado", () => {
  it("conserva las filas existentes y permite guardar Activo o Inactivo", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        empresa TEXT
      );
      INSERT INTO tickets (id, empresa) VALUES (1, 'GSB');
    `);

    sqlite.exec(migrationSql);

    const filaExistente = sqlite
      .prepare("SELECT id, empresa, estado_empleado FROM tickets WHERE id = 1")
      .get();
    assert.deepEqual(filaExistente, {
      id: 1,
      empresa: "GSB",
      estado_empleado: null,
    });

    const insert = sqlite.prepare(`
      INSERT INTO tickets (id, empresa, estado_empleado)
      VALUES (?, ?, ?)
    `);
    insert.run(2, "Empresa Activa", "Activo");
    insert.run(3, "Empresa Inactiva", "Inactivo");

    const estados = sqlite
      .prepare("SELECT id, estado_empleado FROM tickets ORDER BY id")
      .all();
    assert.deepEqual(estados, [
      { id: 1, estado_empleado: null },
      { id: 2, estado_empleado: "Activo" },
      { id: 3, estado_empleado: "Inactivo" },
    ]);

    sqlite.close();
  });
});
