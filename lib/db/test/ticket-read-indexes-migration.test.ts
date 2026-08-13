import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  not,
} from "drizzle-orm";
import { seguimientosTable, ticketsTable } from "../src/schema/tickets";
import { ticketVisibleCondition } from "../src/ticket-visibility";

const migrationSql = readFileSync(
  new URL("../drizzle/0015_add_ticket_read_indexes.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

const SERIN_NOTE =
  "Datos extraidos y persistidos desde Serin con el DNI proporcionado.";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-08-04T00:00:00.000Z");
const NOW = new Date("2026-08-03T00:00:00.000Z");

interface QueryPlanStep {
  detail: string;
}

function createDatabase(): {
  sqlite: Database.Database;
  database: ReturnType<typeof drizzle>;
} {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      conversation_id TEXT NOT NULL UNIQUE,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      telefono TEXT,
      dni TEXT,
      empresa TEXT,
      estado_empleado TEXT,
      email TEXT,
      motivo TEXT NOT NULL,
      motivo_categoria TEXT NOT NULL DEFAULT 'sin_clasificar',
      resumen TEXT,
      notificado INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'nuevo',
      prioridad TEXT NOT NULL DEFAULT 'media',
      asignado_usuario_id INTEGER,
      asignado_a TEXT,
      audio_url TEXT,
      notas TEXT,
      progreso INTEGER NOT NULL DEFAULT 0,
      fecha_creacion INTEGER NOT NULL,
      fecha_limite INTEGER,
      fecha_resolucion INTEGER
    );
    CREATE TABLE tickets_cuarentena (
      ticket_id INTEGER PRIMARY KEY NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE
    );
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      nota TEXT NOT NULL,
      estado_anterior TEXT,
      estado_nuevo TEXT,
      prioridad_anterior TEXT,
      prioridad_nueva TEXT,
      asignado_anterior_usuario_id INTEGER,
      asignado_anterior TEXT,
      asignado_nuevo_usuario_id INTEGER,
      asignado_nuevo TEXT,
      campos_editados TEXT,
      autor_usuario_id INTEGER,
      autor TEXT,
      fecha_creacion INTEGER NOT NULL
    );
    CREATE INDEX seguimientos_ticket_fecha_id_idx
      ON seguimientos (ticket_id, fecha_creacion, id);
  `);

  const insertTicket = sqlite.prepare(`
    INSERT INTO tickets (
      id, conversation_id, hora, nombre, apellido, motivo,
      motivo_categoria, estado, prioridad, fecha_creacion,
      fecha_limite, fecha_resolucion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFollowUp = sqlite.prepare(`
    INSERT INTO seguimientos (
      id, ticket_id, nota, autor, fecha_creacion
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertQuarantine = sqlite.prepare(
    "INSERT INTO tickets_cuarentena (ticket_id) VALUES (?)",
  );
  const estados = [
    "nuevo",
    "en_proceso",
    "pendiente",
    "resuelto",
    "cerrado",
  ] as const;
  const prioridades = ["baja", "media", "alta", "urgente"] as const;
  const categorias = [
    "haberes_pagos",
    "recibos_documentacion",
    "vacaciones_licencias",
    "reclamos",
    "sin_clasificar",
  ] as const;
  const base = RANGE_START.getTime();

  sqlite.transaction(() => {
    for (let id = 1; id <= 72; id += 1) {
      const fechaCreacion = base + id * 60 * 60 * 1000;
      const estado = estados[id % estados.length]!;
      const finalizado = estado === "resuelto" || estado === "cerrado";
      insertTicket.run(
        id,
        `conversation-${id}`,
        `${String(id % 24).padStart(2, "0")}:00`,
        `Nombre ${id}`,
        `Apellido ${id}`,
        `Motivo ${id}`,
        categorias[id % categorias.length],
        estado,
        prioridades[id % prioridades.length],
        fechaCreacion,
        fechaCreacion + ((id % 12) - 8) * 60 * 60 * 1000,
        finalizado ? fechaCreacion + 2 * 60 * 60 * 1000 : null,
      );
      insertFollowUp.run(
        id,
        id,
        id % 9 === 0 ? SERIN_NOTE : `Seguimiento ${id}`,
        "Operador",
        fechaCreacion + 30 * 60 * 1000,
      );
      if (id % 17 === 0) insertQuarantine.run(id);
    }
  })();

  return { sqlite, database: drizzle(sqlite) };
}

function buildProductQueries(database: ReturnType<typeof drizzle>) {
  const rangeStart = RANGE_START;
  const rangeEnd = RANGE_END;

  return {
    recentTickets: database
      .select()
      .from(ticketsTable)
      .where(
        and(
          ticketVisibleCondition,
          gte(ticketsTable.fecha_creacion, rangeStart),
          lte(ticketsTable.fecha_creacion, rangeEnd),
        ),
      )
      .orderBy(desc(ticketsTable.fecha_creacion))
      .limit(10),
    recentFollowUps: database
      .select({
        seg: seguimientosTable,
        ticket: {
          nombre: ticketsTable.nombre,
          apellido: ticketsTable.apellido,
        },
      })
      .from(seguimientosTable)
      .innerJoin(
        ticketsTable,
        and(
          eq(seguimientosTable.ticket_id, ticketsTable.id),
          ticketVisibleCondition,
        ),
      )
      .where(
        and(
          not(eq(seguimientosTable.nota, SERIN_NOTE)),
          gte(seguimientosTable.fecha_creacion, rangeStart),
          lte(seguimientosTable.fecha_creacion, rangeEnd),
        ),
      )
      .orderBy(desc(seguimientosTable.fecha_creacion))
      .limit(10),
    overdue: database
      .select()
      .from(ticketsTable)
      .where(
        and(
          ticketVisibleCondition,
          lt(ticketsTable.fecha_limite, NOW),
          not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])),
        ),
      )
      .orderBy(asc(ticketsTable.fecha_limite))
      .limit(20),
    resolvedToday: database
      .select({ total: count() })
      .from(ticketsTable)
      .where(
        and(
          ticketVisibleCondition,
          gte(ticketsTable.fecha_resolucion, rangeStart),
          lt(ticketsTable.fecha_resolucion, rangeEnd),
        ),
      ),
  };
}

function queryResults(database: ReturnType<typeof drizzle>) {
  const queries = buildProductQueries(database);
  return {
    recentTickets: queries.recentTickets.all(),
    recentFollowUps: queries.recentFollowUps.all(),
    overdue: queries.overdue.all(),
    resolvedToday: queries.resolvedToday.all(),
  };
}

function queryPlan(
  sqlite: Database.Database,
  query: { toSQL(): { sql: string; params: unknown[] } },
): QueryPlanStep[] {
  const compiled = query.toSQL();
  return sqlite
    .prepare(`EXPLAIN QUERY PLAN ${compiled.sql}`)
    .all(...compiled.params) as QueryPlanStep[];
}

function assertUsesIndex(plan: QueryPlanStep[], indexName: string): void {
  assert.ok(
    plan.some(
      ({ detail }) => detail.includes(indexName) && /SEARCH/i.test(detail),
    ),
    JSON.stringify(plan),
  );
}

function assertDoesNotSortTemporarily(plan: QueryPlanStep[]): void {
  assert.equal(
    plan.some(({ detail }) => /TEMP B-TREE/i.test(detail)),
    false,
    JSON.stringify(plan),
  );
}

describe("migracion de indices temporales de lectura", () => {
  it("preserva resultados y crea los cuatro indices con sus columnas exactas", () => {
    const { sqlite, database } = createDatabase();
    const before = queryResults(database);
    const countsBefore = {
      tickets: sqlite.prepare("SELECT count(*) AS total FROM tickets").get(),
      followUps: sqlite
        .prepare("SELECT count(*) AS total FROM seguimientos")
        .get(),
    };

    sqlite.exec(migrationSql);

    assert.deepEqual(queryResults(database), before);
    assert.deepEqual(
      {
        tickets: sqlite.prepare("SELECT count(*) AS total FROM tickets").get(),
        followUps: sqlite
          .prepare("SELECT count(*) AS total FROM seguimientos")
          .get(),
      },
      countsBefore,
    );

    const expectedIndexes = new Map<string, readonly string[]>([
      ["tickets_fecha_creacion_id_idx", ["fecha_creacion", "id"]],
      ["tickets_fecha_limite_id_idx", ["fecha_limite", "id"]],
      ["tickets_fecha_resolucion_id_idx", ["fecha_resolucion", "id"]],
      ["seguimientos_fecha_creacion_id_idx", ["fecha_creacion", "id"]],
    ]);
    for (const [name, columns] of expectedIndexes) {
      const table = name.startsWith("seguimientos_")
        ? "seguimientos"
        : "tickets";
      const index = (
        sqlite.pragma(`index_list('${table}')`) as Array<{
          name: string;
          unique: number;
        }>
      ).find((candidate) => candidate.name === name);
      assert.ok(index, name);
      assert.equal(index.unique, 0, name);
      assert.deepEqual(
        (
          sqlite.pragma(`index_info('${name}')`) as Array<{
            name: string;
            seqno: number;
          }>
        )
          .sort((left, right) => left.seqno - right.seqno)
          .map(({ name: column }) => column),
        columns,
        name,
      );
    }

    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("usa los indices en dashboard, actividad y vencidos sin ordenar en temporal", () => {
    const { sqlite, database } = createDatabase();
    sqlite.exec(migrationSql);
    const queries = buildProductQueries(database);

    const recentTicketsPlan = queryPlan(sqlite, queries.recentTickets);
    const recentFollowUpsPlan = queryPlan(sqlite, queries.recentFollowUps);
    const overduePlan = queryPlan(sqlite, queries.overdue);
    const resolvedTodayPlan = queryPlan(sqlite, queries.resolvedToday);

    assertUsesIndex(recentTicketsPlan, "tickets_fecha_creacion_id_idx");
    assertUsesIndex(recentFollowUpsPlan, "seguimientos_fecha_creacion_id_idx");
    assertUsesIndex(overduePlan, "tickets_fecha_limite_id_idx");
    assertUsesIndex(resolvedTodayPlan, "tickets_fecha_resolucion_id_idx");
    assertDoesNotSortTemporarily(recentTicketsPlan);
    assertDoesNotSortTemporarily(recentFollowUpsPlan);
    assertDoesNotSortTemporarily(overduePlan);

    sqlite.close();
  });
});
