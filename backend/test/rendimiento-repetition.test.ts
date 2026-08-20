import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ticketsCuarentenaTable,
  ticketsTable,
  usuariosTable,
} from "@workspace/db/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { runRendimientoRepetitionQuery } from "../src/modules/rendimiento/data/repetition-query";

type LoggedQuery = {
  sql: string;
  params: unknown[];
};

function createDatabase(queryLog?: LoggedQuery[]) {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT,
      email TEXT NOT NULL UNIQUE,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      activo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL UNIQUE,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      telefono TEXT,
      dni TEXT,
      empresa TEXT,
      email TEXT,
      motivo TEXT NOT NULL,
      motivo_categoria TEXT NOT NULL,
      estado TEXT NOT NULL,
      prioridad TEXT NOT NULL,
      asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      asignado_a TEXT,
      fecha_creacion INTEGER NOT NULL,
      fecha_limite INTEGER
    );
    CREATE TABLE tickets_cuarentena (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);
  const database = drizzle(sqlite, {
    schema: { ticketsTable, ticketsCuarentenaTable, usuariosTable },
    ...(queryLog
      ? {
          logger: {
            logQuery(sql: string, params: unknown[]) {
              queryLog.push({ sql, params });
            },
          },
        }
      : {}),
  });
  return { sqlite, database };
}

function insertUser(sqlite: Database.Database, name: string): number {
  sqlite
    .prepare("INSERT OR IGNORE INTO roles (id, nombre) VALUES (1, 'Agente')")
    .run();
  return Number(
    sqlite
      .prepare("INSERT INTO usuarios (nombre, email, role_id) VALUES (?, ?, 1)")
      .run(name, `${name.toLowerCase()}-${crypto.randomUUID()}@test.local`)
      .lastInsertRowid,
  );
}

type TicketInput = {
  conversationId: string;
  createdAt: string;
  name?: string;
  surname?: string;
  dni?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  category?: string;
  status?: string;
  priority?: string;
  assignedUserId?: number | null;
  assignedName?: string | null;
  deadline?: string | null;
};

function insertTicket(sqlite: Database.Database, input: TicketInput): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO tickets (
          conversation_id, hora, nombre, apellido, telefono, dni, empresa,
          email, motivo, motivo_categoria, estado, prioridad,
          asignado_usuario_id, asignado_a, fecha_creacion, fecha_limite
        ) VALUES (?, '10:00', ?, ?, ?, ?, ?, ?, 'Consulta', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.conversationId,
        input.name ?? "Persona",
        input.surname ?? "",
        input.phone ?? null,
        input.dni ?? null,
        input.company ?? null,
        input.email ?? null,
        input.category ?? "legales",
        input.status ?? "nuevo",
        input.priority ?? "media",
        input.assignedUserId ?? null,
        input.assignedName ?? null,
        Date.parse(input.createdAt),
        input.deadline ? Date.parse(input.deadline) : null,
      ).lastInsertRowid,
  );
}

