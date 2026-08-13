import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  seguimientosTable,
  ticketsCuarentenaTable,
  ticketsTable,
} from "@workspace/db/schema";
import {
  buildQualityProportion,
  getIndividualComparisonStatus,
} from "../src/modules/rendimiento/domain/quality";
import { consultarCalidadRendimiento } from "../src/modules/rendimiento/data/quality-query";

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
  phone?: string | null;
  dni?: string | null;
  email?: string | null;
  assigneeId?: number | null;
  assignee?: string | null;
  deadline?: string | null;
  resolvedAt?: string | null;
};

function insertTicket(sqlite: Database.Database, input: TicketInput): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO tickets (
          conversation_id, hora, nombre, apellido, telefono, dni, empresa,
          email, motivo, motivo_categoria, estado, prioridad,
          asignado_usuario_id, asignado_a, fecha_creacion, fecha_limite,
          fecha_resolucion
        ) VALUES (?, '10:00', 'Persona', '', ?, ?, ?, ?, 'Consulta', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.conversationId,
        input.phone ?? null,
        input.dni ?? null,
        input.company ?? null,
        input.email ?? null,
        input.category ?? "legales",
        input.status ?? "nuevo",
        input.priority ?? "media",
        input.assigneeId ?? null,
        input.assignee ?? null,
        Date.parse(input.createdAt),
        input.deadline ? Date.parse(input.deadline) : null,
        input.resolvedAt ? Date.parse(input.resolvedAt) : null,
      ).lastInsertRowid,
  );
}

