import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rolesTable,
  seguimientosTable,
  ticketsCuarentenaTable,
  ticketsTable,
  usuariosTable,
} from "@workspace/db/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { consultarRendimientoPersonas } from "../src/modules/rendimiento/data/individual-query";

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      activo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT,
      email TEXT NOT NULL UNIQUE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      activo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL UNIQUE,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      empresa TEXT,
      motivo TEXT NOT NULL,
      motivo_categoria TEXT NOT NULL,
      estado TEXT NOT NULL,
      prioridad TEXT NOT NULL,
      asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
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
      estado_anterior TEXT,
      estado_nuevo TEXT,
      autor_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      fecha_limite_snapshot INTEGER,
      fecha_creacion INTEGER NOT NULL
    );
  `);

  const database = drizzle(sqlite, {
    schema: {
      rolesTable,
      usuariosTable,
      ticketsTable,
      ticketsCuarentenaTable,
      seguimientosTable,
    },
  });
  return { sqlite, database };
}

function insertRole(sqlite: Database.Database, name = "Agente"): number {
  return Number(
    sqlite.prepare("INSERT INTO roles (nombre, activo) VALUES (?, 1)").run(name)
      .lastInsertRowid,
  );
}

function insertUser(
  sqlite: Database.Database,
  input: {
    roleId: number;
    name: string;
    surname?: string | null;
    active?: boolean;
  },
): number {
  const email = `${input.name}-${crypto.randomUUID()}@example.test`;
  return Number(
    sqlite
      .prepare(
        `INSERT INTO usuarios (
          nombre, apellido, email, role_id, activo
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.surname ?? null,
        email,
        input.roleId,
        input.active === false ? 0 : 1,
      ).lastInsertRowid,
  );
}

type TicketInput = {
  conversationId: string;
  createdAt: string;
  status?: string;
  priority?: string;
  company?: string | null;
  category?: string;
  assignedUserId?: number | null;
  deadline?: string | null;
  resolvedAt?: string | null;
};

function insertTicket(sqlite: Database.Database, input: TicketInput): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO tickets (
          conversation_id, hora, nombre, apellido, empresa, motivo,
          motivo_categoria, estado, prioridad, asignado_usuario_id,
          fecha_creacion, fecha_limite, fecha_resolucion
        ) VALUES (?, '10:00', 'Persona', '', ?, 'Consulta', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.conversationId,
        input.company ?? null,
        input.category ?? "legales",
        input.status ?? "nuevo",
        input.priority ?? "media",
        input.assignedUserId ?? null,
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
    happenedAt: string;
    authorUserId?: number | null;
    deadlineSnapshot?: string | null;
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO seguimientos (
        ticket_id, estado_anterior, estado_nuevo, autor_usuario_id,
        fecha_limite_snapshot, fecha_creacion
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.ticketId,
      input.from,
      input.to,
      input.authorUserId ?? null,
      input.deadlineSnapshot ? Date.parse(input.deadlineSnapshot) : null,
      Date.parse(input.happenedAt),
    );
}