describe("consulta de contactos reiterados", () => {
  it("agrupa por clave canonica, enmascara PII y calcula riesgo y responsables", () => {
    const { sqlite, database } = createDatabase();
    const anaId = insertUser(sqlite, "Ana");
    const now = new Date("2026-08-15T12:00:00.000Z");

    const oldId = insertTicket(sqlite, {
      conversationId: "dni-abierto-vencido",
      createdAt: "2026-08-10T12:00:00.000Z",
      name: "Nombre viejo",
      dni: "30.111.222",
      phone: "+54 (11) 4444-5555",
      email: "Persona@Example.COM",
      status: "en_proceso",
      priority: "urgente",
      assignedUserId: anaId,
      assignedName: "Snapshot anterior",
      deadline: "2026-08-14T12:00:00.000Z",
    });
    const recentId = insertTicket(sqlite, {
      conversationId: "dni-final",
      createdAt: "2026-08-12T12:00:00.000Z",
      name: "Nombre reciente",
      surname: "Apellido",
      dni: "30111222",
      phone: "54 11 4444 5555",
      email: "Persona@Example.COM",
      status: "cerrado",
      priority: "baja",
    });
    insertTicket(sqlite, {
      conversationId: "sin-identidad-util",
      createdAt: "2026-08-13T12:00:00.000Z",
      dni: "123",
      phone: "555",
      email: "correo incompleto",
    });

    const result = runRendimientoRepetitionQuery(database, {}, now);

    assert.deepEqual(result.cobertura, {
      identidad_utilizable: { numerador: 2, denominador: 3, porcentaje: 66.7 },
      ambiguos_detectados: 0,
      criterio: "clave_canonica_no_transitiva",
    });
    assert.deepEqual(result.resumen, {
      contactos_reiterados: 1,
      tickets_involucrados: 2,
      abiertos: 1,
      vencidos_abiertos: 1,
    });
    const contact = result.contactos[0]!;
    assert.equal(contact.grupo_id, "grupo-1");
    assert.equal(contact.nombre_referencia, "Nombre reciente Apellido");
    assert.deepEqual(contact.coincidencia, {
      tipo: "dni",
      valor_enmascarado: "DNI ••••1222",
    });
    assert.equal(contact.antiguedad_abierto_horas, 120);
    assert.equal(contact.prioridad_maxima, "urgente");
    assert.deepEqual(contact.responsables, [
      { usuario_id: anaId, nombre: "Ana", cantidad_abiertos: 1 },
    ]);
    assert.deepEqual(
      contact.tickets.map((ticket) => ticket.id),
      [recentId, oldId],
    );
    assert.equal(contact.tickets[1]?.asignado_a, "Ana");
    assert.equal(contact.tickets[0]?.vencido, false);
    assert.equal(contact.tickets[1]?.vencido, true);
    assert.doesNotMatch(
      JSON.stringify(result),
      /30111222|541144445555|Persona@Example/i,
    );
    sqlite.close();
  });

  it("hereda una identidad secundaria a un unico DNI sin encadenar puentes", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "a-dni",
      createdAt: "2026-08-01T10:00:00.000Z",
      dni: "30111222",
      phone: "11112222",
      status: "resuelto",
    });
    insertTicket(sqlite, {
      conversationId: "b-puente-directo",
      createdAt: "2026-08-02T10:00:00.000Z",
      phone: "11112222",
      email: "puente@example.test",
      status: "en_proceso",
    });
    insertTicket(sqlite, {
      conversationId: "c-no-transitivo",
      createdAt: "2026-08-03T10:00:00.000Z",
      email: "PUENTE@example.test",
      status: "nuevo",
    });
    insertTicket(sqlite, {
      conversationId: "d-misma-clave-no-transitiva",
      createdAt: "2026-08-04T10:00:00.000Z",
      email: "puente@example.test",
      status: "resuelto",
    });

    const result = runRendimientoRepetitionQuery(
      database,
      {},
      new Date("2026-08-10T00:00:00.000Z"),
    );

    assert.equal(result.contactos.length, 2);
    assert.equal(result.contactos[0]?.coincidencia.tipo, "dni");
    assert.equal(result.contactos[0]?.cantidad_llamados, 2);
    assert.equal(result.contactos[0]?.nombre_referencia, "Persona");
    assert.deepEqual(
      result.contactos[0]?.tickets.map((ticket) => ticket.id),
      [2, 1],
    );
    assert.equal(result.contactos[1]?.coincidencia.tipo, "email");
    assert.equal(
      result.contactos[1]?.coincidencia.valor_enmascarado,
      "p***@example.test",
    );
    assert.deepEqual(
      result.contactos[1]?.tickets.map((ticket) => ticket.id),
      [4, 3],
    );
    assert.doesNotMatch(JSON.stringify(result), /puente@example\.test/i);
    sqlite.close();
  });

  it("no hereda cuando una identidad secundaria apunta a varios DNI", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "dni-uno",
      createdAt: "2026-08-01T10:00:00.000Z",
      dni: "30111222",
      phone: "11112222",
      status: "resuelto",
    });
    insertTicket(sqlite, {
      conversationId: "dni-dos",
      createdAt: "2026-08-02T10:00:00.000Z",
      dni: "30999888",
      phone: "11112222",
      status: "resuelto",
    });
    insertTicket(sqlite, {
      conversationId: "ambiguo-abierto",
      createdAt: "2026-08-03T10:00:00.000Z",
      phone: "11112222",
      status: "nuevo",
    });

    const result = runRendimientoRepetitionQuery(
      database,
      {},
      new Date("2026-08-10T00:00:00.000Z"),
    );

    assert.equal(result.cobertura.ambiguos_detectados, 1);
    assert.equal(result.contactos.length, 0);
    assert.equal(result.resumen.tickets_involucrados, 0);
    sqlite.close();
  });

  it("no agrupa contactos por valores centinela con formato válido", () => {
    const { sqlite, database } = createDatabase();
    for (const [index, status] of ["cerrado", "nuevo"].entries()) {
      insertTicket(sqlite, {
        conversationId: `centinela-${index}`,
        createdAt: `2026-08-0${index + 1}T10:00:00.000Z`,
        dni: "00.000.000",
        phone: "+54 11 1111-1111",
        email: "sin.email@example.com",
        status,
      });
    }

    const result = runRendimientoRepetitionQuery(
      database,
      {},
      new Date("2026-08-10T00:00:00.000Z"),
    );

    assert.deepEqual(result.cobertura.identidad_utilizable, {
      numerador: 0,
      denominador: 2,
      porcentaje: 0,
    });
    assert.equal(result.contactos.length, 0);
    assert.equal(result.resumen.contactos_reiterados, 0);
    sqlite.close();
  });

  it("prioriza la herencia univoca por telefono aunque el email apunte a otro DNI", () => {
    const { sqlite, database } = createDatabase();
    insertTicket(sqlite, {
      conversationId: "dni-por-telefono",
      createdAt: "2026-08-01T10:00:00.000Z",
      dni: "30111222",
      phone: "11112222",
      status: "resuelto",
    });
    insertTicket(sqlite, {
      conversationId: "dni-por-email",
      createdAt: "2026-08-02T10:00:00.000Z",
      dni: "30999888",
      email: "cruce@example.test",
      status: "resuelto",
    });
    insertTicket(sqlite, {
      conversationId: "secundario-con-ambos",
      createdAt: "2026-08-03T10:00:00.000Z",
      phone: "11112222",
      email: "cruce@example.test",
      status: "nuevo",
    });

    const result = runRendimientoRepetitionQuery(
      database,
      {},
      new Date("2026-08-10T00:00:00.000Z"),
    );

    assert.equal(result.cobertura.ambiguos_detectados, 0);
    assert.equal(result.contactos.length, 1);
    assert.equal(
      result.contactos[0]?.coincidencia.valor_enmascarado,
      "DNI ••••1222",
    );
    assert.deepEqual(
      result.contactos[0]?.tickets.map((ticket) => ticket.id),
      [3, 1],
    );
    sqlite.close();
  });

  it("aplica el conjunto analizado completo, cuarentena y limites inclusivos antes de agrupar", () => {
    const { sqlite, database } = createDatabase();
    const matching = (conversationId: string, createdAt: string) =>
      insertTicket(sqlite, {
        conversationId,
        createdAt,
        email: " repetido@EXAMPLE.test ",
        company: "Grupo_ACME%",
        category: "embargos",
        priority: "alta",
        status: conversationId.endsWith("abierto") ? "nuevo" : "cerrado",
      });
    matching("inicio-final", "2026-08-01T00:00:00.000Z");
    matching("fin-abierto", "2026-08-31T23:59:59.999Z");
    matching("fuera-abierto", "2026-09-01T00:00:00.000Z");
    insertTicket(sqlite, {
      conversationId: "otra-prioridad",
      createdAt: "2026-08-10T00:00:00.000Z",
      email: "repetido@example.test",
      company: "Grupo_ACME%",
      category: "embargos",
      priority: "urgente",
    });
    const quarantined = matching(
      "cuarentena-abierto",
      "2026-08-20T00:00:00.000Z",
    );
    sqlite
      .prepare("INSERT INTO tickets_cuarentena (ticket_id) VALUES (?)")
      .run(quarantined);

    const result = runRendimientoRepetitionQuery(
      database,
      {
        fecha_desde: new Date("2026-08-01T00:00:00.000Z"),
        fecha_hasta: new Date("2026-08-31T23:59:59.999Z"),
        empresa: "_ACME%",
        motivo_categoria: "embargos",
        prioridad: "alta",
      },
      new Date("2026-09-02T00:00:00.000Z"),
    );

    assert.equal(result.tickets_evaluados, 2);
    assert.equal(result.contactos.length, 1);
    assert.equal(result.contactos[0]?.cantidad_llamados, 2);
    sqlite.close();
  });

  it("ordena por riesgo y trata fecha limite igual al snapshot como no vencida", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-15T12:00:00.000Z");
    const addGroup = (
      email: string,
      base: string,
      priority: string,
      deadline: string,
      assignedName: string,
    ) => {
      insertTicket(sqlite, {
        conversationId: `${base}-final`,
        createdAt: "2026-08-10T00:00:00.000Z",
        email,
        status: "cerrado",
        priority,
      });
      insertTicket(sqlite, {
        conversationId: `${base}-abierto`,
        createdAt: "2026-08-11T00:00:00.000Z",
        email,
        status: "pendiente",
        priority,
        deadline,
        assignedName,
      });
    };
    addGroup(
      "vencido@example.test",
      "vencido",
      "media",
      "2026-08-15T11:59:59.999Z",
      "Operador histórico",
    );
    addGroup("limite@example.test", "limite", "urgente", now.toISOString(), "");

    const result = runRendimientoRepetitionQuery(database, {}, now);

    assert.equal(result.contactos[0]?.vencidos_abiertos, 1);
    assert.equal(result.contactos[1]?.vencidos_abiertos, 0);
    assert.equal(result.contactos[1]?.prioridad_maxima, "urgente");
    assert.deepEqual(result.contactos[0]?.responsables, [
      {
        usuario_id: null,
        nombre: "Operador histórico",
        cantidad_abiertos: 1,
      },
    ]);
    assert.deepEqual(result.contactos[1]?.responsables, [
      { usuario_id: null, nombre: "Sin asignar", cantidad_abiertos: 1 },
    ]);
    assert.equal(result.contactos[1]?.tickets[0]?.vencido, false);
    sqlite.close();
  });

  it("incluye contactos finalizados sin desplazar a los que requieren seguimiento", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-15T12:00:00.000Z");

    insertTicket(sqlite, {
      conversationId: "finalizados-resuelto",
      createdAt: "2026-08-10T12:00:00.000Z",
      name: "Contacto finalizado",
      email: "finalizados@example.test",
      status: "resuelto",
      priority: "alta",
    });
    insertTicket(sqlite, {
      conversationId: "finalizados-cerrado",
      createdAt: "2026-08-11T12:00:00.000Z",
      name: "Contacto finalizado",
      email: "finalizados@example.test",
      status: "cerrado",
      priority: "urgente",
    });
    insertTicket(sqlite, {
      conversationId: "seguimiento-final",
      createdAt: "2026-08-12T12:00:00.000Z",
      name: "Contacto con seguimiento",
      email: "seguimiento@example.test",
      status: "cerrado",
      priority: "urgente",
    });
    insertTicket(sqlite, {
      conversationId: "seguimiento-abierto",
      createdAt: "2026-08-14T12:00:00.000Z",
      name: "Contacto con seguimiento",
      email: "seguimiento@example.test",
      status: "nuevo",
      priority: "baja",
    });

    const result = runRendimientoRepetitionQuery(database, {}, now);

    assert.deepEqual(result.resumen, {
      contactos_reiterados: 2,
      tickets_involucrados: 4,
      abiertos: 1,
      vencidos_abiertos: 0,
    });
    assert.deepEqual(
      result.contactos.map((contact) => contact.nombre_referencia),
      ["Contacto con seguimiento", "Contacto finalizado"],
    );

    const activeContact = result.contactos[0]!;
    assert.equal(activeContact.abiertos, 1);
    assert.equal(activeContact.antiguedad_abierto_horas, 24);
    assert.equal(activeContact.prioridad_maxima, "baja");

    const finalizedContact = result.contactos[1]!;
    assert.equal(finalizedContact.abiertos, 0);
    assert.equal(finalizedContact.vencidos_abiertos, 0);
    assert.equal(finalizedContact.antiguedad_abierto_horas, null);
    assert.equal(finalizedContact.prioridad_maxima, null);
    assert.deepEqual(finalizedContact.responsables, []);
    assert.equal(
      finalizedContact.tickets.every((ticket) => ticket.vencido === false),
      true,
    );

    sqlite.close();
  });

  it("devuelve el estado vacio y rechaza un reloj invalido", () => {
    const { sqlite, database } = createDatabase();
    const result = runRendimientoRepetitionQuery(
      database,
      {},
      new Date("2026-08-15T12:00:00.000Z"),
    );

    assert.deepEqual(result, {
      pagina: 1,
      limite: 20,
      total_paginas: 0,
      tickets_evaluados: 0,
      cobertura: {
        identidad_utilizable: {
          numerador: 0,
          denominador: 0,
          porcentaje: null,
        },
        ambiguos_detectados: 0,
        criterio: "clave_canonica_no_transitiva",
      },
      resumen: {
        contactos_reiterados: 0,
        tickets_involucrados: 0,
        abiertos: 0,
        vencidos_abiertos: 0,
      },
      contactos: [],
    });
    assert.throws(
      () => runRendimientoRepetitionQuery(database, {}, new Date(Number.NaN)),
      /instante de reiteraciones no es valido/,
    );
    sqlite.close();
  });

  it("pagina grupos en SQL sin recortar cobertura ni resumen global", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-20T12:00:00.000Z");

    for (let group = 1; group <= 5; group += 1) {
      const day = String(group).padStart(2, "0");
      const email = `grupo-${group}@example.test`;
      insertTicket(sqlite, {
        conversationId: `grupo-${group}-cerrado`,
        createdAt: `2026-08-${day}T08:00:00.000Z`,
        name: `Contacto ${group}`,
        email,
        status: "cerrado",
      });
      insertTicket(sqlite, {
        conversationId: `grupo-${group}-abierto`,
        createdAt: `2026-08-${day}T10:00:00.000Z`,
        name: `Contacto ${group}`,
        email,
        status: "nuevo",
      });
    }

    const firstPage = runRendimientoRepetitionQuery(
      database,
      { pagina: 1, limite: 2 },
      now,
    );
    const secondPage = runRendimientoRepetitionQuery(
      database,
      { pagina: 2, limite: 2 },
      now,
    );
    const emptyPage = runRendimientoRepetitionQuery(
      database,
      { pagina: 4, limite: 2 },
      now,
    );

    const globalSummary = {
      contactos_reiterados: 5,
      tickets_involucrados: 10,
      abiertos: 5,
      vencidos_abiertos: 0,
    };
    assert.deepEqual(
      {
        pagina: firstPage.pagina,
        limite: firstPage.limite,
        total_paginas: firstPage.total_paginas,
        tickets_evaluados: firstPage.tickets_evaluados,
      },
      { pagina: 1, limite: 2, total_paginas: 3, tickets_evaluados: 10 },
    );
    assert.deepEqual(firstPage.resumen, globalSummary);
    assert.deepEqual(secondPage.resumen, globalSummary);
    assert.deepEqual(emptyPage.resumen, globalSummary);
    assert.deepEqual(firstPage.cobertura.identidad_utilizable, {
      numerador: 10,
      denominador: 10,
      porcentaje: 100,
    });
    assert.deepEqual(
      firstPage.contactos.map((contact) => contact.grupo_id),
      ["grupo-1", "grupo-2"],
    );
    assert.deepEqual(
      secondPage.contactos.map((contact) => contact.grupo_id),
      ["grupo-3", "grupo-4"],
    );
    assert.deepEqual(
      secondPage.contactos.map((contact) => contact.nombre_referencia),
      ["Contacto 3", "Contacto 4"],
    );
    assert.deepEqual(
      {
        pagina: emptyPage.pagina,
        limite: emptyPage.limite,
        total_paginas: emptyPage.total_paginas,
        contactos: emptyPage.contactos,
      },
      { pagina: 4, limite: 2, total_paginas: 3, contactos: [] },
    );

    sqlite.close();
  });

  it("materializa una sola vez el conjunto analizado y las claves canonicas por lectura", () => {
    const queryLog: LoggedQuery[] = [];
    const { sqlite, database } = createDatabase(queryLog);
    const now = new Date("2026-08-20T12:00:00.000Z");

    insertTicket(sqlite, {
      conversationId: "plan-abierto",
      createdAt: "2026-08-01T10:00:00.000Z",
      phone: "1161234567",
      status: "nuevo",
    });
    insertTicket(sqlite, {
      conversationId: "plan-cerrado",
      createdAt: "2026-08-02T10:00:00.000Z",
      phone: "11 6123-4567",
      status: "cerrado",
    });

    runRendimientoRepetitionQuery(database, { pagina: 1, limite: 20 }, now);

    assert.equal(queryLog.length, 2);
    for (const query of queryLog) {
      const plan = sqlite
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...query.params) as Array<{ detail: string }>;
      const details = plan.map((step) => step.detail).join("\n");
      const ticketReads = plan.filter((step) =>
        /^(?:SCAN|SEARCH) tickets(?:\s|$)/.test(step.detail),
      );

      assert.match(details, /MATERIALIZE cohort/);
      assert.match(details, /MATERIALIZE canonical/);
      assert.equal(ticketReads.length, 1);
    }

    sqlite.close();
  });

  it("valida pagina y limita el tamano maximo a cincuenta grupos", () => {
    const { sqlite, database } = createDatabase();
    const now = new Date("2026-08-20T12:00:00.000Z");

    assert.throws(
      () =>
        runRendimientoRepetitionQuery(database, { pagina: 0, limite: 20 }, now),
      /pagina de reiteraciones debe ser un entero positivo/,
    );
    assert.throws(
      () =>
        runRendimientoRepetitionQuery(
          database,
          { pagina: 1.5, limite: 20 },
          now,
        ),
      /pagina de reiteraciones debe ser un entero positivo/,
    );
    assert.throws(
      () =>
        runRendimientoRepetitionQuery(
          database,
          { pagina: Number.MAX_SAFE_INTEGER + 1, limite: 20 },
          now,
        ),
      /pagina de reiteraciones debe ser un entero positivo/,
    );
    assert.throws(
      () =>
        runRendimientoRepetitionQuery(database, { pagina: 1, limite: 51 }, now),
      /limite de reiteraciones debe ser un entero entre 1 y 50/,
    );
    assert.equal(
      runRendimientoRepetitionQuery(database, { limite: 50 }, now).limite,
      50,
    );

    sqlite.close();
  });
});
