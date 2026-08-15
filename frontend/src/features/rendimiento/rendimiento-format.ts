export interface RendimientoPeriodoPresentable {
  fecha_desde: string | null;
  fecha_hasta: string | null;
}

type RendimientoDateStyle = "short" | "medium";

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
