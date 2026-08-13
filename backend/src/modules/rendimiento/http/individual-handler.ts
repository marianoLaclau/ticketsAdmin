import {
  GetRendimientoPersonasQueryParams,
  GetRendimientoPersonasResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import type { RequestHandler } from "express";
import { consultarRendimientoPersonas } from "../data/individual-query";
import {
  buildRendimientoPeriodo,
  parseRendimientoQueryParams,
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

    const parsed = parseRendimientoQueryParams(
      req.query,
      GetRendimientoPersonasQueryParams,
    );
    if (!parsed.success) {
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
      periodo: buildRendimientoPeriodo(parsed.data, generatedAt),
      ...individual,
    });

    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...parsed.requestedPeriod,
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
