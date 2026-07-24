import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import {
  crearNotaPromocionPrioridad,
  crearRepositorioPrioridadAutomaticaDb,
  emitirPromocionPrioridadSse,
  ejecutarCicloPrioridadAutomatica,
  type CargarModuloDbPrioridad,
  type RepositorioPrioridadAutomatica,
} from "../src/lib/prioridad-automatica.ts";

function crearBase(opciones: { forzarFalloAuditoria?: boolean } = {}) {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      estado TEXT NOT NULL,
      prioridad TEXT NOT NULL,
      fecha_limite INTEGER
    );
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
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
      autor TEXT NOT NULL${opciones.forzarFalloAuditoria ? " CHECK (autor <> 'Sistema')" : ""},
      fecha_creacion INTEGER NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  const cargarModulo: CargarModuloDbPrioridad = async () => ({
    db,
    ticketsTable: schema.ticketsTable,
    seguimientosTable: schema.seguimientosTable,
    // En esta fixture el id 4 representa un registro en cuarentena.
    ticketVisibleCondition: sql<boolean>`${schema.ticketsTable.id} <> 4`,
  });

  return {
    sqlite,
    repositorio: crearRepositorioPrioridadAutomaticaDb(cargarModulo),
  };
}

function insertarTicket(
  sqlite: Database.Database,
  valores: {
    id: number;
    estado?: string;
    prioridad?: string;
    fechaLimite?: Date | null;
  },
): void {
  sqlite.prepare(`
    INSERT INTO tickets (id, estado, prioridad, fecha_limite)
    VALUES (?, ?, ?, ?)
  `).run(
    valores.id,
    valores.estado ?? "nuevo",
    valores.prioridad ?? "media",
    valores.fechaLimite === null
      ? null
      : (valores.fechaLimite ?? new Date("2026-07-23T13:00:00.000Z")).getTime(),
  );
}

describe("repositorio transaccional de prioridad automatica", () => {
  it("filtra visibles/no finalizados y persiste promocion con auditoria atomica", async () => {
    const { sqlite, repositorio } = crearBase();
    const fechaLimite = new Date("2026-07-23T13:00:00.000Z");
    insertarTicket(sqlite, { id: 1, fechaLimite });
    insertarTicket(sqlite, { id: 2, estado: "resuelto", fechaLimite });
    insertarTicket(sqlite, { id: 3, fechaLimite: null });
    insertarTicket(sqlite, { id: 4, fechaLimite });

    const candidatos = await repositorio.listarCandidatos();
    assert.deepEqual(candidatos.map(({ id }) => id), [1]);

    const cambio = {
      ticketId: 1,
      prioridadEsperada: "media" as const,
      prioridadNueva: "alta" as const,
      fechaLimiteEsperada: fechaLimite,
      horasHabilesRestantes: 24,
    };
    assert.equal(await repositorio.promoverSiCoincide(cambio), true);

    const ticket = sqlite
      .prepare("SELECT prioridad FROM tickets WHERE id = 1")
      .get() as { prioridad: string };
    const seguimientos = sqlite.prepare(`
      SELECT ticket_id, nota, prioridad_anterior, prioridad_nueva, autor
      FROM seguimientos
      WHERE ticket_id = 1
    `).all() as Array<Record<string, unknown>>;

    assert.equal(ticket.prioridad, "alta");
    assert.equal(seguimientos.length, 1);
    assert.deepEqual(
      {
        ticket_id: seguimientos[0]?.ticket_id,
        prioridad_anterior: seguimientos[0]?.prioridad_anterior,
        prioridad_nueva: seguimientos[0]?.prioridad_nueva,
        autor: seguimientos[0]?.autor,
      },
      {
        ticket_id: 1,
        prioridad_anterior: "media",
        prioridad_nueva: "alta",
        autor: "Sistema",
      },
    );
    assert.match(String(seguimientos[0]?.nota), /MEDIA a ALTA/);
    assert.match(String(seguimientos[0]?.nota), /24 horas hábiles restantes/);

    // El mismo compare-and-set ya no coincide: tampoco duplica la auditoria.
    assert.equal(await repositorio.promoverSiCoincide(cambio), false);
    const [{ total }] = sqlite
      .prepare("SELECT count(*) AS total FROM seguimientos")
      .all() as Array<{ total: number }>;
    assert.equal(total, 1);
    sqlite.close();
  });

  it("revierte el cambio del ticket si falla el insert de auditoria", async () => {
    const { sqlite, repositorio } = crearBase({ forzarFalloAuditoria: true });
    const fechaLimite = new Date("2026-07-23T13:00:00.000Z");
    insertarTicket(sqlite, { id: 1, fechaLimite });

    await assert.rejects(
      repositorio.promoverSiCoincide({
        ticketId: 1,
        prioridadEsperada: "media",
        prioridadNueva: "alta",
        fechaLimiteEsperada: fechaLimite,
        horasHabilesRestantes: 24,
      }),
      /CHECK constraint failed/,
    );

    const ticket = sqlite
      .prepare("SELECT prioridad FROM tickets WHERE id = 1")
      .get() as { prioridad: string };
    assert.equal(ticket.prioridad, "media");
    sqlite.close();
  });
});

describe("notificacion de una promocion", () => {
  it("emite ticket_actualizado despues de confirmar el repositorio", async () => {
    const orden: string[] = [];
    const repositorio: RepositorioPrioridadAutomatica = {
      listarCandidatos: async () => [{
        id: 7,
        estado: "nuevo",
        prioridad: "media",
        fechaLimite: new Date("2026-07-22T23:00:00.000Z"),
        visible: true,
      }],
      promoverSiCoincide: async () => {
        orden.push("transaccion_confirmada");
        return true;
      },
    };

    await ejecutarCicloPrioridadAutomatica(
      repositorio,
      new Date("2026-07-22T13:00:00.000Z"),
      () => {
        orden.push("sse");
      },
    );
    assert.deepEqual(orden, ["transaccion_confirmada", "sse"]);
  });

  it("construye una nota humana y un payload SSE estable", () => {
    const nota = crearNotaPromocionPrioridad({
      prioridadEsperada: "alta",
      prioridadNueva: "urgente",
      horasHabilesRestantes: -2.5,
    });
    assert.equal(
      nota,
      "Prioridad actualizada automáticamente de ALTA a URGENTE por proximidad al vencimiento (vencido hace 2,5 horas hábiles).",
    );

    const emisiones: Array<{ tipo: string; data: Record<string, unknown> }> = [];
    emitirPromocionPrioridadSse(
      {
        ticketId: 9,
        prioridadAnterior: "alta",
        prioridadNueva: "urgente",
        horasHabilesRestantes: 12,
      },
      (tipo, data = {}) => emisiones.push({ tipo, data }),
    );

    assert.deepEqual(emisiones, [{
      tipo: "ticket_actualizado",
      data: {
        ticket_id: 9,
        prioridad: "urgente",
        prioridad_anterior: "alta",
        prioridad_nueva: "urgente",
        origen: "prioridad_automatica",
      },
    }]);
  });
});
