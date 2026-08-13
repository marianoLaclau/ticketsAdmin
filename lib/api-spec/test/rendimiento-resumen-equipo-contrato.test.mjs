import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

const contract = parse(
  readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8"),
);

const expectedFilterRefs = [
  "#/components/parameters/RendimientoFechaDesde",
  "#/components/parameters/RendimientoFechaHasta",
  "#/components/parameters/RendimientoEmpresa",
  "#/components/parameters/RendimientoMotivoCategoria",
  "#/components/parameters/RendimientoPrioridad",
];

function schema(name) {
  const result = contract.components?.schemas?.[name];
  assert.ok(result, `falta components.schemas.${name}`);
  return result;
}

describe("contrato del resumen de equipo de Rendimiento", () => {
  it("publica una consulta autenticada con los mismos filtros de calidad", () => {
    const operation = contract.paths?.["/rendimiento/resumen-equipo"]?.get;

    assert.ok(operation, "falta GET /rendimiento/resumen-equipo");
    assert.equal(operation.operationId, "getRendimientoResumenEquipo");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.deepEqual(
      operation.parameters.map((parameter) => parameter.$ref),
      expectedFilterRefs,
    );
    assert.equal(
      operation.responses?.["200"]?.content?.["application/json"]?.schema?.[
        "$ref"
      ],
      "#/components/schemas/RendimientoResumenEquipo",
    );
  });

  it("diferencia el estado actual de los eventos auditables de resolución", () => {
    const description =
      contract.paths["/rendimiento/resumen-equipo"].get.description;

    assert.match(description, /tickets visibles/i);
    assert.match(description, /fecha_creacion/);
    assert.match(description, /fotografía.*estado actual/is);
    assert.match(description, /no final.*resuelto.*cerrado/is);
    assert.match(description, /snapshot.*plazo/is);
    assert.match(description, /resuelto.*cerrado.*no cuenta/is);
  });

  it("expone una fotografía actual estricta de la cohorte", () => {
    const current = schema("RendimientoEstadoActual");

    assert.equal(current.additionalProperties, false);
    assert.deepEqual(current.required, [
      "total",
      "abiertos",
      "finalizados",
      "vencidos_abiertos",
    ]);
    assert.match(current.description, /fecha_creacion/);
    assert.match(current.description, /nuevo.*en_proceso.*pendiente/s);
    assert.match(current.description, /resuelto.*cerrado/s);
    for (const property of current.required) {
      assert.equal(current.properties[property].type, "integer");
      assert.equal(current.properties[property].minimum, 0);
    }
  });

  it("mantiene explícitas la muestra y la ausencia de duraciones", () => {
    const duration = schema("RendimientoResolucionConFecha");

    assert.equal(duration.additionalProperties, false);
    assert.deepEqual(duration.required, [
      "muestra",
      "promedio_horas",
      "mediana_horas",
    ]);
    assert.equal(duration.properties.muestra.minimum, 0);
    assert.deepEqual(duration.properties.promedio_horas.type, [
      "number",
      "null",
    ]);
    assert.deepEqual(duration.properties.mediana_horas.type, [
      "number",
      "null",
    ]);
    assert.match(duration.description, /horas corridas/i);
    assert.match(duration.description, /null cuando muestra es cero/i);
  });

  it("limita el cumplimiento al plazo capturado en una resolución real", () => {
    const compliance = schema("RendimientoCumplimientoPlazoAuditable");

    assert.equal(compliance.additionalProperties, false);
    assert.deepEqual(compliance.required, [
      "muestra",
      "cumplidos",
      "porcentaje",
    ]);
    assert.equal(compliance.properties.muestra.minimum, 0);
    assert.equal(compliance.properties.cumplidos.minimum, 0);
    assert.deepEqual(compliance.properties.porcentaje.type, ["number", "null"]);
    assert.equal(compliance.properties.porcentaje.minimum, 0);
    assert.equal(compliance.properties.porcentaje.maximum, 100);
    assert.match(compliance.description, /no-final a final/i);
    assert.match(compliance.description, /fecha_limite_snapshot/);
  });

  it("define distribuciones exhaustivas como objetos estrictos", () => {
    const states = schema("RendimientoDistribucionEstado");
    const priorities = schema("RendimientoDistribucionPrioridad");
    const response = schema("RendimientoResumenEquipo");

    assert.equal(states.additionalProperties, false);
    assert.deepEqual(states.required, [
      "nuevo",
      "en_proceso",
      "pendiente",
      "resuelto",
      "cerrado",
    ]);
    assert.deepEqual(Object.keys(states.properties), states.required);
    for (const state of states.required) {
      assert.equal(states.properties[state].type, "integer");
      assert.equal(states.properties[state].minimum, 0);
    }

    assert.equal(priorities.additionalProperties, false);
    assert.deepEqual(priorities.required, ["baja", "media", "alta", "urgente"]);
    assert.deepEqual(Object.keys(priorities.properties), priorities.required);
    for (const priority of priorities.required) {
      assert.equal(priorities.properties[priority].type, "integer");
      assert.equal(priorities.properties[priority].minimum, 0);
    }

    assert.equal(
      response.properties.distribucion_estado.allOf?.[0]?.$ref,
      "#/components/schemas/RendimientoDistribucionEstado",
    );
    assert.equal(
      response.properties.distribucion_prioridad.allOf?.[0]?.$ref,
      "#/components/schemas/RendimientoDistribucionPrioridad",
    );
  });

  it("cierra la respuesta y conserva el período con timezone y snapshot", () => {
    const response = schema("RendimientoResumenEquipo");
    const period = schema("RendimientoPeriodo");

    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.required, [
      "periodo",
      "tickets_ingresados",
      "estado_actual",
      "resolucion_con_fecha",
      "cumplimiento_plazo_auditable",
      "distribucion_estado",
      "distribucion_prioridad",
    ]);
    assert.equal(response.properties.tickets_ingresados.minimum, 0);
    assert.equal(
      response.properties.periodo.$ref,
      "#/components/schemas/RendimientoPeriodo",
    );
    assert.deepEqual(period.required, [
      "fecha_desde",
      "fecha_hasta",
      "timezone",
      "generado_en",
    ]);
    assert.deepEqual(period.properties.timezone.enum, [
      "America/Argentina/Buenos_Aires",
    ]);
    assert.equal(period.properties.generado_en.format, "date-time");
  });
});
