import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL(
    "../drizzle/0020_add_resolution_deadline_snapshot.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("migración del vencimiento al resolver", () => {
  it("agrega un snapshot nullable sin alterar seguimientos históricos", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE seguimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        nota TEXT NOT NULL,
        fecha_creacion INTEGER NOT NULL
      );
      INSERT INTO seguimientos (
        ticket_id, nota, fecha_creacion
      ) VALUES (1, 'Registro histórico', 1000);
    `);

    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite
        .prepare(
          `SELECT id, nota, fecha_limite_snapshot
           FROM seguimientos WHERE id = 1`,
        )
        .get(),
      {
        id: 1,
        nota: "Registro histórico",
        fecha_limite_snapshot: null,
      },
    );

    const column = (
      sqlite.pragma("table_info('seguimientos')") as Array<{
        name: string;
        notnull: number;
        dflt_value: string | null;
        type: string;
      }>
    ).find(({ name }) => name === "fecha_limite_snapshot");
    assert.ok(column);
    assert.equal(column.type, "INTEGER");
    assert.equal(column.notnull, 0);
    assert.equal(column.dflt_value, null);

    const deadline = Date.parse("2026-08-17T15:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO seguimientos (
           ticket_id, nota, fecha_limite_snapshot, fecha_creacion
         ) VALUES (?, ?, ?, ?)`,
      )
      .run(2, "Resolución nueva", deadline, 2000);
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT fecha_limite_snapshot FROM seguimientos WHERE id = 2",
          )
          .get() as { fecha_limite_snapshot: number }
      ).fecha_limite_snapshot,
      deadline,
    );
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
