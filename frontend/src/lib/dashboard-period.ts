import { isValidCalendarDate } from "./calendar-date.ts";

export type DashboardPeriod = "todo" | "semana" | "mes" | "personalizado";

export type DashboardDateParams = {
  fecha_desde: string;
  fecha_hasta: string;
};

export interface DashboardRefreshSnapshot {
  businessDateKey: string;
  rangeKey: string;
}

export const DASHBOARD_TIME_ZONE = "America/Argentina/Buenos_Aires";

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DASHBOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatCalendarDate({ year, month, day }: CalendarDateParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getBusinessDateParts(date: Date): CalendarDateParts {
  const parts = Object.fromEntries(
    businessDateFormatter
      .formatToParts(date)
      .filter(
        ({ type }) => type === "year" || type === "month" || type === "day",
      )
      .map(({ type, value }) => [type, Number(value)]),
  ) as Partial<CalendarDateParts>;

  if (!parts.year || !parts.month || !parts.day) {
    throw new RangeError("No se pudo resolver la fecha de negocio");
  }

  return { year: parts.year, month: parts.month, day: parts.day };
}

function createUtcCalendarDate({ year, month, day }: CalendarDateParts): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function getUtcCalendarDateParts(date: Date): CalendarDateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getDashboardBusinessDateKey(now = new Date()): string {
  return formatCalendarDate(getBusinessDateParts(now));
}

export function getDashboardRangeKey(
  range: DashboardDateParams | undefined,
): string {
  return range ? `${range.fecha_desde}:${range.fecha_hasta}` : "todo";
}

export function shouldRefreshDashboardAtBusinessDateChange(
  previous: DashboardRefreshSnapshot,
  current: DashboardRefreshSnapshot,
): boolean {
  return (
    previous.businessDateKey !== current.businessDateKey &&
    previous.rangeKey === current.rangeKey
  );
}

export function currentMonthToToday(now = new Date()): DashboardDateParams {
  const today = getBusinessDateParts(now);
  return {
    fecha_desde: formatCalendarDate({ ...today, day: 1 }),
    fecha_hasta: formatCalendarDate(today),
  };
}

export function getDashboardPeriodParams(
  period: Exclude<DashboardPeriod, "personalizado">,
  now = new Date(),
): DashboardDateParams | undefined {
  if (period === "todo") return undefined;
  const today = getBusinessDateParts(now);

  if (period === "mes") {
    const lastDay = new Date(Date.UTC(today.year, today.month, 0));
    return {
      fecha_desde: formatCalendarDate({ ...today, day: 1 }),
      fecha_hasta: formatCalendarDate(getUtcCalendarDateParts(lastDay)),
    };
  }

  // Domingo es 0. Este desplazamiento convierte lunes en el primer día y
  // UTC evita que la aritmética vuelva a depender de la zona del navegador.
  const todayUtc = createUtcCalendarDate(today);
  const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
  const monday = new Date(todayUtc);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  return {
    fecha_desde: formatCalendarDate(getUtcCalendarDateParts(monday)),
    fecha_hasta: formatCalendarDate(getUtcCalendarDateParts(sunday)),
  };
}

export function validateDashboardDateRange(
  fechaDesde: string,
  fechaHasta: string,
): string | null {
  if (!fechaDesde || !fechaHasta) return "Completá las fechas desde y hasta.";
  if (!isValidCalendarDate(fechaDesde) || !isValidCalendarDate(fechaHasta)) {
    return "Ingresá fechas válidas.";
  }
  if (fechaDesde > fechaHasta) {
    return "La fecha desde no puede ser posterior a la fecha hasta.";
  }
  return null;
}

export function getDashboardRangeLabel(range: DashboardDateParams): string {
  const toDisplayDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  return `${toDisplayDate(range.fecha_desde)} al ${toDisplayDate(range.fecha_hasta)}`;
}

export function getDashboardPeriodLabel(period: DashboardPeriod): string {
  switch (period) {
    case "semana":
      return "esta semana";
    case "mes":
      return "este mes";
    case "personalizado":
      return "en el período";
    default:
      return "hoy";
  }
}
