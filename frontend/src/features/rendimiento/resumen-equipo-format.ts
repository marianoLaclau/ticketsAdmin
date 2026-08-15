import {
  formatRendimientoDateTime,
  formatRendimientoHours,
  rendimientoNumberFormatter,
} from "./rendimiento-format";

export const decimalFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

export function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function normalizePercentage(value: number | null): number | null {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.min(100, Math.max(0, value));
}

export function formatGeneratedAt(value: string, timezone: string): string {
  return formatRendimientoDateTime(value, timezone) ?? "hora no disponible";
}

export function formatHours(value: number | null): string {
  return formatRendimientoHours(value, "No disponible");
}

export function formatBusinessHours(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "Sin muestra";
  }
  if (value < 1) return `${Math.round(value * 60)} min hábiles`;

  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  if (minutes === 60) return `${wholeHours + 1} h hábiles`;
  return minutes > 0
    ? `${rendimientoNumberFormatter.format(wholeHours)} h ${minutes} min hábiles`
    : `${rendimientoNumberFormatter.format(wholeHours)} h hábiles`;
}

export function formatPercentage(value: number | null): string {
  const percentage = normalizePercentage(value);
  return percentage === null
    ? "Sin muestra"
    : `${decimalFormatter.format(percentage)}%`;
}