function insertStateChange(
  sqlite: Database.Database,
  input: {
    ticketId: number;
    from: string | null;
    to: string | null;
    actorId?: number | null;
    deadlineSnapshot?: string | null;
    createdAt: string;
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO seguimientos (
        ticket_id, nota, estado_anterior, estado_nuevo, autor_usuario_id,
        fecha_limite_snapshot, fecha_creacion
      ) VALUES (?, 'Cambio', ?, ?, ?, ?, ?)`,
    )
    .run(
      input.ticketId,
      input.from,
      input.to,
      input.actorId ?? null,
      input.deadlineSnapshot ? Date.parse(input.deadlineSnapshot) : null,
      Date.parse(input.createdAt),
    );
}

describe("proporciones y habilitación individual", () => {
  it("conserva muestra, redondea a un decimal y representa ausencia de muestra", () => {
    assert.deepEqual(buildQualityProportion(2, 3), {
      numerador: 2,
      denominador: 3,
      porcentaje: 66.7,
    });
    assert.deepEqual(buildQualityProportion(0, 0), {
      numerador: 0,
      denominador: 0,
      porcentaje: null,
    });
    assert.throws(() => buildQualityProportion(2, 1), RangeError);
  });

  it("exige muestra mínima y 95% de autoría para comparar personas", () => {
    assert.equal(
      getIndividualComparisonStatus(buildQualityProportion(9, 9)),
      "insuficiente",
    );
    assert.equal(
      getIndividualComparisonStatus(buildQualityProportion(8, 10)),
      "parcial",
    );
    assert.equal(
      getIndividualComparisonStatus(buildQualityProportion(19, 20)),
      "disponible",
    );
  });
});

describe("calidad de datos de Rendimiento", () => {
  it("mide una cohorte visible sin atribuir por asignación actual", () => {
    const { sqlite, database } = createDatabase();
    const deadline = "2026-08-08T12:00:00.000Z";
    const attributed = insertTicket(sqlite, {
      conversationId: "atribuido",
      createdAt: "2026-08-03T12:00:00.000Z",
      status: "resuelto",
      priority: "alta",
      company: "Empresa Uno",
      dni: "30111222",
      assigneeId: 10,
      assignee: "Ada",
      deadline,
      resolvedAt: "2026-08-04T12:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId: attributed,
      from: "en_proceso",
      to: "resuelto",
      actorId: 10,
      deadlineSnapshot: deadline,
      createdAt: "2026-08-04T12:00:00.000Z",
    });

    const legacy = insertTicket(sqlite, {
      conversationId: "legacy",
      createdAt: "2026-08-04T12:00:00.000Z",
      status: "cerrado",
      priority: "media",
      company: "Empresa Uno",
      email: "persona@example.test",
      assignee: "Nombre histórico",
    });
    insertStateChange(sqlite, {
      ticketId: legacy,
      from: "nuevo",
      to: "cerrado",
      createdAt: "2026-08-05T12:00:00.000Z",
    });
    // No debe contar una formalización posterior de resuelto a cerrado.
    insertStateChange(sqlite, {
      ticketId: legacy,
      from: "resuelto",
      to: "cerrado",
      actorId: 20,
      createdAt: "2026-08-06T12:00:00.000Z",
    });

    insertTicket(sqlite, {
      conversationId: "telefono",
      createdAt: "2026-08-05T12:00:00.000Z",
      phone: "11 5555 1234",
      deadline,
    });
    insertTicket(sqlite, {
      conversationId: "sin-identidad",
      createdAt: "2026-08-06T12:00:00.000Z",
      dni: "Sin DNI",
      phone: "123",
      email: "correo incompleto",
      assigneeId: 20,
      assignee: "Grace",
    });
    const quarantined = insertTicket(sqlite, {
      conversationId: "cuarentena",
      createdAt: "2026-08-06T12:00:00.000Z",
      status: "resuelto",
      dni: "99999999",
      resolvedAt: "2026-08-06T13:00:00.000Z",
    });
    sqlite
      .prepare("INSERT INTO tickets_cuarentena (ticket_id) VALUES (?)")
      .run(quarantined);
    insertTicket(sqlite, {
      conversationId: "fuera",
      createdAt: "2026-07-20T12:00:00.000Z",
      status: "resuelto",
      dni: "88888888",
      resolvedAt: "2026-07-21T12:00:00.000Z",
    });

    const result = consultarCalidadRendimiento(database, {
      fecha_desde: new Date("2026-08-01T03:00:00.000Z"),
      fecha_hasta: new Date("2026-09-01T02:59:59.999Z"),
    });

    assert.deepEqual(result, {
      tickets_evaluados: 4,
      resoluciones_evaluadas: 2,
      atribucion_desde: new Date("2026-08-04T12:00:00.000Z"),
      comparacion_individual_estado: "insuficiente",
      coberturas: {
        actor_resolucion: {
          numerador: 1,
          denominador: 2,
          porcentaje: 50,
        },
        fecha_resolucion: {
          numerador: 1,
          denominador: 2,
          porcentaje: 50,
        },
        plazo_resolucion: {
          numerador: 1,
          denominador: 2,
          porcentaje: 50,
        },
        asignacion_estructurada: {
          numerador: 2,
          denominador: 3,
          porcentaje: 66.7,
        },
        identidad_contacto: {
          numerador: 3,
          denominador: 4,
          porcentaje: 75,
        },
        fecha_limite: {
          numerador: 2,
          denominador: 4,
          porcentaje: 50,
        },
      },
    });
    sqlite.close();
  });

  it("aplica empresa, categoría y prioridad dentro de la misma cohorte", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "coincide",
      createdAt: "2026-08-03T12:00:00.000Z",
      company: "Grupo Maipú",
      category: "embargos",
      priority: "urgente",
      dni: "30111222",
    });
    insertTicket(sqlite, {
      conversationId: "otra",
      createdAt: "2026-08-03T12:00:00.000Z",
      company: "Otra empresa",
      category: "legales",
      priority: "media",
    });

    const result = consultarCalidadRendimiento(database, {
      empresa: "  Maipú ",
      motivo_categoria: "embargos",
      prioridad: "urgente",
    });
    assert.equal(result.tickets_evaluados, 1);
    assert.deepEqual(result.coberturas.identidad_contacto, {
      numerador: 1,
      denominador: 1,
      porcentaje: 100,
    });
    sqlite.close();
  });

  it("normaliza identidades y descarta placeholders o formatos inservibles", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "dni-formateado",
      createdAt: "2026-08-03T12:00:00.000Z",
      dni: "30.111.222",
    });
    insertTicket(sqlite, {
      conversationId: "telefono-formateado",
      createdAt: "2026-08-03T13:00:00.000Z",
      phone: "+54 (11) 5555-1234",
    });
    insertTicket(sqlite, {
      conversationId: "email-normalizado",
      createdAt: "2026-08-03T14:00:00.000Z",
      email: " Persona@Example.COM ",
    });
    insertTicket(sqlite, {
      conversationId: "placeholders",
      createdAt: "2026-08-03T15:00:00.000Z",
      dni: "Sin DNI",
      phone: "No informado",
      email: "sin correo",
    });
    insertTicket(sqlite, {
      conversationId: "placeholders-con-formato",
      createdAt: "2026-08-03T16:00:00.000Z",
      dni: "00.000.000",
      phone: "+54 11 1111-1111",
      email: "sin.email@example.com",
    });

    const result = consultarCalidadRendimiento(database, {});

    assert.deepEqual(result.coberturas.identidad_contacto, {
      numerador: 3,
      denominador: 5,
      porcentaje: 60,
    });
    sqlite.close();
  });
});
