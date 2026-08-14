import { db } from "@workspace/db";
import {
  GetRendimientoCalidadDatosQueryParams,
  GetRendimientoCalidadDatosResponse,
} from "@workspace/api-zod";
import type { RequestHandler } from "express";
import { consultarCalidadRendimiento } from "../data/quality-query";
import {
  buildRendimientoPeriodo,
  parseRendimientoQueryParams,
  respondInvalidRendimientoFilters,
} from "./request-filters";

export type RendimientoQualityHandlerOptions = {
  database?: typeof db;
  now?: () => Date;
};

/**
 * Construye la frontera HTTP con dependencias inyectables para que el conjunto analizado
 * y el instante informado puedan probarse sin alterar el reloj ni la DB global.
 */
export function createRendimientoQualityHandler({
  database = db,
  now = () => new Date(),
}: RendimientoQualityHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    res.set("Cache-Control", "private, no-store");

    const parsed = parseRendimientoQueryParams(
      req.query,
      GetRendimientoCalidadDatosQueryParams,
    );
    if (!parsed.success) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const generatedAt = now();
    const quality = consultarCalidadRendimiento(database, parsed.data);
    const validated = GetRendimientoCalidadDatosResponse.parse({
      periodo: buildRendimientoPeriodo(parsed.data, generatedAt),
      ...quality,
    });

    // Orval representa `format: date` como Date durante la validación. La
    // frontera vuelve a la representación JSON declarada por OpenAPI.
    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...parsed.requestedPeriod,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
      atribucion_desde: validated.atribucion_desde?.toISOString() ?? null,
    });
  };
}
