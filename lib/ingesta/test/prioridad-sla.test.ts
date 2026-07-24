import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TZDateMini } from "@date-fns/tz";
import {
  calcularHorasHabilesEntre,
  calcularHorasHabilesRestantes,
  calcularPrioridadPorSla,
  PRIORIDAD_ALTA_UMBRAL_HORAS,
  PRIORIDAD_URGENTE_UMBRAL_HORAS,
  SLA_TIME_ZONE,
} from "../src/sla.ts";

function fechaEnBuenosAires(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): Date {
  return new Date(
    new TZDateMini(
      year,
      month - 1,
      day,
      hours,
      minutes,
      0,
      0,
      SLA_TIME_ZONE,
    ).getTime(),
  );
}

describe("horas habiles restantes", () => {
  it("cuenta las fracciones de hora dentro de un dia habil", () => {
    const desde = fechaEnBuenosAires(2026, 7, 22, 9, 15);
    const hasta = fechaEnBuenosAires(2026, 7, 22, 11, 45);

    assert.equal(calcularHorasHabilesEntre(desde, hasta), 2.5);
    assert.equal(calcularHorasHabilesRestantes(hasta, desde), 2.5);
  });

  it("omite sabado y domingo al cruzar el fin de semana", () => {
    const viernes = fechaEnBuenosAires(2026, 7, 24, 12);
    const lunes = fechaEnBuenosAires(2026, 7, 27, 12);

    assert.equal(calcularHorasHabilesEntre(viernes, lunes), 24);
  });

  it("cuenta solo el tramo habil si el inicio cae en fin de semana", () => {
    const sabado = fechaEnBuenosAires(2026, 7, 25, 10);
    const lunes = fechaEnBuenosAires(2026, 7, 27, 12);

    assert.equal(calcularHorasHabilesEntre(sabado, lunes), 12);
  });

  it("devuelve horas negativas para un vencimiento pasado", () => {
    const limite = fechaEnBuenosAires(2026, 7, 24, 23);
    const domingo = fechaEnBuenosAires(2026, 7, 26, 18);

    assert.equal(calcularHorasHabilesRestantes(limite, domingo), -1);
    assert.equal(
      calcularHorasHabilesEntre(domingo, limite),
      -calcularHorasHabilesEntre(limite, domingo),
    );
  });

  it("normaliza a cero un intervalo que transcurre solo en fin de semana", () => {
    const sabado = fechaEnBuenosAires(2026, 7, 25, 10);
    const domingo = fechaEnBuenosAires(2026, 7, 26, 18);

    assert.equal(calcularHorasHabilesEntre(sabado, domingo), 0);
    assert.equal(Object.is(calcularHorasHabilesEntre(domingo, sabado), -0), false);
  });

  it("rechaza fechas invalidas", () => {
    assert.throws(
      () => calcularHorasHabilesEntre(new Date(Number.NaN), new Date()),
      RangeError,
    );
    assert.throws(
      () => calcularHorasHabilesRestantes(new Date(Number.NaN)),
      RangeError,
    );
  });
});

describe("umbrales de prioridad por SLA", () => {
  it("promueve a alta al llegar exactamente a 24 horas", () => {
    assert.equal(PRIORIDAD_ALTA_UMBRAL_HORAS, 24);
    assert.equal(calcularPrioridadPorSla("baja", 24), "alta");
    assert.equal(calcularPrioridadPorSla("media", 24), "alta");
    assert.equal(calcularPrioridadPorSla("media", 24.001), "media");
  });

  it("promueve a urgente al llegar exactamente a 12 horas o vencer", () => {
    assert.equal(PRIORIDAD_URGENTE_UMBRAL_HORAS, 12);
    assert.equal(calcularPrioridadPorSla("baja", 12), "urgente");
    assert.equal(calcularPrioridadPorSla("alta", 12), "urgente");
    assert.equal(calcularPrioridadPorSla("alta", -10), "urgente");
    assert.equal(calcularPrioridadPorSla("alta", 12.001), "alta");
  });

  it("nunca reduce una prioridad existente", () => {
    assert.equal(calcularPrioridadPorSla("alta", 40), "alta");
    assert.equal(calcularPrioridadPorSla("urgente", 40), "urgente");
    assert.equal(calcularPrioridadPorSla("urgente", 20), "urgente");
  });

  it("rechaza horas no finitas y prioridades ajenas al dominio", () => {
    assert.throws(
      () => calcularPrioridadPorSla("media", Number.NaN),
      RangeError,
    );
    assert.throws(
      () => calcularPrioridadPorSla("invalida" as never, 10),
      RangeError,
    );
  });
});
