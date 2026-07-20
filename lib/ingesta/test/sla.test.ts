import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TZDateMini } from "@date-fns/tz";
import {
  calcularFechaLimiteSla,
  SLA_TIME_ZONE,
  sumarHorasHabiles,
} from "../src/sla.ts";

function fechaEnBuenosAires(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
): Date {
  return new Date(
    new TZDateMini(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
      milliseconds,
      SLA_TIME_ZONE,
    ).getTime(),
  );
}

function partesEnBuenosAires(fecha: Date): number[] {
  const local = new TZDateMini(fecha.getTime(), SLA_TIME_ZONE);
  return [
    local.getFullYear(),
    local.getMonth() + 1,
    local.getDate(),
    local.getHours(),
    local.getMinutes(),
    local.getSeconds(),
    local.getMilliseconds(),
  ];
}

describe("SLA de 48 horas hábiles", () => {
  it("suma normalmente cuando no cruza el fin de semana", () => {
    const limite = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 20, 10));
    assert.deepEqual(partesEnBuenosAires(limite), [2026, 7, 22, 10, 0, 0, 0]);
  });

  it("pausa el reloj durante sábado y domingo", () => {
    const jueves = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 23, 10));
    const viernes = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 24, 10));

    assert.deepEqual(partesEnBuenosAires(jueves), [2026, 7, 27, 10, 0, 0, 0]);
    assert.deepEqual(partesEnBuenosAires(viernes), [2026, 7, 28, 10, 0, 0, 0]);
  });

  it("comienza a contar el lunes 00:00 si ingresa durante el fin de semana", () => {
    const sabado = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 25, 10));
    const domingo = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 26, 23, 59));

    assert.deepEqual(partesEnBuenosAires(sabado), [2026, 7, 29, 0, 0, 0, 0]);
    assert.deepEqual(partesEnBuenosAires(domingo), [2026, 7, 29, 0, 0, 0, 0]);
  });

  it("permite que el plazo termine exactamente al comenzar el sábado", () => {
    const limite = calcularFechaLimiteSla(fechaEnBuenosAires(2026, 7, 23));
    assert.deepEqual(partesEnBuenosAires(limite), [2026, 7, 25, 0, 0, 0, 0]);
  });

  it("preserva minutos, segundos y milisegundos al cruzar el fin de semana", () => {
    const limite = calcularFechaLimiteSla(
      fechaEnBuenosAires(2026, 7, 24, 17, 45, 12, 345),
    );
    assert.deepEqual(
      partesEnBuenosAires(limite),
      [2026, 7, 28, 17, 45, 12, 345],
    );
  });

  it("no muta la fecha original y cero horas conserva el instante", () => {
    const original = fechaEnBuenosAires(2026, 7, 24, 10, 30);
    const timestamp = original.getTime();
    const resultado = sumarHorasHabiles(original, 0);

    assert.equal(original.getTime(), timestamp);
    assert.notEqual(resultado, original);
    assert.equal(resultado.getTime(), timestamp);
  });

  it("rechaza fechas y cantidades de horas inválidas", () => {
    assert.throws(() => sumarHorasHabiles(new Date(Number.NaN), 48), RangeError);
    assert.throws(() => sumarHorasHabiles(new Date(), -1), RangeError);
    assert.throws(() => sumarHorasHabiles(new Date(), Number.POSITIVE_INFINITY), RangeError);
  });
});
