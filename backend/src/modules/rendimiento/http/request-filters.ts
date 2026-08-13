import type { Request, Response } from "express";

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
