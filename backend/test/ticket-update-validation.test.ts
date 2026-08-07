import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasTechnicalTicketUpdateFields,
  parseTicketUpdateBody,
} from "../src/lib/ticket-update-validation.ts";

function assertParseError(value: unknown, expectedError: string): void {
  const result = parseTicketUpdateBody(value);
  assert.deepEqual(result, { success: false, error: expectedError });
}

describe("validacion del PATCH de tickets", () => {
  it("detecta campos tecnicos por presencia propia", () => {
    for (const field of [
      "hora",
      "notificado",
      "audio_url",
      "fecha_resolucion",
      "fecha_limite",
    ]) {
      assert.equal(
        hasTechnicalTicketUpdateFields({ [field]: undefined }),
        true,
      );
    }

    assert.equal(
      hasTechnicalTicketUpdateFields({
        expected_version: 1,
        nombre: "Ana",
      }),
      false,
    );
    assert.equal(hasTechnicalTicketUpdateFields(null), false);
    assert.equal(hasTechnicalTicketUpdateFields([]), false);
    assert.equal(hasTechnicalTicketUpdateFields("fecha_limite"), false);

    const inherited = Object.create({ fecha_limite: "2026-07-30T12:00:00Z" });
    assert.equal(hasTechnicalTicketUpdateFields(inherited), false);
  });

  it("rechaza cuerpos no objeto y campos fuera de la whitelist primero", () => {
    for (const value of [null, [], "texto", 1]) {
      assertParseError(value, "El cuerpo contiene campos no permitidos");
    }

    assertParseError(
      {
        expected_version: 1,
        campo_interno: true,
        fecha_limite: "fecha invalida",
        email: "email invalido",
      },
      "El cuerpo contiene campos no permitidos",
    );
  });

  it("valida RFC3339 antes del email y conserva el campo en el mensaje", () => {
    assertParseError(
      {
        expected_version: 1,
        fecha_limite: "2026-02-30T12:00:00Z",
        email: "email invalido",
      },
      "El campo fecha_limite debe ser una fecha RFC3339 válida con zona horaria",
    );
    assertParseError(
      {
        expected_version: 1,
        fecha_resolucion: "2026-07-30T12:00:00",
      },
      "El campo fecha_resolucion debe ser una fecha RFC3339 válida con zona horaria",
    );
  });

  it("valida y normaliza el email sin mutar el body", () => {
    for (const email of [
      "ana@",
      "ana example.com",
      123,
      false,
      `${"a".repeat(250)}@x.co`,
    ]) {
      assertParseError(
        { expected_version: 1, nombre: "Ana", email },
        "El email no tiene un formato válido",
      );
    }

    const original = {
      expected_version: 1,
      nombre: "Ana",
      email: "  nueva@example.com  ",
    };
    const valid = parseTicketUpdateBody(original);
    assert.equal(valid.success, true);
    if (valid.success) assert.equal(valid.data.email, "nueva@example.com");
    assert.equal(original.email, "  nueva@example.com  ");

    const blank = parseTicketUpdateBody({
      expected_version: 1,
      nombre: "Ana",
      email: "   ",
    });
    assert.equal(blank.success, true);
    if (blank.success) assert.equal(blank.data.email, null);

    const nullable = parseTicketUpdateBody({
      expected_version: 1,
      nombre: "Ana",
      email: null,
    });
    assert.equal(nullable.success, true);
    if (nullable.success) assert.equal(nullable.data.email, null);
  });

  it("mantiene los errores especificos posteriores a Zod", () => {
    assertParseError({ nombre: "Ana" }, "Datos de actualización inválidos");
    assertParseError(
      { expected_version: 1 },
      "Indicá al menos un campo para actualizar",
    );
    for (const expected_version of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assertParseError(
        { expected_version, nombre: "Ana" },
        "La versión esperada debe ser un entero válido",
      );
    }
    assertParseError(
      { expected_version: 1, progreso: 1.5 },
      "El progreso debe ser un número entero",
    );
  });

  it("devuelve fechas parseadas y conserva intacto un body valido", () => {
    const source = {
      expected_version: 2,
      nombre: "  Ana  ",
      fecha_limite: "2026-07-30T12:00:00.000Z",
      fecha_resolucion: "2026-07-30T09:45:30-03:00",
      progreso: 50,
    };

    const result = parseTicketUpdateBody(source);
    assert.equal(result.success, true);
    if (!result.success) return;

    assert.equal(result.data.expected_version, 2);
    assert.equal(result.data.nombre, "  Ana  ");
    assert.equal(
      result.data.fecha_limite?.toISOString(),
      "2026-07-30T12:00:00.000Z",
    );
    assert.equal(
      result.data.fecha_resolucion?.toISOString(),
      "2026-07-30T12:45:30.000Z",
    );
    assert.equal(result.data.progreso, 50);
    assert.deepEqual(source, {
      expected_version: 2,
      nombre: "  Ana  ",
      fecha_limite: "2026-07-30T12:00:00.000Z",
      fecha_resolucion: "2026-07-30T09:45:30-03:00",
      progreso: 50,
    });
  });
});
