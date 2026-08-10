import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";

const migrationSql = readFileSync(
  new URL("../drizzle/0012_add_ticket_version.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

describe("migración de versión optimista de tickets", () => {
  it("preserva históricos, inicia en uno y rechaza versiones inválidas", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL
      );
      INSERT INTO tickets (id, nombre) VALUES (1, 'Histórico');
    `);

    sqlite.exec(migrationSql);

    assert.deepEqual(
      sqlite.prepare("SELECT id, nombre, version FROM tickets").all(),
      [{ id: 1, nombre: "Histórico", version: 1 }],
    );

    sqlite
      .prepare("INSERT INTO tickets (id, nombre) VALUES (?, ?)")
      .run(2, "Nuevo");
    assert.equal(
      (
        sqlite.prepare("SELECT version FROM tickets WHERE id = 2").get() as {
          version: number;
        }
      ).version,
      1,
    );

    assert.throws(
      () => sqlite.prepare("UPDATE tickets SET version = 0 WHERE id = 1").run(),
      /constraint failed/i,
    );

    const column = (
      sqlite.pragma("table_info('tickets')") as Array<{
        name: string;
        notnull: number;
        dflt_value: string | null;
      }>
    ).find(({ name }) => name === "version");
    assert.ok(column);
    assert.equal(column.notnull, 1);
    assert.equal(column.dflt_value, "1");
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });
});
