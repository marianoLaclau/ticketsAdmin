import { parseFecha } from "@workspace/ingesta";

export type DashboardDateRange = {
  fecha_desde?: Date;
  fecha_hasta?: Date;
};

function parseLocalCalendarDate(value: unknown, endOfDay: boolean): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return new Date(Number.NaN);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);

  return (
    parseFecha(endOfDay ? `${value}T23:59:59.999` : value) ??
    new Date(Number.NaN)
  );
}

/**
 * Conserva el día calendario enviado por la UI en la zona de negocio
 * America/Argentina/Buenos_Aires, sin depender de la zona del proceso.
 */
export function normalizeDashboardDateQuery(
  query: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...query,
    fecha_desde: parseLocalCalendarDate(query.fecha_desde, false),
    fecha_hasta: parseLocalCalendarDate(query.fecha_hasta, true),
  };
}

export function isDashboardDateRangeValid(range: DashboardDateRange): boolean {
  return !(
    range.fecha_desde &&
    range.fecha_hasta &&
    range.fecha_desde.getTime() > range.fecha_hasta.getTime()
  );
}
