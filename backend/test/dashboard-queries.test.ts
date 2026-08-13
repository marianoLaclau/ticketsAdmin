import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  seguimientosTable,
  ticketsCuarentenaTable,
  ticketsTable,
  type Estado,
  type MotivoCategoria,
  type Prioridad,
} from "@workspace/db/schema";
import {
  consultarDashboardStats,
  consultarMotivosDashboard,
} from "../src/modules/dashboard/data/queries";
import {
  businessDayWindow,
  normalizeDashboardDateQuery,
} from "../src/modules/dashboard/application/date-range";

const indexMigrationSql = readFileSync(
  new URL(
    "../../lib/db/drizzle/0013_add_seguimientos_lookup_index.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
const quarantineMigrationSql = readFileSync(
  new URL(
    "../../lib/db/drizzle/0014_materialize_ticket_quarantine.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

type InsertTicket = {
  conversationId: string;
  createdAt: string;
  name?: string;
  reason?: string;
  category?: MotivoCategoria;
  status?: Estado;
  priority?: Prioridad;
  deadline?: string | null;
  resolvedAt?: string | null;
};

function createDatabase(
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void,
) {
  const sqlite = new Database(":memory:", { verbose });
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
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      nota TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
  `);
  sqlite.exec(indexMigrationSql);
  sqlite.exec(quarantineMigrationSql);
  const database = drizzle(sqlite, {
    schema: {
      ticketsTable,
      ticketsCuarentenaTable,
      seguimientosTable,
    },
  });
  return { sqlite, database };
}

function insertTicket(sqlite: Database.Database, ticket: InsertTicket): number {
  return Number(
    sqlite
      .prepare(
        `
        INSERT INTO tickets (
          conversation_id, hora, nombre, apellido, motivo, motivo_categoria,
          estado, prioridad, fecha_creacion, fecha_limite, fecha_resolucion
        ) VALUES (?, '10:00', ?, '', ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        ticket.conversationId,
        ticket.name ?? "Persona identificada",
        ticket.reason ?? "Consulta",
        ticket.category ?? "sin_clasificar",
        ticket.status ?? "nuevo",
        ticket.priority ?? "media",
        Date.parse(ticket.createdAt),
        ticket.deadline ? Date.parse(ticket.deadline) : null,
        ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : null,
      ).lastInsertRowid,
  );
}

describe("ventana diaria de negocio", () => {
  it("usa Buenos Aires incluso al cruzar medianoche y cambiar la TZ del proceso", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      const previousDay = businessDayWindow(
        new Date("2026-01-01T01:59:59.000Z"),
      );
      assert.equal(previousDay.start.toISOString(), "2025-12-31T03:00:00.000Z");
      assert.equal(previousDay.end.toISOString(), "2026-01-01T03:00:00.000Z");

      const nextDay = businessDayWindow(new Date("2026-01-01T03:00:00.000Z"));
      assert.equal(nextDay.start.toISOString(), "2026-01-01T03:00:00.000Z");
      assert.equal(nextDay.end.toISOString(), "2026-01-02T03:00:00.000Z");

      const normalized = normalizeDashboardDateQuery({
        fecha_desde: "2026-01-01",
        fecha_hasta: "2026-01-01",
      }) as { fecha_desde: Date; fecha_hasta: Date };
      assert.equal(
        normalized.fecha_desde.toISOString(),
        "2026-01-01T03:00:00.000Z",
      );
      assert.equal(
        normalized.fecha_hasta.toISOString(),
        "2026-01-02T02:59:59.999Z",
      );
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it("rechaza un instante invalido", () => {
    assert.throws(() => businessDayWindow(new Date(Number.NaN)), RangeError);
  });
});

describe("consultas SQL del dashboard", () => {
  it("devuelve el contrato vacío con números estables y un snapshot diferido", () => {
    const statements: string[] = [];
    const { sqlite, database } = createDatabase((statement) => {
      statements.push(String(statement));
    });
    statements.length = 0;

    const stats = consultarDashboardStats(
      database,
      {},
      new Date("2026-08-06T14:00:00.000Z"),
    );
    assert.deepEqual(stats, {
      total: 0,
      por_estado: [],
      por_prioridad: [],
      vencidos: 0,
      resueltos_hoy: 0,
      nuevos_hoy: 0,
      resueltos_periodo: 0,
      nuevos_periodo: 0,
      tiempo_promedio_resolucion: null,
    });
    assert.deepEqual(consultarMotivosDashboard(database, {}), []);
    assert.ok(
      statements.some((statement) => /^begin deferred$/i.test(statement)),
      JSON.stringify(statements),
    );
    assert.ok(
      statements.some((statement) => /^commit$/i.test(statement)),
      JSON.stringify(statements),
    );
    assert.equal(
      statements.some((statement) => /^begin immediate$/i.test(statement)),
      false,
    );
    sqlite.close();
  });

  it("agrega el periodo, ordena por primera aparicion y excluye cuarentena", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "pendiente",
      createdAt: "2026-08-05T12:00:00.000Z",
      category: "legales",
      status: "pendiente",
      priority: "media",
      deadline: "2026-08-06T13:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "resuelto",
      createdAt: "2026-08-06T04:00:00.000Z",
      category: "embargos",
      status: "resuelto",
      priority: "urgente",
      resolvedAt: "2026-08-06T05:30:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "nuevo-resuelto",
      createdAt: "2026-08-06T06:00:00.000Z",
      category: "embargos",
      status: "nuevo",
      priority: "media",
      deadline: "2026-08-06T13:30:00.000Z",
      resolvedAt: "2026-08-06T08:30:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "fuera-del-periodo",
      createdAt: "2026-08-04T12:00:00.000Z",
      category: "legales",
      status: "cerrado",
      priority: "baja",
      resolvedAt: "2026-08-06T10:00:00.000Z",
    });
    const emptyId = insertTicket(sqlite, {
      conversationId: "cuarentena",
      createdAt: "2026-08-06T07:00:00.000Z",
      name: "Sin nombre proporcionado",
      reason: "Sin especificar",
    });
    insertTicket(sqlite, {
      conversationId: "limite-inferior",
      createdAt: "2026-08-05T03:00:00.000Z",
      category: "reclamos",
      status: "nuevo",
      priority: "alta",
    });

    assert.deepEqual(
      sqlite
        .prepare("SELECT ticket_id FROM tickets_cuarentena ORDER BY ticket_id")
        .all(),
      [{ ticket_id: emptyId }],
    );
    const range = {
      fecha_desde: new Date("2026-08-05T03:00:00.000Z"),
      fecha_hasta: new Date("2026-08-07T02:59:59.999Z"),
    };
    const stats = consultarDashboardStats(
      database,
      range,
      new Date("2026-08-06T14:00:00.000Z"),
    );
    assert.deepEqual(stats, {
      total: 4,
      por_estado: [
        { estado: "pendiente", cantidad: 1 },
        { estado: "resuelto", cantidad: 1 },
        { estado: "nuevo", cantidad: 2 },
      ],
      por_prioridad: [
        { prioridad: "media", cantidad: 2 },
        { prioridad: "urgente", cantidad: 1 },
        { prioridad: "alta", cantidad: 1 },
      ],
      vencidos: 2,
      resueltos_hoy: 3,
      nuevos_hoy: 2,
      resueltos_periodo: 1,
      nuevos_periodo: 4,
      tiempo_promedio_resolucion: 2,
    });
    for (const value of [
      stats.total,
      stats.vencidos,
      stats.resueltos_hoy,
      stats.nuevos_hoy,
      stats.resueltos_periodo,
      stats.nuevos_periodo,
      stats.tiempo_promedio_resolucion,
    ]) {
      assert.equal(typeof value, "number");
    }

    assert.deepEqual(consultarMotivosDashboard(database, range), [
      { categoria: "embargos", motivo: "Embargos", cantidad: 2 },
      { categoria: "legales", motivo: "Legales", cantidad: 1 },
      { categoria: "reclamos", motivo: "Reclamos", cantidad: 1 },
    ]);

    assert.equal(
      consultarDashboardStats(
        database,
        { fecha_desde: new Date("2026-08-06T04:00:00.000Z") },
        new Date("2026-08-06T14:00:00.000Z"),
      ).total,
      2,
    );
    assert.equal(
      consultarDashboardStats(
        database,
        { fecha_hasta: new Date("2026-08-05T12:00:00.000Z") },
        new Date("2026-08-06T14:00:00.000Z"),
      ).total,
      3,
    );
    sqlite.close();
  });

  it("no pierde estados o prioridades historicos fuera del catalogo", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "valor-historico",
      createdAt: "2026-08-06T12:00:00.000Z",
    });
    sqlite
      .prepare(
        "UPDATE tickets SET estado = ?, prioridad = ? WHERE conversation_id = ?",
      )
      .run("espera_externa", "critica", "valor-historico");

    const stats = consultarDashboardStats(
      database,
      {},
      new Date("2026-08-06T14:00:00.000Z"),
    );

    assert.equal(stats.total, 1);
    assert.deepEqual(stats.por_estado, [
      { estado: "espera_externa", cantidad: 1 },
    ]);
    assert.deepEqual(stats.por_prioridad, [
      { prioridad: "critica", cantidad: 1 },
    ]);
    assert.equal(
      stats.por_estado.reduce((total, item) => total + item.cantidad, 0),
      stats.total,
    );
    assert.equal(
      stats.por_prioridad.reduce((total, item) => total + item.cantidad, 0),
      stats.total,
    );
    sqlite.close();
  });

  it("incluye el inicio y excluye el final exacto del dia operativo", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-06T14:00:00.000Z");
    const day = businessDayWindow(now);
    insertTicket(sqlite, {
      conversationId: "inicio-del-dia",
      createdAt: day.start.toISOString(),
      resolvedAt: day.start.toISOString(),
    });
    insertTicket(sqlite, {
      conversationId: "fin-del-dia",
      createdAt: day.end.toISOString(),
      resolvedAt: day.end.toISOString(),
    });

    const stats = consultarDashboardStats(database, {}, now);
    assert.equal(stats.total, 2);
    assert.equal(stats.nuevos_hoy, 1);
    assert.equal(stats.resueltos_hoy, 1);
    sqlite.close();
  });
});
