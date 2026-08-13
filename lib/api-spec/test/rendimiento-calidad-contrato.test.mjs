import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

const source = readFileSync(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
const contract = parse(source);

const expectedCoverageNames = [
  "actor_resolucion",
  "fecha_resolucion",
  "plazo_resolucion",
  "asignacion_estructurada",
  "identidad_contacto",
  "fecha_limite",
];

function schema(name) {
  const result = contract.components?.schemas?.[name];
  assert.ok(result, `falta components.schemas.${name}`);
  return result;
}

describe("contrato de calidad de datos de Rendimiento", () => {
  it("publica únicamente una consulta autenticada con una cohorte auditable", () => {
    const operation = contract.paths?.["/rendimiento/calidad-datos"]?.get;

    assert.ok(operation, "falta GET /rendimiento/calidad-datos");
    assert.equal(operation.operationId, "getRendimientoCalidadDatos");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.equal(
      operation.responses?.["200"]?.content?.["application/json"]?.schema?.[
        "$ref"
      ],
      "#/components/schemas/RendimientoCalidadDatos",
    );

    assert.match(operation.description, /tickets visibles/i);
    assert.match(operation.description, /fecha_creacion/);
    assert.match(operation.description, /todos los denominadores/i);
    assert.match(operation.description, /estado no final/i);
    assert.match(operation.description, /resuelto.*cerrado/s);
  });

  it("acepta los cinco filtros opcionales con los enums compartidos", () => {
    const operation = contract.paths["/rendimiento/calidad-datos"].get;
    const refs = operation.parameters.map((parameter) => parameter.$ref);

    assert.deepEqual(refs, [
      "#/components/parameters/RendimientoFechaDesde",
      "#/components/parameters/RendimientoFechaHasta",
      "#/components/parameters/RendimientoEmpresa",
      "#/components/parameters/RendimientoMotivoCategoria",
      "#/components/parameters/RendimientoPrioridad",
    ]);

    const parameters = contract.components.parameters;
    for (const name of [
      "RendimientoFechaDesde",
      "RendimientoFechaHasta",
      "RendimientoEmpresa",
      "RendimientoMotivoCategoria",
      "RendimientoPrioridad",
    ]) {
      assert.notEqual(
        parameters[name].required,
        true,
        `${name} debe ser opcional`,
      );
    }

    assert.equal(parameters.RendimientoFechaDesde.schema.format, "date");
    assert.equal(parameters.RendimientoFechaHasta.schema.format, "date");
    assert.equal(parameters.RendimientoEmpresa.schema.type, "string");
    assert.equal(
      parameters.RendimientoMotivoCategoria.schema.$ref,
      "#/components/schemas/MotivoCategoria",
    );
    assert.deepEqual(parameters.RendimientoPrioridad.schema.enum, [
      "baja",
      "media",
      "alta",
      "urgente",
    ]);
  });

  it("mantiene estrictos el período, las proporciones y las coberturas", () => {
    const period = schema("RendimientoPeriodo");
    assert.equal(period.additionalProperties, false);
    assert.deepEqual(period.required, [
      "fecha_desde",
      "fecha_hasta",
      "timezone",
      "generado_en",
    ]);
    assert.deepEqual(period.properties.fecha_desde.type, ["string", "null"]);
    assert.deepEqual(period.properties.fecha_hasta.type, ["string", "null"]);
    assert.equal(period.properties.fecha_desde.format, "date");
    assert.equal(period.properties.fecha_hasta.format, "date");
    assert.equal(period.properties.generado_en.format, "date-time");

    const proportion = schema("RendimientoProporcion");
    assert.equal(proportion.additionalProperties, false);
    assert.deepEqual(proportion.required, [
      "numerador",
      "denominador",
      "porcentaje",
    ]);
    assert.deepEqual(proportion.properties.porcentaje.type, ["number", "null"]);
    assert.equal(proportion.properties.porcentaje.minimum, 0);
    assert.equal(proportion.properties.porcentaje.maximum, 100);

    const coverages = schema("RendimientoCoberturasCalidadDatos");
    assert.equal(coverages.additionalProperties, false);
    assert.deepEqual(coverages.required, expectedCoverageNames);
    assert.deepEqual(Object.keys(coverages.properties), expectedCoverageNames);
    for (const name of expectedCoverageNames) {
      assert.equal(
        coverages.properties[name].allOf?.[0]?.$ref,
        "#/components/schemas/RendimientoProporcion",
      );
      assert.match(coverages.properties[name].description, /cohorte/i);
    }
  });

  it("expone muestras, alcance temporal y estado de comparación individual", () => {
    const response = schema("RendimientoCalidadDatos");

    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.required, [
      "periodo",
      "tickets_evaluados",
      "resoluciones_evaluadas",
      "atribucion_desde",
      "comparacion_individual_estado",
      "coberturas",
    ]);
    assert.equal(response.properties.tickets_evaluados.minimum, 0);
    assert.equal(response.properties.resoluciones_evaluadas.minimum, 0);
    assert.deepEqual(response.properties.atribucion_desde.type, [
      "string",
      "null",
    ]);
    assert.equal(response.properties.atribucion_desde.format, "date-time");
    assert.deepEqual(response.properties.comparacion_individual_estado.enum, [
      "insuficiente",
      "parcial",
      "disponible",
    ]);
  });
});
