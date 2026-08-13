import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import {
  normalizeTicketQuery,
  parseBooleanQueryParam,
} from "../src/modules/tickets/http/query-normalization.ts";

function asRequestQuery(query: Record<string, unknown>): Request["query"] {
  return query as Request["query"];
}

function assertInvalidDate(value: unknown): void {
  assert.ok(value instanceof Date);
  assert.equal(Number.isNaN(value.getTime()), true);
}

describe("normalizacion de query de tickets", () => {
  it("convierte exclusivamente los booleanos reconocidos", () => {
    assert.equal(parseBooleanQueryParam("true"), true);
    assert.equal(parseBooleanQueryParam(true), true);
    assert.equal(parseBooleanQueryParam("false"), false);
    assert.equal(parseBooleanQueryParam(false), false);

    const untouchedValues: unknown[] = [
      "TRUE",
      "1",
      1,
      0,
      null,
      undefined,
      ["true"],
      { value: "true" },
    ];
    for (const value of untouchedValues) {
      assert.strictEqual(parseBooleanQueryParam(value), value);
    }
  });

  it("normaliza el inicio y fin de una fecha en horario local", () => {
    const source = {
      fecha_desde: "2024-02-29",
      fecha_hasta: "2024-02-29",
      vencidos: "true",
      incluir_vacios: "false",
      search: "consulta",
    };

    const normalized = normalizeTicketQuery(asRequestQuery(source));
    const from = normalized.fecha_desde;
    const until = normalized.fecha_hasta;

    assert.ok(from instanceof Date);
    assert.deepEqual(
      [
        from.getFullYear(),
        from.getMonth(),
        from.getDate(),
        from.getHours(),
        from.getMinutes(),
        from.getSeconds(),
        from.getMilliseconds(),
      ],
      [2024, 1, 29, 0, 0, 0, 0],
    );
    assert.ok(until instanceof Date);
    assert.deepEqual(
      [
        until.getFullYear(),
        until.getMonth(),
        until.getDate(),
        until.getHours(),
        until.getMinutes(),
        until.getSeconds(),
        until.getMilliseconds(),
      ],
      [2024, 1, 29, 23, 59, 59, 999],
    );
    assert.equal(normalized.vencidos, true);
    assert.equal(normalized.incluir_vacios, false);
    assert.equal(normalized.search, "consulta");
    assert.deepEqual(source, {
      fecha_desde: "2024-02-29",
      fecha_hasta: "2024-02-29",
      vencidos: "true",
      incluir_vacios: "false",
      search: "consulta",
    });
  });

  it("representa formatos y fechas invalidas como Invalid Date", () => {
    for (const value of [
      "2026-02-30",
      "30/07/2026",
      "2026-7-02",
      "2026-07-02T00:00:00Z",
      ["2026-07-02"],
      20260702,
      null,
    ]) {
      const normalized = normalizeTicketQuery(
        asRequestQuery({ fecha_desde: value, fecha_hasta: value }),
      );
      assertInvalidDate(normalized.fecha_desde);
      assertInvalidDate(normalized.fecha_hasta);
    }
  });

  it("preserva claves ajenas y agrega campos ausentes como undefined", () => {
    const source = { search: "sin mutar" };
    const normalized = normalizeTicketQuery(asRequestQuery(source));

    assert.equal(normalized.search, "sin mutar");
    assert.equal(normalized.fecha_desde, undefined);
    assert.equal(normalized.fecha_hasta, undefined);
    assert.equal(normalized.vencidos, undefined);
    assert.equal(normalized.incluir_vacios, undefined);
    assert.ok(Object.hasOwn(normalized, "fecha_desde"));
    assert.ok(Object.hasOwn(normalized, "fecha_hasta"));
    assert.ok(Object.hasOwn(normalized, "vencidos"));
    assert.ok(Object.hasOwn(normalized, "incluir_vacios"));
    assert.deepEqual(source, { search: "sin mutar" });
  });
});
