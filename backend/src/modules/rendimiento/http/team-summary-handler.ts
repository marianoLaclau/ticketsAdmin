import {
  GetRendimientoResumenEquipoQueryParams,
  GetRendimientoResumenEquipoResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { SLA_TIME_ZONE } from "@workspace/ingesta";
import type { RequestHandler } from "express";
import {
  isBusinessDateRangeValid,
  normalizeBusinessDateQuery,
} from "../../../shared/time/business-date-range";
import { consultarResumenEquipo } from "../data/team-summary-query";
import {
  hasNonSingletonRendimientoFilter,
  requestedRendimientoPeriod,
  respondInvalidRendimientoFilters,
} from "./request-filters";

export type RendimientoTeamSummaryHandlerOptions = {
  database?: typeof db;
  now?: () => Date;
};

/**
 * Frontera HTTP del resumen de equipo. El reloj y la DB son inyectables para
 * probar el snapshot completo sin depender del tiempo ni del estado global.
 */
export function createRendimientoTeamSummaryHandler({
  database = db,
  now = () => new Date(),
}: RendimientoTeamSummaryHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    res.set("Cache-Control", "private, no-store");

    if (hasNonSingletonRendimientoFilter(req.query)) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const requestedPeriod = requestedRendimientoPeriod(req.query);
    const parsed = GetRendimientoResumenEquipoQueryParams.safeParse(
      normalizeBusinessDateQuery(req.query),
    );
    if (!parsed.success || !isBusinessDateRangeValid(parsed.data)) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const generatedAt = now();
    const summary = consultarResumenEquipo(database, parsed.data, generatedAt);
    const validated = GetRendimientoResumenEquipoResponse.parse({
      periodo: {
        fecha_desde: parsed.data.fecha_desde ?? null,
        fecha_hasta: parsed.data.fecha_hasta ?? null,
        timezone: SLA_TIME_ZONE,
        generado_en: generatedAt,
      },
      ...summary,
    });

    // Orval valida `format: date` como Date. En JSON se preservan exactamente
    // los días calendario solicitados para evitar corrimientos por zona horaria.
    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...requestedPeriod,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
    });
  };
}
