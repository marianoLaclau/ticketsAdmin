import {
  GetRendimientoResumenEquipoQueryParams,
  GetRendimientoResumenEquipoResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import type { RequestHandler } from "express";
import { consultarResumenEquipo } from "../data/team-summary-query";
import {
  buildRendimientoPeriodo,
  parseRendimientoQueryParams,
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

    const parsed = parseRendimientoQueryParams(
      req.query,
      GetRendimientoResumenEquipoQueryParams,
    );
    if (!parsed.success) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const generatedAt = now();
    const summary = consultarResumenEquipo(database, parsed.data, generatedAt);
    const validated = GetRendimientoResumenEquipoResponse.parse({
      periodo: buildRendimientoPeriodo(parsed.data, generatedAt),
      ...summary,
    });

    // Orval valida `format: date` como Date. En JSON se preservan exactamente
    // los días calendario solicitados para evitar corrimientos por zona horaria.
    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...parsed.requestedPeriod,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
    });
  };
}
