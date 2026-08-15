import {
  formatRendimientoDateTime,
  formatRendimientoHours,
  rendimientoNumberFormatter,
} from "./rendimiento-format";

export const percentageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

export function formatDateTime(value: string, timezone: string): string {
  return formatRendimientoDateTime(value, timezone) ?? "fecha no disponible";
}

export function formatHours(value: number | null): string {
  return formatRendimientoHours(value, "Sin muestra");
}

export function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
  return initials || "U";
}

export function pluralize(count: number, singular: string, plural: string): string {
  return (
    rendimientoNumberFormatter.format(count) + " " + (count === 1 ? singular : plural)
  );
}
