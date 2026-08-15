export interface RendimientoPeriodoPresentable {
  fecha_desde: string | null;
  fecha_hasta: string | null;
}

type RendimientoDateStyle = "short" | "medium";

/** Único separador de miles del módulo; los paneles lo reusan. */
export const rendimientoNumberFormatter = new Intl.NumberFormat("es-AR");

/**
 * Duración legible a partir de horas decimales. Cada panel trae su propio
 * texto para "no hay dato", porque en unos significa que falta la métrica y en
 * otros que la muestra es insuficiente.
 */
export function formatRendimientoHours(
  value: number | null,
  fallback: string,
): string {
  if (value === null || !Number.isFinite(value) || value < 0) return fallback;
  if (value < 1) return `${Math.round(value * 60)} min`;

  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  if (minutes === 60) {
    return `${rendimientoNumberFormatter.format(wholeHours + 1)} h`;
  }
  return minutes > 0
    ? `${rendimientoNumberFormatter.format(wholeHours)} h ${minutes} min`
    : `${rendimientoNumberFormatter.format(wholeHours)} h`;
}

export function formatRendimientoCalendarDate(
  value: string | null,
): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatRendimientoPeriod(
  period: RendimientoPeriodoPresentable,
): string {
  const from = formatRendimientoCalendarDate(period.fecha_desde);
  const to = formatRendimientoCalendarDate(period.fecha_hasta);
  if (from && to) return `${from} al ${to}`;
  if (from) return `Desde ${from}`;
  if (to) return `Hasta ${to}`;
  return "Período completo";
}

export function formatRendimientoDateTime(
  value: string,
  timezone: string,
  dateStyle: RendimientoDateStyle = "medium",
): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const options: Intl.DateTimeFormatOptions = {
    dateStyle,
    timeStyle: "short",
  };
  try {
    return new Intl.DateTimeFormat("es-AR", {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("es-AR", options).format(date);
  }
}
