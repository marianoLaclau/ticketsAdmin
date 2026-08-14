import type {
  GetRendimientoCalidadDatosParams,
  GetRendimientoPersonasParams,
  GetRendimientoResumenEquipoParams,
} from "@workspace/api-client-react";
import type {
  RendimientoPeriodo,
  RendimientoFilterState,
} from "@/features/rendimiento/rendimiento-url";

export const RENDIMIENTO_TIME_ZONE = "America/Argentina/Buenos_Aires";

export interface RendimientoDateRange {
  desde: string;
  hasta: string;
}

export type RendimientoQueryParams = GetRendimientoCalidadDatosParams &
  GetRendimientoPersonasParams &
  GetRendimientoResumenEquipoParams;

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RENDIMIENTO_TIME_ZONE,
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
    throw new RangeError("No se pudo resolver la fecha de Rendimiento");
  }

  return { year: parts.year, month: parts.month, day: parts.day };
}

function createUtcCalendarDate({ year, month, day }: CalendarDateParts): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcCalendarDate(date: Date): string {
  return formatCalendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function subtractCalendarDays(today: CalendarDateParts, days: number): string {
  const date = createUtcCalendarDate(today);
  date.setUTCDate(date.getUTCDate() - days);
  return formatUtcCalendarDate(date);
}

export function createDefaultRendimientoCustomRange(
  now = new Date(),
): RendimientoDateRange {
  const today = getBusinessDateParts(now);
  return {
    desde: formatCalendarDate({ ...today, day: 1 }),
    hasta: formatCalendarDate(today),
  };
}

function getPresetRange(
  periodo: Exclude<RendimientoPeriodo, "personalizado" | "todo">,
  now: Date,
): RendimientoDateRange {
  const today = getBusinessDateParts(now);
  const hasta = formatCalendarDate(today);

  if (periodo === "mes") {
    return {
      desde: formatCalendarDate({ ...today, day: 1 }),
      hasta,
    };
  }

  if (periodo === "ultimos_30" || periodo === "ultimos_90") {
    return {
      desde: subtractCalendarDays(today, periodo === "ultimos_30" ? 29 : 89),
      hasta,
    };
  }

  const todayUtc = createUtcCalendarDate(today);
  const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
  return {
    desde: subtractCalendarDays(today, daysSinceMonday),
    hasta,
  };
}

export function getRendimientoDateRange(
  state: RendimientoFilterState,
  now = new Date(),
): RendimientoDateRange | null {
  if (state.periodo === "todo") return null;
  if (state.periodo === "personalizado") {
    return { desde: state.desde, hasta: state.hasta };
  }
  return getPresetRange(state.periodo, now);
}

export function buildRendimientoParams(
  state: RendimientoFilterState,
  now = new Date(),
): RendimientoQueryParams {
  const range = getRendimientoDateRange(state, now);
  return {
    ...(range ? { fecha_desde: range.desde, fecha_hasta: range.hasta } : {}),
    ...(state.empresa ? { empresa: state.empresa } : {}),
    ...(state.categoria ? { motivo_categoria: state.categoria } : {}),
    ...(state.prioridad ? { prioridad: state.prioridad } : {}),
  };
}
