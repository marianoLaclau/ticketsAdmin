import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  MOTIVO_CATEGORIA_CODIGOS,
  MOTIVO_CATEGORIA_LABELS,
  MOTIVO_CATEGORIAS,
} from "../src/motivos.ts";

/**
 * El catálogo de categorías vive en un único lugar y todo lo demás lo importa:
 * el enum de la columna en `lib/db` y las etiquetas y filtros del frontend.
 *
 * OpenAPI es la excepción inevitable —es YAML y no puede importar TypeScript—,
 * así que su enum se verifica acá. Si alguien agrega una categoría sin tocar el
 * contrato, o al revés, esta prueba falla antes que el codegen.
 */
describe("catálogo de categorías como fuente única", () => {
  it("mantiene el enum del contrato OpenAPI alineado con el catálogo", () => {
    const openapi = readFileSync(
      new URL("../../api-spec/openapi.yaml", import.meta.url),
      "utf8",
    );

    const bloque = openapi.match(
      /\n {4}MotivoCategoria:\n {6}type: string\n {6}enum:\n((?: {8}- \w+\n)+)/,
    );
    assert.ok(bloque, "no se encontró el enum MotivoCategoria en el contrato");

    const delContrato = [...(bloque[1] ?? "").matchAll(/- (\w+)/g)].map(
      ([, codigo]) => codigo,
    );

    assert.deepEqual(
      delContrato,
      [...MOTIVO_CATEGORIA_CODIGOS],
      "el enum de OpenAPI quedó desincronizado del catálogo de lib/ingesta",
    );
  });

  it("expone una etiqueta legible para cada código, sin sobrantes", () => {
    assert.deepEqual(
      Object.keys(MOTIVO_CATEGORIA_LABELS).sort(),
      [...MOTIVO_CATEGORIA_CODIGOS].sort(),
    );
    for (const codigo of MOTIVO_CATEGORIA_CODIGOS) {
      assert.equal(typeof MOTIVO_CATEGORIA_LABELS[codigo], "string");
      assert.ok(MOTIVO_CATEGORIA_LABELS[codigo].length > 0);
    }
  });

  it("deriva el listado de objetos del mismo orden del catálogo", () => {
    assert.deepEqual(
      MOTIVO_CATEGORIAS.map(({ codigo }) => codigo),
      [...MOTIVO_CATEGORIA_CODIGOS],
    );
    assert.deepEqual(
      MOTIVO_CATEGORIAS.map(({ label }) => label),
      MOTIVO_CATEGORIA_CODIGOS.map((codigo) => MOTIVO_CATEGORIA_LABELS[codigo]),
    );
  });
});
