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
    assert.match(description, /backlog_vencido.*mismo conjunto\s+analizado/is);
    assert.match(description, /no incorporan backlog.*fuera del período/is);
  });

  it("expone una fotografía actual estricta del conjunto analizado", () => {
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

  it("define las tres KPIs de backlog con denominadores auditables", () => {
    const overdue = schema("RendimientoBacklogVencido");
    const age = schema("RendimientoAntiguedadBacklog");
    const assignment = schema("RendimientoCoberturaAsignacion");

    assert.equal(overdue.additionalProperties, false);
    assert.deepEqual(overdue.required, [
      "abiertos",
      "con_plazo",
      "vencidos",
      "porcentaje",
    ]);
    for (const property of ["abiertos", "con_plazo", "vencidos"]) {
      assert.equal(overdue.properties[property].type, "integer");
      assert.equal(overdue.properties[property].minimum, 0);
    }
    assert.deepEqual(overdue.properties.porcentaje.type, ["number", "null"]);
    assert.equal(overdue.properties.porcentaje.minimum, 0);
    assert.equal(overdue.properties.porcentaje.maximum, 100);
    assert.match(
      overdue.description,
      /todos los tickets actualmente abiertos/i,
    );
    assert.match(overdue.description, /con_plazo.*fecha límite verificable/is);
    assert.match(overdue.description, /igual al snapshot.*no está vencido/is);

    assert.equal(age.additionalProperties, false);
    assert.deepEqual(age.required, ["muestra", "mediana_horas_habiles"]);
    assert.equal(age.properties.muestra.minimum, 0);
    assert.deepEqual(age.properties.mediana_horas_habiles.type, [
      "number",
      "null",
    ]);
    assert.equal(age.properties.mediana_horas_habiles.minimum, 0);
    assert.match(age.description, /America\/Argentina\/Buenos_Aires/);
    assert.match(age.description, /omiten sábados y domingos/i);
    assert.match(age.description, /no contemplan feriados/i);

    assert.equal(assignment.additionalProperties, false);
    assert.deepEqual(assignment.required, [
      "abiertos",
      "asignados",
      "sin_asignar",
      "porcentaje",
    ]);
    for (const property of ["abiertos", "asignados", "sin_asignar"]) {
      assert.equal(assignment.properties[property].type, "integer");
      assert.equal(assignment.properties[property].minimum, 0);
    }
    assert.deepEqual(assignment.properties.porcentaje.type, ["number", "null"]);
    assert.equal(assignment.properties.porcentaje.minimum, 0);
    assert.equal(assignment.properties.porcentaje.maximum, 100);
    assert.match(assignment.description, /asignado_usuario_id/);
    assert.match(assignment.description, /asignado_a.*no identifica/is);
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
      "backlog_vencido",
      "antiguedad_backlog",
      "cobertura_asignacion",
      "distribucion_estado",
      "distribucion_prioridad",
    ]);
    assert.equal(response.properties.tickets_ingresados.minimum, 0);
    assert.equal(
      response.properties.periodo.$ref,
      "#/components/schemas/RendimientoPeriodo",
    );
    assert.equal(
      response.properties.backlog_vencido.$ref,
      "#/components/schemas/RendimientoBacklogVencido",
    );
    assert.equal(
      response.properties.antiguedad_backlog.$ref,
      "#/components/schemas/RendimientoAntiguedadBacklog",
    );
    assert.equal(
      response.properties.cobertura_asignacion.$ref,
      "#/components/schemas/RendimientoCoberturaAsignacion",
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