describe("consulta de rendimiento individual", () => {
  it("calcula resoluciones, mediana, SLA auditable y carga actual", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const anaId = insertUser(sqlite, {
      roleId,
      name: "Ana",
      surname: "Suarez",
    });
    const now = new Date("2026-08-15T12:00:00.000Z");

    for (const [index, hours, deadlineOffset] of [
      [1, 1, 2],
      [2, 3, 2],
      [3, 8, null],
    ] as const) {
      const createdAt = new Date(`2026-08-0${index}T00:00:00.000Z`);
      const ticketId = insertTicket(sqlite, {
        conversationId: `resuelto-${index}`,
        createdAt: createdAt.toISOString(),
        status: "resuelto",
      });
      insertStateChange(sqlite, {
        ticketId,
        from: "en_proceso",
        to: "resuelto",
        authorUserId: anaId,
        happenedAt: new Date(
          createdAt.getTime() + hours * 3_600_000,
        ).toISOString(),
        deadlineSnapshot:
          deadlineOffset === null
            ? null
            : new Date(
                createdAt.getTime() + deadlineOffset * 3_600_000,
              ).toISOString(),
      });
    }

    insertTicket(sqlite, {
      conversationId: "abierto-vencido",
      createdAt: "2026-08-04T00:00:00.000Z",
      status: "en_proceso",
      assignedUserId: anaId,
      deadline: "2026-08-14T12:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "abierto-al-limite",
      createdAt: "2026-08-05T00:00:00.000Z",
      status: "pendiente",
      assignedUserId: anaId,
      deadline: now.toISOString(),
    });

    const result = consultarRendimientoPersonas(database, {}, now);

    assert.deepEqual(result, {
      tickets_evaluados: 5,
      cobertura: {
        resoluciones_evaluadas: 3,
        resoluciones_atribuidas: 3,
        finalizaciones_historicas_detectadas: 0,
        finalizaciones_historicas_atribuidas: 0,
        porcentaje_atribucion: 100,
        atribucion_desde: new Date("2026-08-01T01:00:00.000Z"),
        comparacion_individual_estado: "insuficiente",
        minimo_resoluciones_comparables: 10,
        umbral_cobertura_parcial_porcentaje: 80,
        umbral_cobertura_disponible_porcentaje: 95,
      },
      personas: [
        {
          usuario: {
            id: anaId,
            nombre: "Ana Suarez",
            rol: "Agente",
            activo: true,
          },
          tickets_resueltos: 3,
          resoluciones_atribuidas: 3,
          finalizaciones_historicas_atribuidas: 0,
          tiempo_resolucion_atribuible: {
            muestra: 3,
            promedio_horas: 4,
            mediana_horas: 3,
          },
          cumplimiento_plazo_auditable: {
            muestra: 2,
            cumplidos: 1,
            porcentaje: 50,
          },
          carga_actual: {
            abiertos_asignados: 2,
            vencidos_asignados: 1,
          },
          resoluciones_reabiertas: 0,
        },
      ],
    });
    sqlite.close();
  });

  it("liga cada reapertura con la resolucion previa en multiples ciclos", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const anaId = insertUser(sqlite, { roleId, name: "Ana" });
    const brunoId = insertUser(sqlite, { roleId, name: "Bruno" });
    const ticketId = insertTicket(sqlite, {
      conversationId: "tres-ciclos",
      createdAt: "2026-08-01T08:00:00.000Z",
      status: "resuelto",
    });

    insertStateChange(sqlite, {
      ticketId,
      from: "en_proceso",
      to: "resuelto",
      authorUserId: anaId,
      happenedAt: "2026-08-01T09:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId,
      from: "resuelto",
      to: "en_proceso",
      happenedAt: "2026-08-01T10:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId,
      from: "en_proceso",
      to: "cerrado",
      authorUserId: brunoId,
      happenedAt: "2026-08-01T11:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId,
      from: "cerrado",
      to: "pendiente",
      happenedAt: "2026-08-01T12:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId,
      from: "pendiente",
      to: "resuelto",
      authorUserId: anaId,
      happenedAt: "2026-08-01T13:00:00.000Z",
    });

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(
      result.personas.map((person) => ({
        nombre: person.usuario.nombre,
        tickets: person.tickets_resueltos,
        resoluciones: person.resoluciones_atribuidas,
        reabiertas: person.resoluciones_reabiertas,
      })),
      [
        { nombre: "Ana", tickets: 1, resoluciones: 2, reabiertas: 1 },
        { nombre: "Bruno", tickets: 1, resoluciones: 1, reabiertas: 1 },
      ],
    );
    sqlite.close();
  });

  it("incorpora finalizaciones legacy sin inventar eventos auditables", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const anaId = insertUser(sqlite, { roleId, name: "Ana" });

    insertTicket(sqlite, {
      conversationId: "legacy-resuelto",
      createdAt: "2026-08-01T08:00:00.000Z",
      status: "resuelto",
      assignedUserId: anaId,
      resolvedAt: "2026-08-01T10:00:00.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "legacy-cerrado",
      createdAt: "2026-08-02T08:00:00.000Z",
      status: "cerrado",
      assignedUserId: anaId,
      resolvedAt: "2026-08-02T14:00:00.000Z",
    });

    const auditedTicketId = insertTicket(sqlite, {
      conversationId: "auditado",
      createdAt: "2026-08-03T08:00:00.000Z",
      status: "resuelto",
      assignedUserId: anaId,
      resolvedAt: "2026-08-03T12:00:00.000Z",
    });
    insertStateChange(sqlite, {
      ticketId: auditedTicketId,
      from: "en_proceso",
      to: "resuelto",
      authorUserId: anaId,
      happenedAt: "2026-08-03T12:00:00.000Z",
      deadlineSnapshot: "2026-08-03T13:00:00.000Z",
    });

    // Un estado final sin fecha no aporta un hecho de finalizacion recuperable.
    insertTicket(sqlite, {
      conversationId: "legacy-sin-fecha",
      createdAt: "2026-08-04T08:00:00.000Z",
      status: "cerrado",
      assignedUserId: anaId,
    });
    insertTicket(sqlite, {
      conversationId: "legacy-fecha-anterior",
      createdAt: "2026-08-05T08:00:00.000Z",
      status: "cerrado",
      assignedUserId: anaId,
      resolvedAt: "2026-08-05T07:59:59.000Z",
    });
    insertTicket(sqlite, {
      conversationId: "legacy-fecha-futura",
      createdAt: "2026-08-06T08:00:00.000Z",
      status: "cerrado",
      assignedUserId: anaId,
      resolvedAt: "2026-09-01T08:00:00.000Z",
    });

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.tickets_evaluados, 6);
    assert.deepEqual(result.cobertura, {
      resoluciones_evaluadas: 3,
      resoluciones_atribuidas: 3,
      finalizaciones_historicas_detectadas: 2,
      finalizaciones_historicas_atribuidas: 2,
      porcentaje_atribucion: 100,
      atribucion_desde: new Date("2026-08-01T10:00:00.000Z"),
      comparacion_individual_estado: "insuficiente",
      minimo_resoluciones_comparables: 10,
      umbral_cobertura_parcial_porcentaje: 80,
      umbral_cobertura_disponible_porcentaje: 95,
    });
    assert.deepEqual(result.personas[0], {
      usuario: {
        id: anaId,
        nombre: "Ana",
        rol: "Agente",
        activo: true,
      },
      tickets_resueltos: 3,
      resoluciones_atribuidas: 3,
      finalizaciones_historicas_atribuidas: 2,
      tiempo_resolucion_atribuible: {
        muestra: 3,
        promedio_horas: 4,
        mediana_horas: 4,
      },
      cumplimiento_plazo_auditable: {
        muestra: 1,
        cumplidos: 1,
        porcentaje: 100,
      },
      carga_actual: {
        abiertos_asignados: 0,
        vencidos_asignados: 0,
      },
      resoluciones_reabiertas: 0,
    });
    sqlite.close();
  });

  it("habilita comparaciones con finalizaciones historicas atribuibles", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const anaId = insertUser(sqlite, { roleId, name: "Ana" });

    for (let index = 0; index < 12; index += 1) {
      insertTicket(sqlite, {
        conversationId: `legacy-${index}`,
        createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
        status: "resuelto",
        assignedUserId: anaId,
        resolvedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      });
    }

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.cobertura.resoluciones_evaluadas, 12);
    assert.equal(result.cobertura.resoluciones_atribuidas, 12);
    assert.equal(result.cobertura.porcentaje_atribucion, 100);
    assert.equal(result.cobertura.comparacion_individual_estado, "disponible");
    sqlite.close();
  });

  it("calcula la cobertura parcial sobre eventos e historial combinados", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const anaId = insertUser(sqlite, { roleId, name: "Ana" });

    for (let index = 0; index < 10; index += 1) {
      insertTicket(sqlite, {
        conversationId: `legacy-cobertura-${index}`,
        createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
        status: "resuelto",
        assignedUserId: index < 8 ? anaId : null,
        resolvedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      });
    }

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.cobertura.resoluciones_evaluadas, 10);
    assert.equal(result.cobertura.resoluciones_atribuidas, 8);
    assert.equal(result.cobertura.finalizaciones_historicas_detectadas, 10);
    assert.equal(result.cobertura.finalizaciones_historicas_atribuidas, 8);
    assert.equal(result.cobertura.porcentaje_atribucion, 80);
    assert.equal(result.cobertura.comparacion_individual_estado, "parcial");
    sqlite.close();
  });

  it("aplica todos los filtros y excluye la cuarentena de cada metrica", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite);
    const userId = insertUser(sqlite, { roleId, name: "Carla" });

    const addResolved = (input: TicketInput, quarantined = false): number => {
      const ticketId = insertTicket(sqlite, { ...input, status: "cerrado" });
      insertStateChange(sqlite, {
        ticketId,
        from: "nuevo",
        to: "cerrado",
        authorUserId: userId,
        happenedAt: new Date(
          Date.parse(input.createdAt) + 3_600_000,
        ).toISOString(),
      });
      if (quarantined) {
        sqlite
          .prepare("INSERT INTO tickets_cuarentena (ticket_id) VALUES (?)")
          .run(ticketId);
      }
      return ticketId;
    };

    addResolved({
      conversationId: "coincide",
      createdAt: "2026-08-05T12:00:00.000Z",
      company: "Servicios ACME_100% Norte",
      category: "embargos",
      priority: "urgente",
    });
    addResolved(
      {
        conversationId: "cuarentena",
        createdAt: "2026-08-06T12:00:00.000Z",
        company: "ACME_100%",
        category: "embargos",
        priority: "urgente",
      },
      true,
    );
    addResolved({
      conversationId: "comodines-no-literales",
      createdAt: "2026-08-07T12:00:00.000Z",
      company: "ACMEX1000",
      category: "embargos",
      priority: "urgente",
    });
    addResolved({
      conversationId: "otra-categoria",
      createdAt: "2026-08-08T12:00:00.000Z",
      company: "ACME_100%",
      category: "legales",
      priority: "urgente",
    });
    addResolved({
      conversationId: "otra-prioridad",
      createdAt: "2026-08-09T12:00:00.000Z",
      company: "ACME_100%",
      category: "embargos",
      priority: "alta",
    });
    addResolved({
      conversationId: "fuera-de-periodo",
      createdAt: "2026-07-31T12:00:00.000Z",
      company: "ACME_100%",
      category: "embargos",
      priority: "urgente",
    });

    const result = consultarRendimientoPersonas(
      database,
      {
        fecha_desde: new Date("2026-08-01T00:00:00.000Z"),
        fecha_hasta: new Date("2026-08-31T23:59:59.999Z"),
        empresa: "  ACME_100% ",
        motivo_categoria: "embargos",
        prioridad: "urgente",
      },
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.equal(result.tickets_evaluados, 1);
    assert.deepEqual(result.cobertura, {
      resoluciones_evaluadas: 1,
      resoluciones_atribuidas: 1,
      finalizaciones_historicas_detectadas: 0,
      finalizaciones_historicas_atribuidas: 0,
      porcentaje_atribucion: 100,
      atribucion_desde: new Date("2026-08-05T13:00:00.000Z"),
      comparacion_individual_estado: "insuficiente",
      minimo_resoluciones_comparables: 10,
      umbral_cobertura_parcial_porcentaje: 80,
      umbral_cobertura_disponible_porcentaje: 95,
    });
    assert.equal(result.personas[0]?.tickets_resueltos, 1);
    assert.equal(result.personas[0]?.resoluciones_atribuidas, 1);
    assert.equal(result.personas[0]?.tiempo_resolucion_atribuible.muestra, 1);
    sqlite.close();
  });

  it("incluye usuarios activos e inactivos ordenados A-Z con ceros explicitos", () => {
    const { sqlite, database } = createDatabase();
    const roleId = insertRole(sqlite, "Operador");
    const alvaroId = insertUser(sqlite, {
      roleId,
      name: "Álvaro",
      surname: "Zárate",
    });
    const anaId = insertUser(sqlite, {
      roleId,
      name: "Ana",
      surname: "Alvarez",
      active: false,
    });

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(result.personas, [
      {
        usuario: {
          id: alvaroId,
          nombre: "Álvaro Zárate",
          rol: "Operador",
          activo: true,
        },
        tickets_resueltos: 0,
        resoluciones_atribuidas: 0,
        finalizaciones_historicas_atribuidas: 0,
        tiempo_resolucion_atribuible: {
          muestra: 0,
          promedio_horas: null,
          mediana_horas: null,
        },
        cumplimiento_plazo_auditable: {
          muestra: 0,
          cumplidos: 0,
          porcentaje: null,
        },
        carga_actual: {
          abiertos_asignados: 0,
          vencidos_asignados: 0,
        },
        resoluciones_reabiertas: 0,
      },
      {
        usuario: {
          id: anaId,
          nombre: "Ana Alvarez",
          rol: "Operador",
          activo: false,
        },
        tickets_resueltos: 0,
        resoluciones_atribuidas: 0,
        finalizaciones_historicas_atribuidas: 0,
        tiempo_resolucion_atribuible: {
          muestra: 0,
          promedio_horas: null,
          mediana_horas: null,
        },
        cumplimiento_plazo_auditable: {
          muestra: 0,
          cumplidos: 0,
          porcentaje: null,
        },
        carga_actual: {
          abiertos_asignados: 0,
          vencidos_asignados: 0,
        },
        resoluciones_reabiertas: 0,
      },
    ]);
    sqlite.close();
  });

  it("devuelve el estado vacio y rechaza un reloj invalido", () => {
    const { sqlite, database } = createDatabase();

    const result = consultarRendimientoPersonas(
      database,
      {},
      new Date("2026-08-31T12:00:00.000Z"),
    );

    assert.deepEqual(result, {
      tickets_evaluados: 0,
      cobertura: {
        resoluciones_evaluadas: 0,
        resoluciones_atribuidas: 0,
        finalizaciones_historicas_detectadas: 0,
        finalizaciones_historicas_atribuidas: 0,
        porcentaje_atribucion: null,
        atribucion_desde: null,
        comparacion_individual_estado: "insuficiente",
        minimo_resoluciones_comparables: 10,
        umbral_cobertura_parcial_porcentaje: 80,
        umbral_cobertura_disponible_porcentaje: 95,
      },
      personas: [],
    });
    assert.throws(
      () => consultarRendimientoPersonas(database, {}, new Date(Number.NaN)),
      /instante del rendimiento individual no es valido/,
    );
    sqlite.close();
  });
});
