import {
  GetRendimientoPersonasQueryParams,
  GetRendimientoPersonasResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { SLA_TIME_ZONE } from "@workspace/ingesta";
import type { RequestHandler } from "express";
import {
  isBusinessDateRangeValid,
  normalizeBusinessDateQuery,
} from "../../../shared/time/business-date-range";
import { consultarRendimientoPersonas } from "../data/individual-query";
import {
  hasNonSingletonRendimientoFilter,
  requestedRendimientoPeriod,
  respondInvalidRendimientoFilters,
} from "./request-filters";

export type RendimientoIndividualHandlerOptions = {
  database?: typeof db;
  now?: () => Date;
};

/**
 * Frontera HTTP de los indicadores individuales. La DB y el reloj son
 * inyectables para conservar un unico snapshot durante toda la consulta.
 */
export function createRendimientoIndividualHandler({
  database = db,
  now = () => new Date(),
}: RendimientoIndividualHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    res.set("Cache-Control", "private, no-store");

    if (hasNonSingletonRendimientoFilter(req.query)) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const requestedPeriod = requestedRendimientoPeriod(req.query);
    const parsed = GetRendimientoPersonasQueryParams.safeParse(
      normalizeBusinessDateQuery(req.query),
    );
    if (!parsed.success || !isBusinessDateRangeValid(parsed.data)) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const generatedAt = now();
    const individual = consultarRendimientoPersonas(
      database,
      parsed.data,
      generatedAt,
    );
    const validated = GetRendimientoPersonasResponse.parse({
      periodo: {
        fecha_desde: parsed.data.fecha_desde ?? null,
        fecha_hasta: parsed.data.fecha_hasta ?? null,
        timezone: SLA_TIME_ZONE,
        generado_en: generatedAt,
      },
      ...individual,
    });

    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...requestedPeriod,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
      cobertura: {
        ...validated.cobertura,
        atribucion_desde:
          validated.cobertura.atribucion_desde?.toISOString() ?? null,
      },
    });
  };
}
