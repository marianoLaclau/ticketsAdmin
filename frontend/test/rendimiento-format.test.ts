import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRendimientoCalendarDate,
  formatRendimientoDateTime,
  formatRendimientoPeriod,
} from "../src/features/rendimiento/rendimiento-format.ts";

describe("formato compartido de Rendimiento", () => {
  it("presenta fechas calendario y períodos sin desplazamiento UTC", () => {
    assert.equal(formatRendimientoCalendarDate("2026-08-03"), "03/08/2026");
    assert.equal(formatRendimientoCalendarDate(null), null);
    assert.equal(formatRendimientoCalendarDate("dato legado"), "dato legado");
    assert.equal(
      formatRendimientoPeriod({
        fecha_desde: "2026-08-01",
        fecha_hasta: "2026-08-13",
      }),
      "01/08/2026 al 13/08/2026",
    );
    assert.equal(
      formatRendimientoPeriod({ fecha_desde: null, fecha_hasta: null }),
      "Todo el historial",
    );
  });

  it("respeta la zona contractual y tolera una zona inválida", () => {
    const instant = "2026-08-14T01:30:00.000Z";
    const businessTime = formatRendimientoDateTime(
      instant,
      "America/Argentina/Buenos_Aires",
    );
    assert.ok(businessTime);
    assert.match(businessTime, /13 ago 2026/);

    assert.ok(formatRendimientoDateTime(instant, "zona-inexistente"));
    assert.equal(
      formatRendimientoDateTime(
        "fecha-inválida",
        "America/Argentina/Buenos_Aires",
      ),
      null,
    );
  });
});
