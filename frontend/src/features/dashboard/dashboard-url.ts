import type { DashboardPeriod } from "./dashboard-period.ts";
import { isValidCalendarDate } from "@/lib/calendar-date";

type DashboardPresetPeriod = Exclude<DashboardPeriod, "personalizado">;

export type DashboardUrlState =
  | { periodo: DashboardPresetPeriod }
  | {
      periodo: "personalizado";
      fecha_desde: string;
      fecha_hasta: string;
    };

const DASHBOARD_PERIOD_MAP = {
  todo: true,
  semana: true,
  mes: true,
  personalizado: true,
} as const satisfies Record<DashboardPeriod, true>;
const DASHBOARD_URL_PERIODS = Object.keys(
  DASHBOARD_PERIOD_MAP,
) as DashboardPeriod[];
const DASHBOARD_PERIODS = new Set<string>(DASHBOARD_URL_PERIODS);

export function createDefaultDashboardUrlState(): DashboardUrlState {
  return { periodo: "todo" };
}

function normalizeDashboardUrlState(state: unknown): DashboardUrlState {
  try {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return createDefaultDashboardUrlState();
    }

    const candidate = state as Record<string, unknown>;
    if (!Object.hasOwn(candidate, "periodo")) {
      return createDefaultDashboardUrlState();
    }

    const periodo = candidate.periodo;
    if (typeof periodo !== "string" || !DASHBOARD_PERIODS.has(periodo)) {
      return createDefaultDashboardUrlState();
    }

    if (periodo === "todo") return createDefaultDashboardUrlState();
    if (periodo === "semana" || periodo === "mes") return { periodo };

    if (
      !Object.hasOwn(candidate, "fecha_desde") ||
      !Object.hasOwn(candidate, "fecha_hasta")
    ) {
      return createDefaultDashboardUrlState();
    }

    const fechaDesde = candidate.fecha_desde;
    const fechaHasta = candidate.fecha_hasta;
    if (
      typeof fechaDesde !== "string" ||
      typeof fechaHasta !== "string" ||
      !isValidCalendarDate(fechaDesde) ||
      !isValidCalendarDate(fechaHasta) ||
      fechaDesde > fechaHasta
    ) {
      return createDefaultDashboardUrlState();
    }

    return {
      periodo: "personalizado",
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    };
  } catch {
    return createDefaultDashboardUrlState();
  }
}

export function parseDashboardUrlState(
  input: URLSearchParams | string,
): DashboardUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  return normalizeDashboardUrlState({
    periodo: params.get("periodo"),
    fecha_desde: params.get("fecha_desde"),
    fecha_hasta: params.get("fecha_hasta"),
  });
}

export function serializeDashboardUrlState(
  state: DashboardUrlState,
): URLSearchParams {
  const normalized = normalizeDashboardUrlState(state);
  const params = new URLSearchParams();

  if (normalized.periodo === "todo") return params;

  params.set("periodo", normalized.periodo);
  if (normalized.periodo === "personalizado") {
    params.set("fecha_desde", normalized.fecha_desde);
    params.set("fecha_hasta", normalized.fecha_hasta);
  }

  return params;
}
