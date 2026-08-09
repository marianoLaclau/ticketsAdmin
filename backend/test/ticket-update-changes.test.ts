import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Ticket } from "@workspace/db/schema";
import { buildTicketUpdateChanges } from "../src/lib/ticket-update-changes.ts";
import {
  parseTicketUpdateBody,
  type ParsedTicketUpdateBody,
} from "../src/lib/ticket-update-validation.ts";

const NOW = new Date("2026-08-07T15:00:00.000Z");

function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 1,
    version: 3,
    conversation_id: "conv-1",
    hora: "09:15",
    nombre: "Ana",
    apellido: "Pérez",
    telefono: "1111",
    dni: "30111222",
    empresa: "Alfa",
    estado_empleado: "Activo",
    email: "ana@example.test",
    motivo: "Consulta general",
    motivo_categoria: "contacto_general",
    resumen: null,
    notificado: false,
    estado: "nuevo",
    prioridad: "media",
    asignado_usuario_id: null,
    asignado_a: null,
    audio_url: null,
    notas: null,
    progreso: 0,
    fecha_creacion: new Date("2026-08-01T12:00:00.000Z"),
    fecha_limite: new Date("2026-08-10T12:00:00.000Z"),
    fecha_resolucion: null,
    ...overrides,
  };
}

