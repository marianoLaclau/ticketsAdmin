import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

const source = readFileSync(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
const contract = parse(source);

function schema(name) {
  const result = contract.components?.schemas?.[name];
  assert.ok(result, `falta components.schemas.${name}`);
  return result;
}

describe("contrato del asistente de Rendimiento", () => {
  it("publica un POST autenticado dentro del módulo ejecutivo", () => {
    const operation = contract.paths?.["/rendimiento/asistente/chat"]?.post;

    assert.ok(operation, "falta POST /rendimiento/asistente/chat");
    assert.equal(operation.operationId, "sendRendimientoChatMessage");
    assert.deepEqual(operation.security, [{ sessionCookie: [] }]);
    assert.equal(
      operation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/RendimientoChatMessage",
    );
    assert.match(operation.description, /Basic Auth/);
    assert.match(operation.description, /servidor/i);
  });

  it("acepta únicamente el contrato exacto requerido por el Chat Trigger", () => {
    const message = schema("RendimientoChatMessage");

    assert.equal(message.additionalProperties, false);
    assert.deepEqual(message.required, ["action", "sessionId", "chatInput"]);
    assert.deepEqual(Object.keys(message.properties), [
      "action",
      "sessionId",
      "chatInput",
    ]);
    assert.deepEqual(message.properties.action.enum, ["sendMessage"]);
    assert.equal(message.properties.sessionId.format, "uuid");
    assert.match(message.properties.sessionId.pattern, /\{8\}.*-4/);
    assert.equal(message.properties.chatInput.minLength, 1);
    assert.equal(message.properties.chatInput.maxLength, 8192);
  });

  it("documenta respuestas controladas sin filtrar detalles de n8n", () => {
    const operation = contract.paths["/rendimiento/asistente/chat"].post;
    assert.deepEqual(Object.keys(operation.responses), [
      "200",
      "400",
      "401",
      "403",
      "502",
      "503",
      "504",
    ]);

    const success = schema("RendimientoChatResponse");
    assert.equal(success.additionalProperties, false);
    assert.deepEqual(success.required, ["output"]);
    assert.deepEqual(Object.keys(success.properties), ["output"]);

    const error = schema("RendimientoChatError");
    assert.equal(error.additionalProperties, false);
    assert.deepEqual(error.required, ["code", "error", "output"]);
    for (const status of ["400", "502", "503", "504"]) {
      assert.equal(
        operation.responses[status].content["application/json"].schema.$ref,
        "#/components/schemas/RendimientoChatError",
      );
    }
  });
});
