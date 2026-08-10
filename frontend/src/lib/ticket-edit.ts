import type { Ticket } from "@workspace/api-client-react";
import type { TicketChanges } from "./ticket-version";

const FUNCTIONAL_TICKET_FIELD_LABELS = {
  nombre: "Nombre",
  apellido: "Apellido",
  telefono: "Teléfono",
  dni: "DNI / CUIT",
  empresa: "Empresa",
  email: "Email",
  motivo: "Motivo",
  resumen: "Resumen del llamado",
} as const;

const TICKET_AUDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  ...FUNCTIONAL_TICKET_FIELD_LABELS,
  hora: "Hora del llamado",
  notificado: "Notificación",
  audio_url: "Audio",
  notas: "Notas internas",
  fecha_limite: "Fecha límite",
  fecha_resolucion: "Fecha de resolución",
  progreso: "Progreso",
};

export interface TicketFunctionalForm {
  nombre: string;
  apellido: string;
  telefono: string;
  dni: string;
  empresa: string;
  email: string;
  motivo: string;
  resumen: string;
}

export interface TicketManagementForm {
  estado: Ticket["estado"];
  prioridad: Ticket["prioridad"];
  progreso: number;
  notas: string;
  fecha_limite: string;
}

export const TICKET_STATE_PROGRESS: Readonly<Record<Ticket["estado"], number>> =
  {
    nuevo: 0,
    en_proceso: 25,
    pendiente: 50,
    resuelto: 75,
    cerrado: 100,
  };

const cleanRequired = (value: string): string => value.trim();
const cleanOptional = (value: string | null | undefined): string | null =>
  value?.trim() || null;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidOptionalEmail(value: string): boolean {
  const normalized = value.trim();
  return normalized.length === 0 || EMAIL_PATTERN.test(normalized);
}

export function ticketToFunctionalForm(ticket: Ticket): TicketFunctionalForm {
  return {
    nombre: ticket.nombre ?? "",
    apellido: ticket.apellido ?? "",
    telefono: ticket.telefono ?? "",
    dni: ticket.dni ?? "",
    empresa: ticket.empresa ?? "",
    email: ticket.email ?? "",
    motivo: ticket.motivo ?? "",
    resumen: ticket.resumen ?? "",
  };
}

export function ticketToManagementForm(
  ticket: Ticket,
  fechaLimite = "",
): TicketManagementForm {
  return {
    estado: ticket.estado,
    prioridad: ticket.prioridad,
    progreso: ticket.progreso,
    notas: ticket.notas ?? "",
    fecha_limite: fechaLimite,
  };
}

export function applyTicketManagementState(
  form: TicketManagementForm,
  estado: Ticket["estado"],
  baseline: TicketManagementForm = form,
): TicketManagementForm {
  return {
    ...form,
    estado,
    progreso:
      estado === baseline.estado
        ? baseline.progreso
        : TICKET_STATE_PROGRESS[estado],
  };
}

/**
 * Compara exclusivamente contra el snapshot tomado al abrir el diálogo. Una
 * actualización SSE posterior no puede convertir campos intactos del form en
 * sobrescrituras accidentales. El conflicto sobre el mismo campo se resolverá
 * más adelante mediante versionado optimista en el backend.
 */
export function buildTicketManagementUpdate(
  baseline: TicketManagementForm,
  draft: TicketManagementForm,
): TicketChanges {
  const update: TicketChanges = {};

  if (draft.estado !== baseline.estado) {
    update.estado = draft.estado;
  }
  if (draft.progreso !== baseline.progreso) {
    update.progreso = draft.progreso;
  }

  if (draft.prioridad !== baseline.prioridad) {
    update.prioridad = draft.prioridad;
  }

  const nextNotes = cleanOptional(draft.notas);
  const currentNotes = cleanOptional(baseline.notas);
  if (nextNotes !== currentNotes) update.notas = nextNotes;

  return update;
}

/**
 * Genera un PATCH mínimo. Los opcionales vacíos se expresan como null para no
 * dejar espacios como datos aparentes y los campos no modificados se omiten.
 */
export function buildFunctionalTicketUpdateFromBaseline(
  baseline: TicketFunctionalForm,
  form: TicketFunctionalForm,
): TicketChanges {
  const update: TicketChanges = {};

  const requiredFields = ["nombre", "apellido", "motivo"] as const;
  for (const field of requiredFields) {
    const nextValue = cleanRequired(form[field]);
    const currentValue = cleanRequired(baseline[field]);
    if (nextValue !== currentValue) update[field] = nextValue;
  }

  const optionalFields = [
    "telefono",
    "dni",
    "empresa",
    "email",
    "resumen",
  ] as const;
  for (const field of optionalFields) {
    const nextValue = cleanOptional(form[field]);
    const currentValue = cleanOptional(baseline[field]);
    if (nextValue !== currentValue) update[field] = nextValue;
  }

  return update;
}

export function getFunctionalFieldLabel(field: string): string {
  return TICKET_AUDIT_FIELD_LABELS[field] ?? field;
}
