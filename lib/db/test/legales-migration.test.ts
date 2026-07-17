import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0006_add_legales_category.sql", import.meta.url),
  "utf8",
);

describe("migración de la categoría Legales", () => {
  it("hace un backfill conservador sin alterar motivo ni resumen", () => {
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
    insert.run(
      1,
      "Consulta por carta documento luego del despido",
      "bajas_liquidacion",
      "Quiere conocer los próximos pasos.",
    );
    insert.run(
      2,
      "Solicita su recibo de sueldo",
      "recibos_documentacion",
      "También mencionó que habló con un abogado.",
    );
    insert.run(
      3,
      "Necesita ayuda",
      "sin_clasificar",
      "Consulta jurídica por un telegrama laboral.",
    );
    insert.run(
      4,
      "Necesita el nombre legal de la empresa",
      "sin_clasificar",
      null,
    );
    insert.run(5, "Consulta por despido", "bajas_liquidacion", null);
    insert.run(
      6,
      "Necesita orientación",
      "sin_clasificar",
      "Consulta jurídica por una demanda legal.",
    );
    insert.run(7, "Fue citado a una audiencia laboral", "sin_clasificar", null);
    insert.run(
      8,
      "Consulta por una medida cautelar preventiva",
      "sin_clasificar",
      null,
    );
    insert.run(
      9,
      "Consulta por el recibo de sueldo para su abogado",
      "recibos_documentacion",
      null,
    );
    insert.run(
      10,
      "Una abogada se postula para un empleo",
      "empleo_postulaciones",
      null,
    );
    insert.run(11, "Consulta por un embargo laboral", "sin_clasificar", null);

    const textosAntes = sqlite
      .prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id")
      .all();

    sqlite.exec(migrationSql);

    const categorias = sqlite
      .prepare("SELECT id, motivo_categoria FROM tickets ORDER BY id")
      .all();
    assert.deepEqual(categorias, [
      { id: 1, motivo_categoria: "legales" },
      { id: 2, motivo_categoria: "recibos_documentacion" },
      { id: 3, motivo_categoria: "legales" },
      { id: 4, motivo_categoria: "sin_clasificar" },
      { id: 5, motivo_categoria: "bajas_liquidacion" },
      { id: 6, motivo_categoria: "legales" },
      { id: 7, motivo_categoria: "legales" },
      { id: 8, motivo_categoria: "sin_clasificar" },
      { id: 9, motivo_categoria: "recibos_documentacion" },
      { id: 10, motivo_categoria: "empleo_postulaciones" },
      { id: 11, motivo_categoria: "legales" },
    ]);

    const textosDespues = sqlite
      .prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id")
      .all();
    assert.deepEqual(textosDespues, textosAntes);

    sqlite.close();
  });
});
