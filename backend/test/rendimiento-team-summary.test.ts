import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  seguimientosTable,
  ticketsCuarentenaTable,
  ticketsTable,
} from "@workspace/db/schema";
import { consultarResumenEquipo } from "../src/modules/rendimiento/data/team-summary-query";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL DEFAULT 1,
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
      motivo_categoria TEXT NOT NULL,
      resumen TEXT,
      notificado INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL,
      prioridad TEXT NOT NULL,
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
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE
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
      fecha_limite_snapshot INTEGER,
      fecha_creacion INTEGER NOT NULL
    );
  `);
  const database = drizzle(sqlite, {
    schema: { ticketsTable, ticketsCuarentenaTable, seguimientosTable },
  });
  return { sqlite, database };
}

type TicketInput = {
  conversationId: string;
  createdAt: string;
  status?: string;
  priority?: string;
  company?: string | null;
  category?: string;
  deadline?: string | null;
  resolvedAt?: string | null;
  assignedUserId?: number | null;
  assignedTo?: string | null;
};

function insertTicket(sqlite: Database.Database, input: TicketInput): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO tickets (
          conversation_id, hora, nombre, apellido, empresa, motivo,
          motivo_categoria, estado, prioridad, fecha_creacion, fecha_limite,
          fecha_resolucion, asignado_usuario_id, asignado_a
        ) VALUES (?, '10:00', 'Persona', '', ?, 'Consulta', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.conversationId,
        input.company ?? null,
        input.category ?? "legales",
        input.status ?? "nuevo",
        input.priority ?? "media",
        Date.parse(input.createdAt),
        input.deadline ? Date.parse(input.deadline) : null,
        input.resolvedAt ? Date.parse(input.resolvedAt) : null,
        input.assignedUserId ?? null,
        input.assignedTo ?? null,
      ).lastInsertRowid,
  );
}

function insertResolution(
  sqlite: Database.Database,
  input: {
    ticketId: number;
    from: string | null;
    to: string | null;
    resolvedAt: string;
    deadlineSnapshot?: string | null;
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO seguimientos (
        ticket_id, nota, estado_anterior, estado_nuevo,
        fecha_limite_snapshot, fecha_creacion
      ) VALUES (?, 'Cambio de estado', ?, ?, ?, ?)`,
    )
    .run(
      input.ticketId,
      input.from,
      input.to,
      input.deadlineSnapshot ? Date.parse(input.deadlineSnapshot) : null,
      Date.parse(input.resolvedAt),
    );
}

