import { SLA_TIME_ZONE } from "@workspace/ingesta";
import type { Request, Response } from "express";
import {
  isBusinessDateRangeValid,
  normalizeBusinessDateQuery,
  type BusinessDateRange,
} from "../../../shared/time/business-date-range";

export const RENDIMIENTO_FILTER_NAMES = [
  "fecha_desde",
  "fecha_hasta",
  "empresa",
  "motivo_categoria",
  "prioridad",
] as const;

export type RequestedRendimientoPeriod = {
  fecha_desde: string | null;
  fecha_hasta: string | null;
};

type QuerySchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export type ParsedRendimientoQuery<T> =
  | { success: false }
  | {
      success: true;
      data: T;
      requestedPeriod: RequestedRendimientoPeriod;
    };

/** Cada filtro de Rendimiento es opcional, pero nunca repetible ni anidable. */
export function hasNonSingletonRendimientoFilter(
  query: Request["query"],
): boolean {
  return Object.entries(query).some(
    ([key, value]) =>
      RENDIMIENTO_FILTER_NAMES.some(
        (filter) => key === filter || key.startsWith(`${filter}[`),
      ) &&
      (key.includes("[") || typeof value !== "string"),
  );
}

/** Conserva las fechas calendario solicitadas para serializarlas sin UTC drift. */
export function requestedRendimientoPeriod(
  query: Request["query"],
): RequestedRendimientoPeriod {
  return {
    fecha_desde:
      typeof query.fecha_desde === "string" ? query.fecha_desde : null,
    fecha_hasta:
      typeof query.fecha_hasta === "string" ? query.fecha_hasta : null,
  };
}

export function respondInvalidRendimientoFilters(res: Response): void {
  res.status(400).json({
    error:
      "Los filtros indicados no son válidos. Revisá las fechas desde y hasta.",
  });
}

/** Valida una sola ocurrencia por filtro y normaliza el periodo en la TZ de negocio. */
export function parseRendimientoQueryParams<T extends BusinessDateRange>(
  query: Request["query"],
  schema: QuerySchema<T>,
): ParsedRendimientoQuery<T> {
  if (hasNonSingletonRendimientoFilter(query)) return { success: false };

  const parsed = schema.safeParse(normalizeBusinessDateQuery(query));
  if (!parsed.success || !isBusinessDateRangeValid(parsed.data)) {
    return { success: false };
  }

  return {
    success: true,
    data: parsed.data,
    requestedPeriod: requestedRendimientoPeriod(query),
  };
}

/** Construye el periodo contractual usando el mismo instante que la consulta. */
export function buildRendimientoPeriodo(
  filters: BusinessDateRange,
  generatedAt: Date,
) {
  return {
    fecha_desde: filters.fecha_desde ?? null,
    fecha_hasta: filters.fecha_hasta ?? null,
    timezone: SLA_TIME_ZONE,
    generado_en: generatedAt,
  } as const;
}
