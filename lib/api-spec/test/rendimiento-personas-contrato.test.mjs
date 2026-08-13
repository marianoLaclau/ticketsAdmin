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

function assertNonNegativeIntegerProperties(target, names) {
  for (const name of names) {
    assert.equal(target.properties[name].type, "integer", name);
    assert.equal(target.properties[name].minimum, 0, name);
  }
}

function collectPropertyNames(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.properties) result.push(...Object.keys(value.properties));
  for (const nested of Object.values(value)) {
    collectPropertyNames(nested, result);
  }
  return result;
}

describe("contrato de Rendimiento individual", () => {
  it("publica una consulta autenticada con la cohorte y filtros compartidos", () => {
    const operation = contract.paths?.["/rendimiento/personas"]?.get;

    assert.ok(operation, "falta GET /rendimiento/personas");
    assert.equal(operation.operationId, "getRendimientoPersonas");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.deepEqual(
      operation.parameters.map((parameter) => parameter.$ref),
      expectedFilterRefs,
    );
    assert.equal(
      operation.responses?.["200"]?.content?.["application/json"]?.schema?.[
        "$ref"
      ],
      "#/components/schemas/RendimientoPersonas",
    );
    assert.ok(operation.responses?.["400"]);
    assert.ok(operation.responses?.["401"]);
    assert.ok(operation.responses?.["403"]);
  });

  it("fija atribución, tiempos, carga y reaperturas sin convertirlos en ranking", () => {
    const description = contract.paths["/rendimiento/personas"].get.description;

    assert.match(description, /tickets visibles.*fecha_creacion/is);
    assert.match(description, /autor_usuario_id/);
    assert.match(description, /estado no final.*resuelto.*cerrado/is);
    assert.match(description, /horas corridas.*creación.*evento/is);
    assert.match(description, /no representa tiempo exclusivo/i);
    assert.match(description, /fecha_limite_snapshot/);
    assert.match(description, /fotografía.*asignado_usuario_id/is);
    assert.match(description, /resoluciones_reabiertas/);
    assert.match(description, /antes de la siguiente resolución/i);
    assert.match(
      description,
      /contexto operativo.*no.*calificación negativa/is,
    );
    assert.match(description, /alfabéticamente.*nunca como ranking/is);
    assert.match(description, /no\s+calcula puntajes ni posiciones/i);
  });

  it("expone cobertura global estricta y los umbrales reales de comparación", () => {
    const coverage = schema("RendimientoPersonasCobertura");

    assert.equal(coverage.additionalProperties, false);
    assert.deepEqual(coverage.required, [
      "resoluciones_evaluadas",
      "resoluciones_atribuidas",
      "porcentaje_atribucion",
      "atribucion_desde",
      "comparacion_individual_estado",
      "minimo_resoluciones_comparables",
      "umbral_cobertura_parcial_porcentaje",
      "umbral_cobertura_disponible_porcentaje",
    ]);
    assertNonNegativeIntegerProperties(coverage, [
      "resoluciones_evaluadas",
      "resoluciones_atribuidas",
    ]);
    assert.deepEqual(coverage.properties.porcentaje_atribucion.type, [
      "number",
      "null",
    ]);
    assert.equal(coverage.properties.porcentaje_atribucion.minimum, 0);
    assert.equal(coverage.properties.porcentaje_atribucion.maximum, 100);
    assert.deepEqual(coverage.properties.atribucion_desde.type, [
      "string",
      "null",
    ]);
    assert.equal(coverage.properties.atribucion_desde.format, "date-time");
    assert.deepEqual(coverage.properties.comparacion_individual_estado.enum, [
      "insuficiente",
      "parcial",
      "disponible",
    ]);
    assert.deepEqual(
      coverage.properties.minimo_resoluciones_comparables.enum,
      [10],
    );
    assert.deepEqual(
      coverage.properties.umbral_cobertura_parcial_porcentaje.enum,
      [80],
    );
    assert.deepEqual(
      coverage.properties.umbral_cobertura_disponible_porcentaje.enum,
      [95],
    );
    assert.match(
      coverage.properties.comparacion_individual_estado.description,
      /menos de 10.*menos de 80%.*desde 80%.*95%/is,
    );
    assert.match(coverage.description, /muestra individual/i);
    assert.match(coverage.description, /no constituye un ranking/i);
  });

  it("identifica usuarios persistidos sin exponer credenciales ni contacto", () => {
    const user = schema("RendimientoPersonaUsuario");

    assert.equal(user.additionalProperties, false);
    assert.deepEqual(user.required, ["id", "nombre", "rol", "activo"]);
    assert.deepEqual(Object.keys(user.properties), user.required);
    assert.equal(user.properties.id.minimum, 1);
    assert.equal(user.properties.nombre.minLength, 1);
    assert.equal(user.properties.rol.minLength, 1);
    assert.equal(user.properties.activo.type, "boolean");
    assert.match(
      user.description,
      /No expone email, username ni credenciales/i,
    );
  });

  it("distingue tickets resueltos de eventos de resolución atribuibles", () => {
    const person = schema("RendimientoPersona");

    assert.equal(person.additionalProperties, false);
    assert.deepEqual(person.required, [
      "usuario",
      "tickets_resueltos",
      "resoluciones_atribuidas",
      "tiempo_resolucion_atribuible",
      "cumplimiento_plazo_auditable",
      "carga_actual",
      "resoluciones_reabiertas",
    ]);
    assertNonNegativeIntegerProperties(person, [
      "tickets_resueltos",
      "resoluciones_atribuidas",
      "resoluciones_reabiertas",
    ]);
    assert.match(
      person.properties.tickets_resueltos.description,
      /Tickets distintos.*menor que resoluciones_atribuidas/is,
    );
    assert.match(
      person.properties.resoluciones_atribuidas.description,
      /Eventos.*más de uno/is,
    );
    assert.match(
      person.properties.resoluciones_reabiertas.description,
      /Cada resolución.*máximo una vez/is,
    );
    assert.match(
      person.properties.resoluciones_reabiertas.description,
      /no atribuye la acción de reabrir/i,
    );
    assert.equal(
      person.properties.usuario.$ref,
      "#/components/schemas/RendimientoPersonaUsuario",
    );
  });

  it("mantiene explícitas las muestras nulas, el SLA y la carga actual", () => {
    const time = schema("RendimientoTiempoResolucionAtribuible");
    const compliance = schema("RendimientoCumplimientoPersonaAuditable");
    const workload = schema("RendimientoCargaActualPersona");

    assert.equal(time.additionalProperties, false);
    assert.deepEqual(time.required, [
      "muestra",
      "promedio_horas",
      "mediana_horas",
    ]);
    assert.deepEqual(time.properties.promedio_horas.type, ["number", "null"]);
    assert.deepEqual(time.properties.mediana_horas.type, ["number", "null"]);
    assert.match(time.description, /No mide tiempo exclusivo/i);
    assert.match(time.description, /null cuando muestra es cero/i);

    assert.equal(compliance.additionalProperties, false);
    assert.deepEqual(compliance.required, [
      "muestra",
      "cumplidos",
      "porcentaje",
    ]);
    assert.deepEqual(compliance.properties.porcentaje.type, ["number", "null"]);
    assert.equal(compliance.properties.porcentaje.minimum, 0);
    assert.equal(compliance.properties.porcentaje.maximum, 100);
    assert.match(compliance.description, /fecha_limite_snapshot/);

    assert.equal(workload.additionalProperties, false);
    assert.deepEqual(workload.required, [
      "abiertos_asignados",
      "vencidos_asignados",
    ]);
    assertNonNegativeIntegerProperties(workload, workload.required);
    assert.match(workload.description, /actualmente no finales/i);
    assert.match(workload.description, /subconjunto/i);
  });

  it("cierra la respuesta y ordena personas alfabéticamente, no por desempeño", () => {
    const response = schema("RendimientoPersonas");
    const moduleStatus = schema("RendimientoModuleStatus");

    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.required, [
      "periodo",
      "tickets_evaluados",
      "cobertura",
      "personas",
    ]);
    assert.equal(
      response.properties.periodo.$ref,
      "#/components/schemas/RendimientoPeriodo",
    );
    assert.equal(response.properties.tickets_evaluados.minimum, 0);
    assert.equal(
      response.properties.cobertura.$ref,
      "#/components/schemas/RendimientoPersonasCobertura",
    );
    assert.equal(
      response.properties.personas.items.$ref,
      "#/components/schemas/RendimientoPersona",
    );
    assert.match(
      response.properties.personas.description,
      /activos o inactivos/i,
    );
    assert.match(
      response.properties.personas.description,
      /nombre y luego por id/i,
    );
    assert.match(response.properties.personas.description, /no un ranking/i);
    assert.match(
      moduleStatus.properties.estado.description,
      /Personas.*operativos/i,
    );
    assert.match(
      moduleStatus.properties.estado.description,
      /Reiteraciones.*operativos/i,
    );
  });

  it("no incorpora campos de score, puesto o ranking", () => {
    const individualSchemas = Object.entries(contract.components.schemas)
      .filter(([name]) => name.startsWith("RendimientoPersona"))
      .map(([, value]) => value);
    const propertyNames = individualSchemas.flatMap((value) =>
      collectPropertyNames(value),
    );
    const forbidden = /^(score|puntaje|puesto|posicion|posición|ranking)$/i;

    assert.deepEqual(
      propertyNames.filter((name) => forbidden.test(name)),
      [],
    );
  });
});