describe("resumen de equipo de Rendimiento", () => {
  it("resume el conjunto analizado visible y separa estado actual de métricas auditables", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-15T12:00:00.000Z");

    insertTicket(sqlite, {
      conversationId: "nuevo-vencido",
      createdAt: "2026-08-01T12:00:00.000Z",
      status: "nuevo",
      priority: "baja",
      deadline: "2026-08-14T12:00:00.000Z",
      assignedUserId: 11,
      assignedTo: "Operadora Uno",
    });
    insertTicket(sqlite, {
      conversationId: "en-proceso-al-limite",
      createdAt: "2026-08-02T12:00:00.000Z",
      status: "en_proceso",
      priority: "media",
      deadline: now.toISOString(),
      assignedTo: "Asignación histórica sin identidad",
    });
    insertTicket(sqlite, {
      conversationId: "pendiente",
      createdAt: "2026-08-03T12:00:00.000Z",
      status: "pendiente",
      priority: "alta",
    });

    const inOneHour = insertTicket(sqlite, {
      conversationId: "resuelto-una-hora",
      createdAt: "2026-08-04T12:00:00.000Z",
      status: "resuelto",
      priority: "urgente",
      resolvedAt: "2026-08-04T13:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: inOneHour,
      from: "en_proceso",
      to: "resuelto",
      resolvedAt: "2026-08-04T13:00:00.000Z",
      deadlineSnapshot: "2026-08-04T14:00:00.000Z",
    });

    const inTwoHours = insertTicket(sqlite, {
      conversationId: "cerrado-dos-horas",
      createdAt: "2026-08-05T12:00:00.000Z",
      status: "cerrado",
      priority: "baja",
      resolvedAt: "2026-08-05T14:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: inTwoHours,
      from: "nuevo",
      to: "cerrado",
      resolvedAt: "2026-08-05T14:00:00.000Z",
      deadlineSnapshot: "2026-08-05T13:59:59.999Z",
    });

    const inTenHours = insertTicket(sqlite, {
      conversationId: "resuelto-diez-horas",
      createdAt: "2026-08-06T12:00:00.000Z",
      status: "resuelto",
      priority: "media",
      resolvedAt: "2026-08-06T22:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: inTenHours,
      from: "pendiente",
      to: "resuelto",
      resolvedAt: "2026-08-06T22:00:00.000Z",
      deadlineSnapshot: "2026-08-06T22:00:00.000Z",
    });

    const negative = insertTicket(sqlite, {
      conversationId: "resolucion-negativa",
      createdAt: "2026-08-07T12:00:00.000Z",
      status: "resuelto",
      priority: "alta",
      resolvedAt: "2026-08-07T11:59:59.999Z",
    });
    // Aunque tenga snapshot, resuelto -> cerrado no es una resolución nueva.
    insertResolution(sqlite, {
      ticketId: negative,
      from: "resuelto",
      to: "cerrado",
      resolvedAt: "2026-08-07T13:00:00.000Z",
      deadlineSnapshot: "2026-08-08T12:00:00.000Z",
    });

    const withoutResolutionDate = insertTicket(sqlite, {
      conversationId: "cerrado-sin-fecha",
      createdAt: "2026-08-08T12:00:00.000Z",
      status: "cerrado",
      priority: "alta",
    });
    insertResolution(sqlite, {
      ticketId: withoutResolutionDate,
      from: null,
      to: "cerrado",
      resolvedAt: "2026-08-08T13:00:00.000Z",
      deadlineSnapshot: "2026-08-09T12:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: withoutResolutionDate,
      from: "nuevo",
      to: "cerrado",
      resolvedAt: "2026-08-08T14:00:00.000Z",
      deadlineSnapshot: null,
    });

    const quarantined = insertTicket(sqlite, {
      conversationId: "cuarentena",
      createdAt: "2026-08-09T12:00:00.000Z",
      status: "resuelto",
      priority: "urgente",
      resolvedAt: "2026-08-09T13:00:00.000Z",
    });
    sqlite
      .prepare("INSERT INTO tickets_cuarentena (ticket_id) VALUES (?)")
      .run(quarantined);
    insertResolution(sqlite, {
      ticketId: quarantined,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-08-09T13:00:00.000Z",
      deadlineSnapshot: "2026-08-10T12:00:00.000Z",
    });

    const outside = insertTicket(sqlite, {
      conversationId: "fuera-del-periodo",
      createdAt: "2026-07-31T12:00:00.000Z",
      status: "resuelto",
      priority: "urgente",
      resolvedAt: "2026-07-31T13:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: outside,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-07-31T13:00:00.000Z",
      deadlineSnapshot: "2026-08-01T12:00:00.000Z",
    });

    const result = consultarResumenEquipo(
      database,
      {
        fecha_desde: new Date("2026-08-01T00:00:00.000Z"),
        fecha_hasta: new Date("2026-08-31T23:59:59.999Z"),
      },
      now,
    );

    assert.deepEqual(result, {
      tickets_ingresados: 8,
      estado_actual: {
        total: 8,
        abiertos: 3,
        finalizados: 5,
        vencidos_abiertos: 1,
      },
      resolucion_con_fecha: {
        muestra: 3,
        promedio_horas: 4.33,
        mediana_horas: 2,
      },
      cumplimiento_plazo_auditable: {
        muestra: 3,
        cumplidos: 2,
        porcentaje: 66.7,
      },
      cumplimiento_plazo: {
        muestra: 3,
        cumplidos: 2,
        porcentaje: 66.7,
        muestra_auditable: 3,
        cumplidos_auditables: 2,
        muestra_historica_reconstruida: 0,
        cumplidos_historicos_reconstruidos: 0,
      },
      backlog_vencido: {
        abiertos: 3,
        con_plazo: 2,
        vencidos: 1,
        porcentaje: 33.3,
      },
      antiguedad_backlog: {
        muestra: 3,
        mediana_horas_habiles: 240,
      },
      cobertura_asignacion: {
        abiertos: 3,
        asignados: 1,
        sin_asignar: 2,
        porcentaje: 33.3,
      },
      distribucion_estado: {
        nuevo: 1,
        en_proceso: 1,
        pendiente: 1,
        resuelto: 3,
        cerrado: 2,
      },
      distribucion_prioridad: {
        baja: 2,
        media: 2,
        alta: 3,
        urgente: 1,
      },
    });
    sqlite.close();
  });

  it("calcula exactamente la mediana par antes de redondear horas", () => {
    const { sqlite, database } = createDatabase();
    const createdAt = "2026-08-01T12:00:00.000Z";
    for (const [index, minutes] of [61, 62, 181, 302].entries()) {
      insertTicket(sqlite, {
        conversationId: `duracion-${index}`,
        createdAt,
        status: "resuelto",
        resolvedAt: new Date(
          Date.parse(createdAt) + minutes * 60_000,
        ).toISOString(),
      });
    }

    const result = consultarResumenEquipo(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(result.resolucion_con_fecha, {
      muestra: 4,
      promedio_horas: 2.53,
      // Centro exacto: (62 + 181) / 2 = 121.5 minutos = 2.025 horas.
      mediana_horas: 2.03,
    });
    sqlite.close();
  });

  it("combina evidencia auditable con la ultima finalizacion historica sin duplicarla", () => {
    const { sqlite, database } = createDatabase();

    const audited = insertTicket(sqlite, {
      conversationId: "auditado",
      createdAt: "2026-08-01T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-08-01T09:00:00.000Z",
      resolvedAt: "2026-08-01T10:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: audited,
      from: "en_proceso",
      to: "resuelto",
      resolvedAt: "2026-08-01T10:00:00.000Z",
      deadlineSnapshot: "2026-08-01T11:00:00.000Z",
    });

    insertTicket(sqlite, {
      conversationId: "historico-sin-evento",
      createdAt: "2026-08-02T08:00:00.000Z",
      status: "cerrado",
      deadline: "2026-08-02T12:00:00.000Z",
      resolvedAt: "2026-08-02T11:00:00.000Z",
    });

    const historicalEvent = insertTicket(sqlite, {
      conversationId: "historico-con-evento",
      createdAt: "2026-08-03T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-08-03T10:00:00.000Z",
      resolvedAt: "2026-08-03T11:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: historicalEvent,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-08-03T11:00:00.000Z",
    });

    const multipleCycles = insertTicket(sqlite, {
      conversationId: "ciclos-mixtos",
      createdAt: "2026-08-04T08:00:00.000Z",
      status: "cerrado",
      deadline: "2026-08-04T16:00:00.000Z",
      resolvedAt: "2026-08-04T15:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: multipleCycles,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-08-04T10:00:00.000Z",
      deadlineSnapshot: "2026-08-04T11:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: multipleCycles,
      from: "resuelto",
      to: "en_proceso",
      resolvedAt: "2026-08-04T12:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: multipleCycles,
      from: "en_proceso",
      to: "cerrado",
      resolvedAt: "2026-08-04T15:00:00.000Z",
    });

    insertTicket(sqlite, {
      conversationId: "abierto-no-reconstruido",
      createdAt: "2026-08-05T08:00:00.000Z",
      status: "en_proceso",
      deadline: "2026-08-05T12:00:00.000Z",
      resolvedAt: "2026-08-05T11:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "historico-incoherente",
      createdAt: "2026-08-06T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-08-06T07:00:00.000Z",
      resolvedAt: "2026-08-06T09:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "historico-resuelto-en-el-futuro",
      createdAt: "2026-08-07T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-09-02T08:00:00.000Z",
      resolvedAt: "2026-09-01T08:00:00.000Z",
    });
    const auditedBeforeCreation = insertTicket(sqlite, {
      conversationId: "auditado-anterior-a-creacion",
      createdAt: "2026-08-08T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-08-08T10:00:00.000Z",
      resolvedAt: "2026-08-08T07:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: auditedBeforeCreation,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-08-08T07:00:00.000Z",
      deadlineSnapshot: "2026-08-08T10:00:00.000Z",
    });
    const auditedFuture = insertTicket(sqlite, {
      conversationId: "auditado-en-el-futuro",
      createdAt: "2026-08-09T08:00:00.000Z",
      status: "resuelto",
      deadline: "2026-09-02T08:00:00.000Z",
      resolvedAt: "2026-09-01T08:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: auditedFuture,
      from: "nuevo",
      to: "resuelto",
      resolvedAt: "2026-09-01T08:00:00.000Z",
      deadlineSnapshot: "2026-09-02T08:00:00.000Z",
    });

    const result = consultarResumenEquipo(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(result.cumplimiento_plazo_auditable, {
      muestra: 2,
      cumplidos: 2,
      porcentaje: 100,
    });
    assert.deepEqual(result.cumplimiento_plazo, {
      muestra: 5,
      cumplidos: 4,
      porcentaje: 80,
      muestra_auditable: 2,
      cumplidos_auditables: 2,
      muestra_historica_reconstruida: 3,
      cumplidos_historicos_reconstruidos: 2,
    });
    sqlite.close();
  });

  it("aplica empresa, categoría y prioridad a todas las métricas", () => {
    const { sqlite, database } = createDatabase();
    const matching = insertTicket(sqlite, {
      conversationId: "coincide",
      createdAt: "2026-08-05T12:00:00.000Z",
      status: "cerrado",
      priority: "urgente",
      company: "Grupo Maipú Servicios",
      category: "embargos",
      resolvedAt: "2026-08-05T14:00:00.000Z",
    });
    insertResolution(sqlite, {
      ticketId: matching,
      from: "nuevo",
      to: "cerrado",
      resolvedAt: "2026-08-05T14:00:00.000Z",
      deadlineSnapshot: "2026-08-05T15:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "otra-empresa",
      createdAt: "2026-08-05T12:00:00.000Z",
      company: "Otra",
      category: "embargos",
      priority: "urgente",
    });
    insertTicket(sqlite, {
      conversationId: "otra-categoria",
      createdAt: "2026-08-05T12:00:00.000Z",
      company: "Grupo Maipú",
      category: "legales",
      priority: "urgente",
    });
    insertTicket(sqlite, {
      conversationId: "otra-prioridad",
      createdAt: "2026-08-05T12:00:00.000Z",
      company: "Grupo Maipú",
      category: "embargos",
      priority: "alta",
    });

    const result = consultarResumenEquipo(
      database,
      {
        empresa: "  Maipú ",
        motivo_categoria: "embargos",
        prioridad: "urgente",
      },
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.tickets_ingresados, 1);
    assert.deepEqual(result.estado_actual, {
      total: 1,
      abiertos: 0,
      finalizados: 1,
      vencidos_abiertos: 0,
    });
    assert.deepEqual(result.resolucion_con_fecha, {
      muestra: 1,
      promedio_horas: 2,
      mediana_horas: 2,
    });
    assert.deepEqual(result.cumplimiento_plazo_auditable, {
      muestra: 1,
      cumplidos: 1,
      porcentaje: 100,
    });
    assert.deepEqual(result.cumplimiento_plazo, {
      muestra: 1,
      cumplidos: 1,
      porcentaje: 100,
      muestra_auditable: 1,
      cumplidos_auditables: 1,
      muestra_historica_reconstruida: 0,
      cumplidos_historicos_reconstruidos: 0,
    });
    assert.deepEqual(result.backlog_vencido, {
      abiertos: 0,
      con_plazo: 0,
      vencidos: 0,
      porcentaje: null,
    });
    assert.deepEqual(result.antiguedad_backlog, {
      muestra: 0,
      mediana_horas_habiles: null,
    });
    assert.deepEqual(result.cobertura_asignacion, {
      abiertos: 0,
      asignados: 0,
      sin_asignar: 0,
      porcentaje: null,
    });
    sqlite.close();
  });

  it("interpreta porcentaje y guion bajo como texto literal de empresa", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "empresa-literal",
      createdAt: "2026-08-05T12:00:00.000Z",
      company: "ACME_100% Servicios",
    });
    insertTicket(sqlite, {
      conversationId: "empresa-comodin",
      createdAt: "2026-08-05T13:00:00.000Z",
      company: "ACMEX1000 Servicios",
    });

    const result = consultarResumenEquipo(
      database,
      { empresa: "_100%" },
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.tickets_ingresados, 1);
    sqlite.close();
  });

  it("devuelve distribuciones completas y métricas nulas sin muestra", () => {
    const { sqlite, database } = createDatabase();

    const result = consultarResumenEquipo(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(result, {
      tickets_ingresados: 0,
      estado_actual: {
        total: 0,
        abiertos: 0,
        finalizados: 0,
        vencidos_abiertos: 0,
      },
      resolucion_con_fecha: {
        muestra: 0,
        promedio_horas: null,
        mediana_horas: null,
      },
      cumplimiento_plazo_auditable: {
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
      },
      cumplimiento_plazo: {
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
        muestra_auditable: 0,
        cumplidos_auditables: 0,
        muestra_historica_reconstruida: 0,
        cumplidos_historicos_reconstruidos: 0,
      },
      backlog_vencido: {
        abiertos: 0,
        con_plazo: 0,
        vencidos: 0,
        porcentaje: null,
      },
      antiguedad_backlog: {
        muestra: 0,
        mediana_horas_habiles: null,
      },
      cobertura_asignacion: {
        abiertos: 0,
        asignados: 0,
        sin_asignar: 0,
        porcentaje: null,
      },
      distribucion_estado: {
        nuevo: 0,
        en_proceso: 0,
        pendiente: 0,
        resuelto: 0,
        cerrado: 0,
      },
      distribucion_prioridad: {
        baja: 0,
        media: 0,
        alta: 0,
        urgente: 0,
      },
    });
    sqlite.close();
  });

  it("calcula la mediana hábil del backlog y excluye fechas futuras", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-10T15:00:00.000Z"); // lunes 12:00 ART

    insertTicket(sqlite, {
      conversationId: "abierto-viernes",
      createdAt: "2026-08-07T15:00:00.000Z", // viernes 12:00 ART: 24 h hábiles
    });
    insertTicket(sqlite, {
      conversationId: "abierto-lunes",
      createdAt: "2026-08-10T13:00:00.000Z", // lunes 10:00 ART: 2 h hábiles
    });
    insertTicket(sqlite, {
      conversationId: "abierto-futuro",
      createdAt: "2026-08-11T15:00:00.000Z",
    });

    const result = consultarResumenEquipo(database, {}, now);

    assert.equal(result.estado_actual.abiertos, 3);
    assert.deepEqual(result.antiguedad_backlog, {
      muestra: 2,
      mediana_horas_habiles: 13,
    });
    sqlite.close();
  });

  it("rechaza un reloj inválido antes de consultar", () => {
    const { sqlite, database } = createDatabase();
    assert.throws(
      () => consultarResumenEquipo(database, {}, new Date(Number.NaN)),
      /instante del resumen de rendimiento no es válido/,
    );
    sqlite.close();
  });
});
