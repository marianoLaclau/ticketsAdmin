import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0013_add_seguimientos_lookup_index.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

interface QueryPlanStep {
  detail: string;
}

describe("migración del índice de seguimientos", () => {
  it("preserva los datos y crea el índice compuesto en el orden esperado", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE seguimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        nota TEXT NOT NULL,
        fecha_creacion INTEGER NOT NULL
      );
      INSERT INTO tickets (id) VALUES (1), (2);
      INSERT INTO seguimientos (id, ticket_id, nota, fecha_creacion) VALUES
        (1, 1, 'Segundo', 2000),
        (2, 1, 'Primero B', 1000),
        (3, 1, 'Primero A', 1000),
        (4, 2, 'Otro ticket', 500);
    `);

    const before = sqlite
      .prepare(
        `
        SELECT id, ticket_id, nota, fecha_creacion
        FROM seguimientos
        ORDER BY id
      `,
      )
      .all();

    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare(
          `
          SELECT id, ticket_id, nota, fecha_creacion
          FROM seguimientos
          ORDER BY id
        `,
        )
        .all(),
      before,
    );

    const index = (
      sqlite.pragma("index_list('seguimientos')") as Array<{
        name: string;
        unique: number;
      }>
    ).find(({ name }) => name === "seguimientos_ticket_fecha_id_idx");
    assert.ok(index);
    assert.equal(index.unique, 0);
    assert.deepEqual(
      (
        sqlite.pragma(
          "index_info('seguimientos_ticket_fecha_id_idx')",
        ) as Array<{ name: string; seqno: number }>
      )
        .sort((left, right) => left.seqno - right.seqno)
        .map(({ name }) => name),
      ["ticket_id", "fecha_creacion", "id"],
    );
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("resuelve pertenencia e historial sin una tabla temporal de ordenamiento", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE seguimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        nota TEXT NOT NULL,
        fecha_creacion INTEGER NOT NULL
      );
      ${migrationSql}
    `);

    const membershipPlan = sqlite
      .prepare(
        `
        EXPLAIN QUERY PLAN
        SELECT tickets.id
        FROM tickets
        WHERE NOT EXISTS (
          SELECT 1
          FROM seguimientos
          WHERE seguimientos.ticket_id = tickets.id
        )
      `,
      )
      .all() as QueryPlanStep[];
    const historyPlan = sqlite
      .prepare(
        `
        EXPLAIN QUERY PLAN
        SELECT id, nota, fecha_creacion
        FROM seguimientos
        WHERE ticket_id = ?
        ORDER BY fecha_creacion ASC, id ASC
      `,
      )
      .all(1) as QueryPlanStep[];

    assert.ok(
      membershipPlan.some(
        ({ detail }) =>
          detail.includes("seguimientos_ticket_fecha_id_idx") &&
          /SEARCH seguimientos/i.test(detail),
      ),
      JSON.stringify(membershipPlan),
    );
    assert.ok(
      historyPlan.some(
        ({ detail }) =>
          detail.includes("seguimientos_ticket_fecha_id_idx") &&
          /SEARCH seguimientos/i.test(detail),
      ),
      JSON.stringify(historyPlan),
    );
    assert.equal(
      historyPlan.some(({ detail }) => /TEMP B-TREE/i.test(detail)),
      false,
      JSON.stringify(historyPlan),
    );
    sqlite.close();
  });
});
