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

const expectedPagination = {
  pagina: { minimum: 1, default: 1 },
  limite: { minimum: 1, maximum: 50, default: 20 },
};

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
  it("publica una consulta autenticada con el conjunto analizado y filtros compartidos", () => {
    const operation = contract.paths?.["/rendimiento/reiteraciones"]?.get;

    assert.ok(operation, "falta GET /rendimiento/reiteraciones");
    assert.equal(operation.operationId, "getRendimientoReiteraciones");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.deepEqual(
      operation.parameters
        .filter((parameter) => parameter.$ref)
        .map((parameter) => parameter.$ref),
      expectedFilterRefs,
    );
    for (const [name, expectedSchema] of Object.entries(expectedPagination)) {
      const parameter = operation.parameters.find(
        (candidate) => candidate.name === name,
      );
      assert.ok(parameter, `falta el parámetro ${name}`);
      assert.equal(parameter.in, "query");
      assert.equal(parameter.schema.type, "integer");
      for (const [constraint, value] of Object.entries(expectedSchema)) {
        assert.equal(parameter.schema[constraint], value);
      }
    }
    assert.equal(
      operation.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/RendimientoReiteraciones",
    );
    assert.ok(operation.responses?.["400"]);
    assert.ok(operation.responses?.["401"]);
    assert.ok(operation.responses?.["403"]);
  });

  it("define una identidad canónica no transitiva y limitada al conjunto analizado", () => {
    const description =
      contract.paths["/rendimiento/reiteraciones"].get.description;

    assert.match(
      description,
      /mismo conjunto analizado.*tickets visibles.*fecha_creacion/is,
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
    assert.match(
      summary.properties.contactos_reiterados.description,
      /total global.*no solo.*página/i,
    );
  });

  it("pagina después del orden global y conserva el resumen del conjunto analizado", () => {
    const operation = contract.paths["/rendimiento/reiteraciones"].get;
    const response = schema("RendimientoReiteraciones");

    assert.match(
      operation.description,
      /orden.*conjunto completo.*antes de paginar/is,
    );
    assert.match(operation.description, /resumen.*totales globales/is);
    assert.match(operation.description, /contactos.*página solicitada/is);
    assert.equal(response.properties.pagina.type, "integer");
    assert.equal(response.properties.pagina.minimum, 1);
    assert.equal(response.properties.limite.type, "integer");
    assert.equal(response.properties.limite.minimum, 1);
    assert.equal(response.properties.limite.maximum, 50);
    assert.equal(response.properties.total_paginas.type, "integer");
    assert.equal(response.properties.total_paginas.minimum, 0);
    assert.match(
      response.properties.total_paginas.description,
      /techo.*contactos_reiterados.*limite/i,
    );
    assert.match(
      response.properties.contactos.description,
      /página solicitada/i,
    );
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
      "pagina",
      "limite",
      "total_paginas",
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
