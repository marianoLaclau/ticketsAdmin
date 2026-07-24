import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crearRunnerPrioridadAutomatica,
  PRIORIDAD_AUTOMATICA_INTERVALO_MINIMO_MS,
  PRIORIDAD_AUTOMATICA_INTERVALO_PREDETERMINADO_MS,
  resolverIntervaloPrioridadAutomatica,
  type TimerPrioridadAutomatica,
} from "../src/lib/prioridad-automatica-runner.ts";
import type {
  ResultadoPrioridadAutomatica,
  ServicioPrioridadAutomatica,
} from "../src/lib/prioridad-automatica.ts";

function resultado(promociones = 0): ResultadoPrioridadAutomatica {
  return {
    instanteEvaluado: new Date("2026-07-22T13:00:00.000Z"),
    revisados: 4,
    evaluados: 3,
    promociones: Array.from({ length: promociones }, (_, index) => ({
      ticketId: index + 1,
      prioridadAnterior: "media" as const,
      prioridadNueva: "alta" as const,
      horasHabilesRestantes: 24,
    })),
  };
}

function crearLoggerEspia() {
  const entradas = {
    info: [] as Array<Record<string, unknown>>,
    error: [] as Array<Record<string, unknown>>,
    debug: [] as Array<Record<string, unknown>>,
  };
  return {
    entradas,
    logger: {
      info(contexto: Record<string, unknown>) {
        entradas.info.push(contexto);
      },
      error(contexto: Record<string, unknown>) {
        entradas.error.push(contexto);
      },
      debug(contexto: Record<string, unknown>) {
        entradas.debug.push(contexto);
      },
    },
  };
}

describe("configuracion del runner de prioridad", () => {
  it("usa cinco minutos por defecto y valida el minimo configurable", () => {
    assert.equal(PRIORIDAD_AUTOMATICA_INTERVALO_PREDETERMINADO_MS, 300_000);
    assert.equal(resolverIntervaloPrioridadAutomatica(undefined), 300_000);
    assert.equal(resolverIntervaloPrioridadAutomatica(""), 300_000);
    assert.equal(resolverIntervaloPrioridadAutomatica("abc"), 300_000);
    assert.equal(
      resolverIntervaloPrioridadAutomatica(String(PRIORIDAD_AUTOMATICA_INTERVALO_MINIMO_MS - 1)),
      300_000,
    );
    assert.equal(resolverIntervaloPrioridadAutomatica("60000"), 60_000);
  });
});

describe("runner periodico de prioridad", () => {
  it("programa una sola vez, aplica unref y permite detener/reiniciar", async () => {
    let ejecuciones = 0;
    const servicio: ServicioPrioridadAutomatica = {
      estaEjecutando: () => false,
      ejecutar: async () => {
        ejecuciones += 1;
        return resultado();
      },
    };
    let callbackProgramado: (() => void) | undefined;
    let intervaloProgramado = 0;
    let programaciones = 0;
    let cancelaciones = 0;
    let unrefs = 0;
    const timer: TimerPrioridadAutomatica = {
      unref() {
        unrefs += 1;
      },
    };
    const { logger } = crearLoggerEspia();
    const runner = crearRunnerPrioridadAutomatica({
      servicio,
      intervaloMs: 60_000,
      logger,
      programarIntervalo(callback, intervaloMs) {
        programaciones += 1;
        callbackProgramado = callback;
        intervaloProgramado = intervaloMs;
        return timer;
      },
      cancelarIntervalo(handle) {
        assert.strictEqual(handle, timer);
        cancelaciones += 1;
      },
    });

    assert.strictEqual(runner.iniciar(), timer);
    assert.strictEqual(runner.iniciar(), timer);
    assert.equal(programaciones, 1);
    assert.equal(intervaloProgramado, 60_000);
    assert.equal(unrefs, 1);

    callbackProgramado?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ejecuciones, 1);

    runner.detener();
    runner.detener();
    assert.equal(cancelaciones, 1);
    runner.iniciar();
    assert.equal(programaciones, 2);
    assert.equal(unrefs, 2);
  });

  it("ejecuta la pasada inicial, informa promociones y salta solapamientos", async () => {
    let activa = false;
    let ejecuciones = 0;
    const servicio: ServicioPrioridadAutomatica = {
      estaEjecutando: () => activa,
      ejecutar: async () => {
        ejecuciones += 1;
        return resultado(2);
      },
    };
    const { logger, entradas } = crearLoggerEspia();
    const runner = crearRunnerPrioridadAutomatica({ servicio, logger });

    const inicial = await runner.ejecutarAhora("arranque");
    assert.equal(inicial?.promociones.length, 2);
    assert.equal(ejecuciones, 1);
    assert.deepEqual(entradas.info[0]?.tickets, [1, 2]);

    activa = true;
    assert.equal(await runner.ejecutarAhora("intervalo"), null);
    assert.equal(ejecuciones, 1);
    assert.equal(entradas.debug.length, 1);
  });

  it("registra errores sin propagarlos ni impedir la siguiente ejecucion", async () => {
    let intento = 0;
    const servicio: ServicioPrioridadAutomatica = {
      estaEjecutando: () => false,
      ejecutar: async () => {
        intento += 1;
        if (intento === 1) throw new Error("fallo esperado");
        return resultado();
      },
    };
    const { logger, entradas } = crearLoggerEspia();
    const runner = crearRunnerPrioridadAutomatica({ servicio, logger });

    assert.equal(await runner.ejecutarAhora("arranque"), null);
    assert.equal(entradas.error.length, 1);

    const siguiente = await runner.ejecutarAhora("manual");
    assert.equal(siguiente?.promociones.length, 0);
    assert.equal(intento, 2);
  });
});
