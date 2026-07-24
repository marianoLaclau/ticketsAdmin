import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@workspace/db/schema";
import {
  reconciliarCategoriasMotivo,
  type CargarModuloDbCategorias,
} from "../src/lib/reclasificar-motivos.ts";

describe("reconciliación de categorías derivadas", () => {
  it("promueve solo Embargos sin modificar textos ni otras categorías", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        motivo TEXT NOT NULL,
        motivo_categoria TEXT NOT NULL,
        resumen TEXT
      );
      INSERT INTO tickets VALUES
        (1, 'Necesita ayuda', 'legales', 'Retención judicial de haberes'),
        (2, 'Necesita ayuda', 'haberes_pagos', 'Embargo de sueldo'),
        (3, 'Solicita su recibo de sueldo', 'recibos_documentacion', 'También mencionó un embargo'),
        (4, 'Consulta por carta documento', 'legales', 'También mencionó un embargo'),
        (5, 'Sin embargo, necesita su recibo de sueldo', 'recibos_documentacion', NULL),
        (6, 'Solicita su recibo de sueldo', 'legales', NULL);
    `);
    const textosAntes = sqlite
      .prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id")
      .all();

    const db = drizzle(sqlite, { schema });
    const cargarModulo: CargarModuloDbCategorias = async () => ({
      db,
      ticketsTable: schema.ticketsTable,
    });
    const resultado = await reconciliarCategoriasMotivo(cargarModulo);

    assert.equal(resultado.revisados, 6);
    assert.equal(resultado.actualizados, 2);
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, motivo_categoria FROM tickets ORDER BY id")
        .all(),
      [
        { id: 1, motivo_categoria: "embargos" },
        { id: 2, motivo_categoria: "embargos" },
        { id: 3, motivo_categoria: "recibos_documentacion" },
        { id: 4, motivo_categoria: "legales" },
        { id: 5, motivo_categoria: "recibos_documentacion" },
        { id: 6, motivo_categoria: "legales" },
      ],
    );
    assert.deepEqual(
      sqlite.prepare("SELECT id, motivo, resumen FROM tickets ORDER BY id").all(),
      textosAntes,
    );

    const segundaPasada = await reconciliarCategoriasMotivo(cargarModulo);
    assert.equal(segundaPasada.actualizados, 0);
    sqlite.close();
  });
});
