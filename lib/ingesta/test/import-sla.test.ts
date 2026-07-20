import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TZDateMini } from "@date-fns/tz";
import {
  fechaExcelAStringLocal,
  filaATicket,
  parseFecha,
  SLA_TIME_ZONE,
} from "../src/index";

function partesEnBuenosAires(fecha: Date): number[] {
  const local = new TZDateMini(fecha.getTime(), SLA_TIME_ZONE);
  return [
    local.getFullYear(),
    local.getMonth() + 1,
    local.getDate(),
    local.getHours(),
    local.getMinutes(),
  ];
}

describe("integración del SLA con importaciones", () => {
  it("interpreta fecha y hora históricas en la zona de Buenos Aires", () => {
    const fecha = parseFecha("24/07/2026 - 10:00hs");
    assert.ok(fecha);
    assert.equal(fecha.toISOString(), "2026-07-24T13:00:00.000Z");
  });

  it("interpreta un ISO sin zona como hora local y un ISO con zona como instante", () => {
    assert.equal(
      parseFecha("2026-07-24")?.toISOString(),
      "2026-07-24T03:00:00.000Z",
    );
    assert.equal(
      parseFecha("2026-07-24T10:00:00.000")?.toISOString(),
      "2026-07-24T13:00:00.000Z",
    );
    assert.equal(
      parseFecha("2026-07-24T10:00:00.000Z")?.toISOString(),
      "2026-07-24T10:00:00.000Z",
    );
  });

  it("rechaza fechas de calendario y horas imposibles", () => {
    assert.equal(parseFecha("31/02/2026"), null);
    assert.equal(parseFecha("24/07/2026 - 25:00hs"), null);
    assert.equal(parseFecha("formato ambiguo"), null);
    assert.equal(
      filaATicket({ conversation_id: "fecha-invalida", fecha: "31/02/2026" }),
      null,
    );
    assert.equal(
      filaATicket({ conversation_id: "hora-invalida", fecha: "24/07/2026", hora: "25:00" }),
      null,
    );
  });

  it("convierte las celdas Date de Excel a una hora civil sin zona", () => {
    const serialExcel = new Date("2026-07-24T10:00:00.000Z");
    const valorLocal = fechaExcelAStringLocal(serialExcel);

    assert.equal(valorLocal, "2026-07-24T10:00:00.000");
    assert.equal(parseFecha(valorLocal)?.toISOString(), "2026-07-24T13:00:00.000Z");
  });

  it("usa la fecha importada como base y omite el fin de semana", () => {
    const ticket = filaATicket({
      conversation_id: "sla-import-test",
      fecha: "24/07/2026 - 10:00hs",
    });

    assert.ok(ticket);
    assert.equal(ticket.hora, "10:00");
    assert.deepEqual(
      partesEnBuenosAires(ticket.fecha_creacion),
      [2026, 7, 24, 10, 0],
    );
    assert.deepEqual(
      partesEnBuenosAires(ticket.fecha_limite),
      [2026, 7, 28, 10, 0],
    );
  });

  it("combina una fecha y una hora separadas antes de calcular el SLA", () => {
    const ticket = filaATicket({
      conversation_id: "sla-import-columns-test",
      fecha: "24/07/2026",
      hora: "10:00",
    });

    assert.ok(ticket);
    assert.equal(ticket.hora, "10:00");
    assert.deepEqual(partesEnBuenosAires(ticket.fecha_creacion), [2026, 7, 24, 10, 0]);
    assert.deepEqual(partesEnBuenosAires(ticket.fecha_limite), [2026, 7, 28, 10, 0]);
  });

  it("reconoce una celda de hora de Excel separada y le da precedencia", () => {
    const ticket = filaATicket({
      conversation_id: "sla-import-excel-time-test",
      fecha: "2026-07-24T08:30:00.000",
      hora: "1899-12-30T10:00:00.000",
    });

    assert.ok(ticket);
    assert.equal(ticket.hora, "10:00");
    assert.deepEqual(partesEnBuenosAires(ticket.fecha_creacion), [2026, 7, 24, 10, 0]);
    assert.deepEqual(partesEnBuenosAires(ticket.fecha_limite), [2026, 7, 28, 10, 0]);
  });
});
