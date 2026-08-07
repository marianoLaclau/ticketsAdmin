import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidCalendarDate } from "../src/lib/calendar-date.ts";

describe("fecha calendario ISO", () => {
  it("acepta fechas reales con cuatro dígitos de año", () => {
    for (const value of ["0001-01-01", "2024-02-29", "2026-04-30"]) {
      assert.equal(isValidCalendarDate(value), true);
    }
  });

  it("rechaza formatos y fechas imposibles", () => {
    for (const value of [
      "",
      "2026-2-01",
      "2026-02-1",
      "0000-01-01",
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
    ]) {
      assert.equal(isValidCalendarDate(value), false);
    }
  });
});
