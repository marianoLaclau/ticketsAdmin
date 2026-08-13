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

function collectPropertyNames(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.properties) result.push(...Object.keys(value.properties));
  for (const nested of Object.values(value))
    collectPropertyNames(nested, result);
  return result;
}

describe("contrato de reiteraciones de contactos", () => {
  it("publica una consulta autenticada con la cohorte y filtros compartidos", () => {
    const operation = contract.paths?.["/rendimiento/reiteraciones"]?.get;

    assert.ok(operation, "falta GET /rendimiento/reiteraciones");
    assert.equal(operation.operationId, "getRendimientoReiteraciones");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.deepEqual(
      operation.parameters.map((parameter) => parameter.$ref),
      expectedFilterRefs,
    );
    assert.equal(
      operation.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/RendimientoReiteraciones",
    );
    assert.ok(operation.responses?.["400"]);
    assert.ok(operation.responses?.["401"]);
    assert.ok(operation.responses?.["403"]);
  });

  it("define una identidad canónica no transitiva y limitada a la cohorte", () => {
    const description =
      contract.paths["/rendimiento/reiteraciones"].get.description;

    assert.match(
      description,
      /misma cohorte.*tickets visibles.*fecha_creacion/is,
    );
    assert.match(description, /al menos dos.*tickets distintos/is);
    assert.match(description, /al menos uno.*estado no final/is);
    assert.match(description, /precedencia DNI.*teléfono.*email/is);
    assert.match(description, /relación directa.*unívoca/is);
    assert.match(description, /nunca se encadenan transitivamente/i);
    assert.match(description, /no una identidad civil probada/i);
    assert.match(description, /no.*confirma.*sin respuesta/is);
  });

  it("expone cobertura y totales no negativos con semántica explícita", () => {
    const coverage = schema("RendimientoReiteracionesCobertura");
    const summary = schema("RendimientoReiteracionesResumen");

    assert.equal(coverage.additionalProperties, false);
    assert.deepEqual(coverage.required, [
      "identidad_utilizable",
      "ambiguos_detectados",
      "criterio",
    ]);
    assert.equal(
      coverage.properties.identidad_utilizable.$ref,
      "#/components/schemas/RendimientoProporcion",
    );
    assert.equal(coverage.properties.ambiguos_detectados.minimum, 0);
    assert.deepEqual(coverage.properties.criterio.enum, [
      "clave_canonica_no_transitiva",
    ]);
    assert.match(coverage.description, /apunta directamente a más de un DNI/i);

    assert.equal(summary.additionalProperties, false);
    assert.deepEqual(summary.required, [
      "contactos_reiterados",
      "tickets_involucrados",
      "abiertos",
      "vencidos_abiertos",
    ]);
    for (const name of summary.required) {
      assert.equal(summary.properties[name].type, "integer");
      assert.equal(summary.properties[name].minimum, 0);
    }
  });

  it("obliga a grupos repetidos con abiertos, detalle y orden operativo", () => {
    const contact = schema("RendimientoReiteracionContacto");
    const ticket = schema("RendimientoReiteracionTicket");

    assert.equal(contact.additionalProperties, false);
    assert.equal(contact.properties.cantidad_llamados.minimum, 2);
    assert.equal(contact.properties.abiertos.minimum, 1);
    assert.deepEqual(contact.properties.antiguedad_abierto_horas.type, [
      "number",
      "null",
    ]);
    assert.equal(contact.properties.antiguedad_abierto_horas.minimum, 0);
    assert.deepEqual(contact.properties.prioridad_maxima.enum, [
      "baja",
      "media",
      "alta",
      "urgente",
    ]);
    assert.equal(contact.properties.tickets.minItems, 2);
    assert.match(
      contact.properties.grupo_id.description,
      /opaco.*no reversible/i,
    );

    assert.equal(ticket.additionalProperties, false);
    assert.deepEqual(ticket.properties.fecha_limite.type, ["string", "null"]);
    assert.equal(ticket.properties.vencido.type, "boolean");
    assert.equal(
      ticket.properties.motivo_categoria.$ref,
      "#/components/schemas/MotivoCategoria",
    );
    assert.match(
      contract.paths["/rendimiento/reiteraciones"].get.description,
      /primero vencidos.*prioridad máxima.*antigüedad.*último contacto/is,
    );
  });

  it("no expone identificadores personales completos ni campos de ranking", () => {
    const schemas = Object.entries(contract.components.schemas)
      .filter(([name]) => name.startsWith("RendimientoReiteracion"))
      .map(([, value]) => value);
    const propertyNames = schemas.flatMap((value) =>
      collectPropertyNames(value),
    );
    const forbidden =
      /^(dni|telefono|teléfono|email|score|puntaje|puesto|posicion|posición|ranking)$/i;

    assert.deepEqual(
      propertyNames.filter((name) => forbidden.test(name)),
      [],
    );
    assert.deepEqual(
      schema("RendimientoReiteracionCoincidencia").properties.tipo.enum,
      ["dni", "telefono", "email"],
    );
    assert.match(
      contract.paths["/rendimiento/reiteraciones"].get.description,
      /nunca devuelve DNI, teléfono o email completos/i,
    );
  });

  it("cierra la respuesta y marca las cuatro vistas operativas", () => {
    const response = schema("RendimientoReiteraciones");
    const status = schema("RendimientoModuleStatus");

    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.required, [
      "periodo",
      "tickets_evaluados",
      "cobertura",
      "resumen",
      "contactos",
    ]);
    assert.equal(
      response.properties.contactos.items.$ref,
      "#/components/schemas/RendimientoReiteracionContacto",
    );
    assert.match(
      response.properties.contactos.description,
      /riesgo operativo/i,
    );
    assert.match(
      status.properties.estado.description,
      /Reiteraciones.*operativos/i,
    );
    assert.doesNotMatch(status.properties.estado.description, /pendiente/i);
  });
});
