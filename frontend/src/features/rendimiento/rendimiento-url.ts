import {
  MOTIVO_CATEGORIA_CODIGOS,
  PRIORIDADES_VALIDAS,
  type MotivoCategoria,
} from "@workspace/ingesta";
import { isValidCalendarDate } from "@/lib/calendar-date";

export const RENDIMIENTO_PERIODOS = [
  "todo",
  "mes",
  "semana",
  "ultimos_30",
  "ultimos_90",
  "personalizado",
] as const;

export const RENDIMIENTO_VISTAS = [
  "equipo",
  "personas",
  "reiteraciones",
  "calidad",
] as const;

export type RendimientoPeriodo = (typeof RENDIMIENTO_PERIODOS)[number];
export type RendimientoVista = (typeof RENDIMIENTO_VISTAS)[number];
export type RendimientoCategoria = MotivoCategoria;
export type RendimientoPrioridad = (typeof PRIORIDADES_VALIDAS)[number];

export const RENDIMIENTO_PERIODO_LABELS: Readonly<
  Record<RendimientoPeriodo, string>
> = {
  todo: "Todo el historial",
  mes: "Mes actual",
  semana: "Semana actual",
  ultimos_30: "Últimos 30 días",
  ultimos_90: "Últimos 90 días",
  personalizado: "Período personalizado",
};

type RendimientoPeriodoPredefinido = Exclude<
  RendimientoPeriodo,
  "personalizado"
>;

interface RendimientoFiltrosOpcionales {
  empresa?: string;
  categoria?: RendimientoCategoria;
  prioridad?: RendimientoPrioridad;
}

export type RendimientoFilterState = RendimientoFiltrosOpcionales &
  (
    | {
        periodo: RendimientoPeriodoPredefinido;
      }
    | {
        periodo: "personalizado";
        desde: string;
        hasta: string;
      }
  );

export type RendimientoUrlState = RendimientoFilterState & {
  vista: RendimientoVista;
};

const PERIODOS = new Set<string>(RENDIMIENTO_PERIODOS);
const VISTAS = new Set<string>(RENDIMIENTO_VISTAS);
const CATEGORIAS = new Set<string>(MOTIVO_CATEGORIA_CODIGOS);
const PRIORIDADES = new Set<string>(PRIORIDADES_VALIDAS);

export function createDefaultRendimientoUrlState(): RendimientoUrlState {
  return { periodo: "mes", vista: "equipo" };
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeAllowedValue<T extends string>(
  value: unknown,
  allowedValues: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && allowedValues.has(value)
    ? (value as T)
    : undefined;
}

function readOwn(
  candidate: Record<string, unknown>,
  property: string,
): unknown {
  return Object.hasOwn(candidate, property) ? candidate[property] : undefined;
}

function normalizeRendimientoUrlState(state: unknown): RendimientoUrlState {
  try {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return createDefaultRendimientoUrlState();
    }

    const candidate = state as Record<string, unknown>;
    const periodoValue = readOwn(candidate, "periodo");
    const desdeValue = readOwn(candidate, "desde");
    const hastaValue = readOwn(candidate, "hasta");
    const empresaValue = readOwn(candidate, "empresa");
    const categoriaValue = readOwn(candidate, "categoria");
    const prioridadValue = readOwn(candidate, "prioridad");
    const vistaValue = readOwn(candidate, "vista");

    const empresa = normalizeOptionalText(empresaValue);
    const categoria = normalizeAllowedValue<RendimientoCategoria>(
      categoriaValue,
      CATEGORIAS,
    );
    const prioridad = normalizeAllowedValue<RendimientoPrioridad>(
      prioridadValue,
      PRIORIDADES,
    );
    const filters: RendimientoFiltrosOpcionales = {
      ...(empresa ? { empresa } : {}),
      ...(categoria ? { categoria } : {}),
      ...(prioridad ? { prioridad } : {}),
    };
    const vista =
      normalizeAllowedValue<RendimientoVista>(vistaValue, VISTAS) ?? "equipo";

    const periodo = normalizeAllowedValue<RendimientoPeriodo>(
      periodoValue,
      PERIODOS,
    );
    if (periodo === "personalizado") {
      if (
        typeof desdeValue === "string" &&
        typeof hastaValue === "string" &&
        isValidCalendarDate(desdeValue) &&
        isValidCalendarDate(hastaValue) &&
        desdeValue <= hastaValue
      ) {
        return {
          periodo,
          desde: desdeValue,
          hasta: hastaValue,
          ...filters,
          vista,
        };
      }

      return { periodo: "mes", ...filters, vista };
    }

    return {
      periodo: periodo ?? "mes",
      ...filters,
      vista,
    };
  } catch {
    return createDefaultRendimientoUrlState();
  }
}

export function parseRendimientoUrlState(
  input: URLSearchParams | string,
): RendimientoUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;

  return normalizeRendimientoUrlState({
    periodo: params.get("periodo"),
    desde: params.get("desde"),
    hasta: params.get("hasta"),
    empresa: params.get("empresa"),
    categoria: params.get("categoria"),
    prioridad: params.get("prioridad"),
    vista: params.get("vista"),
  });
}

export function serializeRendimientoUrlState(
  state: RendimientoUrlState,
): URLSearchParams {
  const normalized = normalizeRendimientoUrlState(state);
  const params = new URLSearchParams();

  if (normalized.periodo !== "mes") {
    params.set("periodo", normalized.periodo);
  }
  if (normalized.periodo === "personalizado") {
    params.set("desde", normalized.desde);
    params.set("hasta", normalized.hasta);
  }
  if (normalized.empresa) params.set("empresa", normalized.empresa);
  if (normalized.categoria) params.set("categoria", normalized.categoria);
  if (normalized.prioridad) params.set("prioridad", normalized.prioridad);
  if (normalized.vista !== "equipo") params.set("vista", normalized.vista);

  return params;
}
