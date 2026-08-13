import { db } from "@workspace/db";
import {
  GetRendimientoCalidadDatosQueryParams,
  GetRendimientoCalidadDatosResponse,
} from "@workspace/api-zod";
import { SLA_TIME_ZONE } from "@workspace/ingesta";
import type { RequestHandler, Response } from "express";
import {
  isBusinessDateRangeValid,
  normalizeBusinessDateQuery,
} from "../../../shared/time/business-date-range";
import { consultarCalidadRendimiento } from "../data/quality-query";

export type RendimientoQualityHandlerOptions = {
  database?: typeof db;
  now?: () => Date;
};

const FILTER_NAMES = [
  "fecha_desde",
  "fecha_hasta",
  "empresa",
  "motivo_categoria",
  "prioridad",
] as const;

function invalidFilters(res: Response): void {
  res.status(400).json({
    error:
      "Los filtros indicados no son válidos. Revisá las fechas desde y hasta.",
  });
}

/**
 * Construye la frontera HTTP con dependencias inyectables para que la cohorte
 * y el instante informado puedan probarse sin alterar el reloj ni la DB global.
 */
export function createRendimientoQualityHandler({
  database = db,
  now = () => new Date(),
}: RendimientoQualityHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    res.set("Cache-Control", "private, no-store");

    if (
      FILTER_NAMES.some(
        (filter) =>
          req.query[filter] !== undefined &&
          typeof req.query[filter] !== "string",
      )
    ) {
      invalidFilters(res);
      return;
    }
    const requestedStart =
      typeof req.query.fecha_desde === "string" ? req.query.fecha_desde : null;
    const requestedEnd =
      typeof req.query.fecha_hasta === "string" ? req.query.fecha_hasta : null;
    const parsed = GetRendimientoCalidadDatosQueryParams.safeParse(
      normalizeBusinessDateQuery(req.query),
    );
    if (!parsed.success || !isBusinessDateRangeValid(parsed.data)) {
      invalidFilters(res);
      return;
    }

    const generatedAt = now();
    const quality = consultarCalidadRendimiento(database, parsed.data);
    const validated = GetRendimientoCalidadDatosResponse.parse({
      periodo: {
        fecha_desde: parsed.data.fecha_desde ?? null,
        fecha_hasta: parsed.data.fecha_hasta ?? null,
        timezone: SLA_TIME_ZONE,
        generado_en: generatedAt,
      },
      ...quality,
    });

    // Orval representa `format: date` como Date durante la validación. La
    // frontera vuelve a la representación JSON declarada por OpenAPI.
    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        fecha_desde: requestedStart,
        fecha_hasta: requestedEnd,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
      atribucion_desde: validated.atribucion_desde?.toISOString() ?? null,
    });
  };
}
