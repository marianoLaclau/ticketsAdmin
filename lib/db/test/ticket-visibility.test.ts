import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  esTicketVacio,
  ticketVacioCondition,
  ticketVisibleCondition,
  type TicketVisibilityInput,
} from "../src/ticket-visibility";
import { ticketsTable, type Ticket } from "../src/schema/tickets";

const ticketVacio: Partial<Ticket> = {
  nombre: "  Sin nombre proporcionado  ",
  apellido: "\t\r\n",
  telefono: null,
  dni: "",
  empresa: null,
  email: "\u00a0",
  motivo: " Sin especificar ",
  resumen: null,
  notas: "",
  estado: "nuevo",
  prioridad: "media",
  progreso: 0,
  notificado: false,
  asignado_usuario_id: null,
  asignado_a: "\ufeff",
};

describe("esTicketVacio", () => {
  it("exige que todas las condiciones se cumplan a la vez", () => {
    assert.equal(esTicketVacio(ticketVacio), true);
    assert.equal(esTicketVacio({}), true);
    assert.equal(
      esTicketVacio({ ...ticketVacio, nombre: " SIN NOMBRE " }),
      true,
    );
  });

  it("ignora metadatos tecnicos, categoria, fechas y audio", () => {
    assert.equal(
      esTicketVacio({
        ...ticketVacio,
        conversation_id: "conv-123",
        hora: "2026-07-20T10:00:00.000Z",
        motivo_categoria: "legales",
        audio_url: "https://example.test/llamada.mp3",
        fecha_creacion: new Date("2026-07-20T10:00:00.000Z"),
        fecha_limite: new Date("2026-07-22T10:00:00.000Z"),
        fecha_resolucion: new Date("2026-07-20T11:00:00.000Z"),
      }),
      true,
    );
  });

  it("deja de ser vacio ante cualquier dato o gestion operativa", () => {
    const casos: TicketVisibilityInput[] = [
      { nombre: "Ana" },
      { apellido: "Perez" },
      { telefono: "1122334455" },
      { dni: "30111222" },
      { empresa: "GSB" },
      { email: "ana@example.test" },
      { motivo: "Consulta por recibo" },
      { resumen: "Solicito informacion" },
      { notas: "Revisar manana" },
      { estado: "en_proceso" },
      { prioridad: "alta" },
      { progreso: 1 },
      { notificado: true },
      { asignado_usuario_id: 7 },
      { asignado_a: "Operador" },
      { tiene_seguimientos: true },
    ];

    for (const dato of casos) {
      assert.equal(
        esTicketVacio({ ...ticketVacio, ...dato }),
        false,
        `el caso ${JSON.stringify(dato)} debe considerarse visible`,
      );
    }
  });
});

describe("condiciones SQL de visibilidad", () => {
  it("mantienen la misma clasificacion que el helper puro", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        apellido TEXT NOT NULL,
        telefono TEXT,
        dni TEXT,
        empresa TEXT,
        email TEXT,
        motivo TEXT NOT NULL,
        resumen TEXT,
        notas TEXT,
        estado TEXT NOT NULL,
        prioridad TEXT NOT NULL,
        progreso INTEGER NOT NULL,
        notificado INTEGER NOT NULL,
        asignado_usuario_id INTEGER,
        asignado_a TEXT
      );
      CREATE TABLE seguimientos (
        id INTEGER PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        nota TEXT NOT NULL
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO tickets (
        id, nombre, apellido, telefono, dni, empresa, email, motivo, resumen,
        notas, estado, prioridad, progreso, notificado, asignado_usuario_id,
        asignado_a
      ) VALUES (
        @id, @nombre, @apellido, @telefono, @dni, @empresa, @email, @motivo,
        @resumen, @notas, @estado, @prioridad, @progreso, @notificado,
        @asignado_usuario_id, @asignado_a
      )
    `);

    insert.run({
      id: 1,
      ...ticketVacio,
      notificado: 0,
    });
    insert.run({
      id: 2,
      ...ticketVacio,
      nombre: "Ana",
      notificado: 0,
    });
    insert.run({
      id: 3,
      ...ticketVacio,
      notificado: 0,
    });
    sqlite.prepare(
      "INSERT INTO seguimientos (id, ticket_id, nota) VALUES (?, ?, ?)",
    ).run(1, 3, "Registro revisado");

    const database = drizzle(sqlite);
    const vacios = database
      .select({ id: ticketsTable.id })
      .from(ticketsTable)
      .where(ticketVacioCondition)
      .all();
    const visibles = database
      .select({ id: ticketsTable.id })
      .from(ticketsTable)
      .where(ticketVisibleCondition)
      .all();

    assert.deepEqual(vacios, [{ id: 1 }]);
    assert.deepEqual(visibles, [{ id: 2 }, { id: 3 }]);
    sqlite.close();
  });
});
