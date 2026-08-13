import { SLA_TIME_ZONE, parseFecha } from "@workspace/ingesta";

export type DashboardDateRange = {
  fecha_desde?: Date;
  fecha_hasta?: Date;
};

export type BusinessDayWindow = {
  start: Date;
  end: Date;
};

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SLA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function businessCalendarParts(now: Date): {
  year: number;
  month: number;
  day: number;
} {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("El instante de negocio no es valido");
  }

  const parts = new Map(
    businessDateFormatter
      .formatToParts(now)
      .map(({ type, value }) => [type, value] as const),
  );
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError("No se pudo determinar el dia calendario de negocio");
  }
  return { year, month, day };
}

function calendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Devuelve el día calendario que contiene a `now` en la zona de negocio.
 * No depende de `TZ` ni de la zona local del proceso.
 */
export function businessDayWindow(now: Date): BusinessDayWindow {
  const { year, month, day } = businessCalendarParts(now);
  const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1));
  const start = parseFecha(calendarDate(year, month, day));
  const end = parseFecha(
    calendarDate(
      nextCalendarDay.getUTCFullYear(),
      nextCalendarDay.getUTCMonth() + 1,
      nextCalendarDay.getUTCDate(),
    ),
  );
  if (!start || !end) {
    throw new RangeError("No se pudo construir el dia calendario de negocio");
  }
  return { start, end };
}

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