function parseBody(value: Record<string, unknown>): ParsedTicketUpdateBody {
  const result = parseTicketUpdateBody(value);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

function buildChanges(
  current: Ticket,
  body: ParsedTicketUpdateBody,
  overrides: Partial<{
    assigneeUserId: number;
    assigneeDisplayName: string;
    now: Date;
  }> = {},
) {
  return buildTicketUpdateChanges({
    current,
    body,
    assigneeUserId: overrides.assigneeUserId ?? 9,
    assigneeDisplayName: overrides.assigneeDisplayName ?? "Operadora Uno",
    now: overrides.now ?? NOW,
  });
}

describe("construccion de cambios de un ticket", () => {
  it("normaliza campos y conserva el orden usado por la auditoria", () => {
    const current = createTicket({ audio_url: "https://audio.example/old" });
    const body = parseBody({
      expected_version: 3,
      hora: " 10:30 ",
      nombre: " Ana María ",
      apellido: " López ",
      telefono: "   ",
      email: "  nueva@example.com  ",
      notificado: true,
      prioridad: "alta",
      audio_url: "   ",
      notas: "  Revisar  ",
      progreso: 25,
      fecha_limite: "2026-08-15T18:00:00.000Z",
    });

    const result = buildChanges(current, body);

    assert.deepEqual(result.changedFields, [
      "hora",
      "nombre",
      "apellido",
      "telefono",
      "email",
      "notificado",
      "prioridad",
      "audio_url",
      "notas",
      "progreso",
      "fecha_limite",
    ]);
    assert.deepEqual(Object.keys(result.updates), result.changedFields);
    assert.deepEqual(result.updates, {
      hora: "10:30",
      nombre: "Ana María",
      apellido: "López",
      telefono: null,
      email: "nueva@example.com",
      notificado: true,
      prioridad: "alta",
      audio_url: null,
      notas: "Revisar",
      progreso: 25,
      fecha_limite: new Date("2026-08-15T18:00:00.000Z"),
    });
    assert.notStrictEqual(result.updates.fecha_limite, body.fecha_limite);
  });

  it("elimina del diff valores normalizados y fechas sin cambio", () => {
    const current = createTicket();
    const body = parseBody({
      expected_version: 3,
      hora: " 09:15 ",
      nombre: " Ana ",
      apellido: " Pérez ",
      telefono: " 1111 ",
      dni: " 30111222 ",
      empresa: " Alfa ",
      email: " ana@example.test ",
      notificado: false,
      estado: "nuevo",
      prioridad: "media",
      progreso: 0,
      fecha_limite: "2026-08-10T12:00:00.000Z",
    });

    const result = buildChanges(current, body);

    assert.deepEqual(result, { updates: {}, changedFields: [] });
    assert.equal(current.estado_empleado, "Activo");
    assert.equal(body.dni, " 30111222 ");
  });

  it("invalida el estado de Serin solo ante DNI o empresa realmente distintos", () => {
    const current = createTicket();
    const same = buildChanges(
      current,
      parseBody({
        expected_version: 3,
        dni: " 30111222 ",
        empresa: " Alfa ",
      }),
    );
    assert.deepEqual(same, { updates: {}, changedFields: [] });

    const changedDni = buildChanges(
      current,
      parseBody({ expected_version: 3, dni: " 30999888 " }),
    );
    assert.deepEqual(changedDni, {
      updates: { dni: "30999888", estado_empleado: null },
      changedFields: ["dni", "estado_empleado"],
    });

    const clearedCompany = buildChanges(
      current,
      parseBody({ expected_version: 3, empresa: "   " }),
    );
    assert.deepEqual(clearedCompany, {
      updates: { empresa: null, estado_empleado: null },
      changedFields: ["empresa", "estado_empleado"],
    });
  });

  it("reclasifica al cambiar motivo o resumen", () => {
    const byReason = buildChanges(
      createTicket(),
      parseBody({
        expected_version: 3,
        motivo: " Reclama un embargo en el recibo de sueldo ",
      }),
    );
    assert.deepEqual(byReason, {
      updates: {
        motivo: "Reclama un embargo en el recibo de sueldo",
        motivo_categoria: "embargos",
      },
      changedFields: ["motivo", "motivo_categoria"],
    });

    const bySummary = buildChanges(
      createTicket({
        motivo: "Necesita ayuda",
        motivo_categoria: "sin_clasificar",
      }),
      parseBody({
        expected_version: 3,
        resumen: " Le realizan una retención de haberes por orden judicial ",
      }),
    );
    assert.deepEqual(bySummary, {
      updates: {
        resumen: "Le realizan una retención de haberes por orden judicial",
        motivo_categoria: "embargos",
      },
      changedFields: ["resumen", "motivo_categoria"],
    });
  });

  it("asigna y ajusta la fecha solo en transiciones reales", () => {
    const resolved = buildChanges(
      createTicket(),
      parseBody({ expected_version: 3, estado: "resuelto" }),
    );
    assert.deepEqual(resolved, {
      updates: {
        estado: "resuelto",
        asignado_usuario_id: 9,
        asignado_a: "Operadora Uno",
        fecha_resolucion: NOW,
      },
      changedFields: [
        "estado",
        "asignado_usuario_id",
        "asignado_a",
        "fecha_resolucion",
      ],
    });

    const reopened = buildChanges(
      createTicket({
        estado: "resuelto",
        fecha_resolucion: new Date("2026-08-03T10:00:00.000Z"),
      }),
      parseBody({ expected_version: 3, estado: "en_proceso" }),
    );
    assert.deepEqual(reopened, {
      updates: {
        estado: "en_proceso",
        asignado_usuario_id: 9,
        asignado_a: "Operadora Uno",
        fecha_resolucion: null,
      },
      changedFields: [
        "estado",
        "asignado_usuario_id",
        "asignado_a",
        "fecha_resolucion",
      ],
    });

    const finalToFinal = buildChanges(
      createTicket({
        estado: "resuelto",
        fecha_resolucion: new Date("2026-08-03T10:00:00.000Z"),
      }),
      parseBody({ expected_version: 3, estado: "cerrado" }),
    );
    assert.deepEqual(finalToFinal, {
      updates: {
        estado: "cerrado",
        asignado_usuario_id: 9,
        asignado_a: "Operadora Uno",
      },
      changedFields: ["estado", "asignado_usuario_id", "asignado_a"],
    });

    const sameState = buildChanges(
      createTicket(),
      parseBody({ expected_version: 3, estado: "nuevo" }),
    );
    assert.deepEqual(sameState, { updates: {}, changedFields: [] });
  });

  it("prioriza y clona una fecha de resolucion explicita", () => {
    const body = parseBody({
      expected_version: 3,
      estado: "resuelto",
      fecha_resolucion: "2026-08-05T09:30:00.000Z",
    });
    const result = buildChanges(createTicket(), body);

    assert.deepEqual(result.changedFields, [
      "estado",
      "fecha_resolucion",
      "asignado_usuario_id",
      "asignado_a",
    ]);
    assert.equal(
      result.updates.fecha_resolucion?.getTime(),
      Date.parse("2026-08-05T09:30:00.000Z"),
    );
    assert.notStrictEqual(
      result.updates.fecha_resolucion,
      body.fecha_resolucion,
    );
    assert.notStrictEqual(result.updates.fecha_resolucion, NOW);
  });
});
