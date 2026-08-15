import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESTADOS_VALIDOS, type EstadoTicket } from "../src/types.ts";
import {
  describirTransicionInvalida,
  esEstadoFinal,
  esEstadoTicket,
  ESTADO_INICIAL,
  esTransicionDeEstadoValida,
  progresoDeEstado,
  PROGRESO_POR_ESTADO,
} from "../src/estados.ts";

const OTROS_ESTADOS = ESTADOS_VALIDOS.filter(
  (estado) => estado !== ESTADO_INICIAL,
);

describe("máquina de estados del ticket", () => {
  it("prohíbe volver a nuevo desde cualquier otro estado", () => {
    for (const desde of OTROS_ESTADOS) {
      assert.equal(
        esTransicionDeEstadoValida(desde, ESTADO_INICIAL),
        false,
        `${desde} -> nuevo debería estar prohibido`,
      );
      assert.match(
        describirTransicionInvalida(desde, ESTADO_INICIAL) ?? "",
        /no puede volver a "nuevo"/,
      );
    }
  });

  it("admite todo el resto de los movimientos, incluidas las reaperturas", () => {
    for (const desde of ESTADOS_VALIDOS) {
      for (const hasta of OTROS_ESTADOS) {
        assert.equal(
          esTransicionDeEstadoValida(desde, hasta),
          true,
          `${desde} -> ${hasta} debería estar permitido`,
        );
        assert.equal(describirTransicionInvalida(desde, hasta), null);
      }
    }
  });

  // Los saltos que el flujo ideal no contemplaba son mayoría en producción:
  // nuevo -> resuelto concentra 58 de 76 cambios reales. Si esta prueba falla,
  // alguien endureció la regla y va a romper el uso cotidiano del equipo.
  it("conserva las transiciones que el equipo usa de verdad", () => {
    const transicionesObservadas: ReadonlyArray<
      readonly [EstadoTicket, EstadoTicket]
    > = [
      ["nuevo", "resuelto"],
      ["nuevo", "en_proceso"],
      ["nuevo", "pendiente"],
      ["en_proceso", "resuelto"],
      ["en_proceso", "pendiente"],
      ["pendiente", "resuelto"],
      ["pendiente", "cerrado"],
    ];

    for (const [desde, hasta] of transicionesObservadas) {
      assert.equal(
        esTransicionDeEstadoValida(desde, hasta),
        true,
        `${desde} -> ${hasta} ocurre en producción y debe seguir permitido`,
      );
    }
  });

  it("trata quedarse en el mismo estado como un no-op válido", () => {
    for (const estado of ESTADOS_VALIDOS) {
      assert.equal(esTransicionDeEstadoValida(estado, estado), true);
      assert.equal(describirTransicionInvalida(estado, estado), null);
    }
  });
});

describe("progreso derivado del estado", () => {
  it("asigna un porcentaje a cada estado y crece hacia el cierre", () => {
    const porcentajes = ESTADOS_VALIDOS.map((estado) =>
      progresoDeEstado(estado),
    );

    assert.deepEqual(porcentajes, [0, 25, 50, 75, 100]);
    assert.equal(Object.keys(PROGRESO_POR_ESTADO).length, ESTADOS_VALIDOS.length);
  });

  it("reconoce resuelto y cerrado como estados finales", () => {
    assert.equal(esEstadoFinal("resuelto"), true);
    assert.equal(esEstadoFinal("cerrado"), true);
    assert.equal(esEstadoFinal("nuevo"), false);
    assert.equal(esEstadoFinal("en_proceso"), false);
    assert.equal(esEstadoFinal("pendiente"), false);
  });
});

describe("esEstadoTicket", () => {
  it("acepta los estados del catálogo y rechaza cualquier otra cosa", () => {
    for (const estado of ESTADOS_VALIDOS) {
      assert.equal(esEstadoTicket(estado), true);
    }
    for (const valor of ["Nuevo", "archivado", "", null, 3, undefined, {}]) {
      assert.equal(esEstadoTicket(valor), false);
    }
  });
});
