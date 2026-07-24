import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0008_add_embargos_category.sql", import.meta.url),
  "utf8",
);

describe("migración de la categoría Embargos", () => {
  it("reclasifica de forma conservadora sin alterar los textos originales", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        motivo TEXT NOT NULL,
        motivo_categoria TEXT NOT NULL,
        resumen TEXT
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO tickets (id, motivo, motivo_categoria, resumen)
      VALUES (?, ?, ?, ?)
    `);
    insert.run(1, "Consulta por embargo de sueldo", "haberes_pagos", null);
    insert.run(2, "Sin embargo, necesita su recibo", "recibos_documentacion", null);
    insert.run(3, "Necesita ayuda", "sin_clasificar", "Retención judicial de haberes");
    insert.run(4, "Medida cautelar judicial", "legales", null);
    insert.run(5, "Sin embargo, consulta por un embargo de cuenta", "legales", null);
    insert.run(6, "Solicita su recibo", "recibos_documentacion", "También mencionó un embargo");
    insert.run(7, "Orden judicial para retener parte del sueldo", "legales", null);
    insert.run(8, "Oficio de retención de haberes", "sin_clasificar", null);

    const textosAntes = sqlite
      .prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id")
      .all();

    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare("SELECT id, motivo_categoria FROM tickets ORDER BY id")
        .all(),
      [
        { id: 1, motivo_categoria: "embargos" },
        { id: 2, motivo_categoria: "recibos_documentacion" },
        { id: 3, motivo_categoria: "embargos" },
        { id: 4, motivo_categoria: "legales" },
        { id: 5, motivo_categoria: "embargos" },
        { id: 6, motivo_categoria: "recibos_documentacion" },
        { id: 7, motivo_categoria: "embargos" },
        { id: 8, motivo_categoria: "embargos" },
      ],
    );

    const textosDespues = sqlite
      .prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id")
      .all();
    assert.deepEqual(textosDespues, textosAntes);
    sqlite.close();
  });
});
