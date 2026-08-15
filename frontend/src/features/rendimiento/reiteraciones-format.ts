import type { RendimientoReiteracionContacto } from "@workspace/api-client-react";
import {
  formatRendimientoDateTime,
  rendimientoNumberFormatter,
} from "./rendimiento-format";

export const INITIAL_VISIBLE_TICKETS = 3;
export const INITIAL_VISIBLE_CONTACTS = 3;
export const percentageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

export function formatDateTime(value: string, timezone: string): string {
  return (
    formatRendimientoDateTime(value, timezone, "short") ?? "Fecha no disponible"
  );
}

export function formatAge(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) {
    return "No disponible";
  }
  if (hours < 1) return "Menos de 1 hora";

  const wholeHours = Math.floor(hours);
  const days = Math.floor(wholeHours / 24);
  const remainingHours = wholeHours % 24;
  if (days === 0) return `${rendimientoNumberFormatter.format(wholeHours)} h`;
  if (remainingHours === 0) {
    return `${rendimientoNumberFormatter.format(days)} ${days === 1 ? "día" : "días"}`;
  }
  return `${rendimientoNumberFormatter.format(days)} ${days === 1 ? "día" : "días"} ${remainingHours} h`;
}

export function matchTypeLabel(type: string): string {
  switch (type) {
    case "dni":
      return "DNI";
    case "telefono":
      return "Teléfono";
    case "email":
      return "Email";
    default:
      return "Identificador";
  }
}

// Firma estable basada únicamente en ids públicos de tickets. Conserva el
// estado expandido si el servidor reordena los grupos por riesgo, sin depender
// del grupo_id opaco ni de la posición del contacto.
export function buildRepetitionContactTicketSignature(
  contact: Pick<RendimientoReiteracionContacto, "tickets">,
): string {
  return [...contact.tickets]
    .map(({ id }) => id)
    .sort((left, right) => left - right)
    .join("-");
}
