import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crearSeguimientoOrigenSerin,
  SERIN_SEGUIMIENTO_AUTOR,
  SERIN_SEGUIMIENTO_NOTA,
} from "../src/serin";

describe("seguimiento automático de Serin", () => {
  it("crea la entrada inicial cuando existe una empresa real", () => {
    assert.deepEqual(crearSeguimientoOrigenSerin(" GSB "), {
      autor: SERIN_SEGUIMIENTO_AUTOR,
      nota: SERIN_SEGUIMIENTO_NOTA,
    });
  });

  it("no atribuye datos a Serin cuando no existe una empresa", () => {
    const empresasAusentes = [
      null,
      undefined,
      "",
      "   ",
      "Sin empresa asignada",
      " SIN EMPRESA ASOCIADA ",
    ];

    for (const empresa of empresasAusentes) {
      assert.equal(crearSeguimientoOrigenSerin(empresa), null);
    }
  });
});
