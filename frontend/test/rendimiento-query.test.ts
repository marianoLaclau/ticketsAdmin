import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRendimientoQualityParams,
  createDefaultRendimientoCustomRange,
  getRendimientoDateRange,
} from "../src/features/rendimiento/rendimiento-query.ts";

const REFERENCE_DATE = new Date("2026-08-13T15:00:00.000Z");

describe("parámetros de Calidad de datos", () => {
  it("convierte el mes predeterminado en fechas de Buenos Aires", () => {
    assert.deepEqual(createDefaultRendimientoCustomRange(REFERENCE_DATE), {
      desde: "2026-08-01",
      hasta: "2026-08-13",
    });
    assert.deepEqual(
      buildRendimientoQualityParams({ periodo: "mes" }, REFERENCE_DATE),
      { fecha_desde: "2026-08-01", fecha_hasta: "2026-08-13" },
    );
  });

  it("calcula semana, últimos 30 y últimos 90 como rangos inclusivos", () => {
    assert.deepEqual(
      getRendimientoDateRange({ periodo: "semana" }, REFERENCE_DATE),
      { desde: "2026-08-10", hasta: "2026-08-13" },
    );
    assert.deepEqual(
      getRendimientoDateRange({ periodo: "ultimos_30" }, REFERENCE_DATE),
      { desde: "2026-07-15", hasta: "2026-08-13" },
    );
    assert.deepEqual(
      getRendimientoDateRange({ periodo: "ultimos_90" }, REFERENCE_DATE),
      { desde: "2026-05-16", hasta: "2026-08-13" },
    );
  });

  it("respeta el rango personalizado sin recalcularlo", () => {
    assert.deepEqual(
      buildRendimientoQualityParams(
        {
          periodo: "personalizado",
          desde: "2024-02-29",
          hasta: "2024-03-01",
        },
        REFERENCE_DATE,
      ),
      { fecha_desde: "2024-02-29", fecha_hasta: "2024-03-01" },
    );
  });

  it("mapea filtros del codec al contrato generado sin propiedades vacías", () => {
    assert.deepEqual(
      buildRendimientoQualityParams(
        {
          periodo: "ultimos_30",
          empresa: "GSB IT",
          categoria: "legales",
          prioridad: "urgente",
        },
        REFERENCE_DATE,
      ),
      {
        fecha_desde: "2026-07-15",
        fecha_hasta: "2026-08-13",
        empresa: "GSB IT",
        motivo_categoria: "legales",
        prioridad: "urgente",
      },
    );
  });

  it("resuelve el día de negocio aunque UTC ya esté en otra fecha", () => {
    assert.deepEqual(
      getRendimientoDateRange(
        { periodo: "mes" },
        new Date("2026-09-01T02:30:00.000Z"),
      ),
      { desde: "2026-08-01", hasta: "2026-08-31" },
    );
  });
});
