import type { Ticket, TicketUpdate } from '@workspace/api-client-react';

export const FUNCTIONAL_TICKET_FIELD_LABELS = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  telefono: 'Teléfono',
  dni: 'DNI / CUIT',
  empresa: 'Empresa',
  email: 'Email',
  motivo: 'Motivo',
  resumen: 'Resumen del llamado',
} as const;

export type FunctionalTicketField = keyof typeof FUNCTIONAL_TICKET_FIELD_LABELS;

export const TICKET_AUDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  ...FUNCTIONAL_TICKET_FIELD_LABELS,
  hora: 'Hora del llamado',
  notificado: 'Notificación',
  audio_url: 'Audio',
  notas: 'Notas internas',
  fecha_limite: 'Fecha límite',
  fecha_resolucion: 'Fecha de resolución',
  progreso: 'Progreso',
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
    nombre: ticket.nombre ?? '',
    apellido: ticket.apellido ?? '',
    telefono: ticket.telefono ?? '',
    dni: ticket.dni ?? '',
    empresa: ticket.empresa ?? '',
    email: ticket.email ?? '',
    motivo: ticket.motivo ?? '',
    resumen: ticket.resumen ?? '',
  };
}

/**
 * Genera un PATCH mínimo. Los opcionales vacíos se expresan como null para no
 * dejar espacios como datos aparentes y los campos no modificados se omiten.
 */
export function buildFunctionalTicketUpdate(
  ticket: Ticket,
  form: TicketFunctionalForm,
): TicketUpdate {
  const update: TicketUpdate = {};

  const requiredFields = ['nombre', 'apellido', 'motivo'] as const;
  for (const field of requiredFields) {
    const nextValue = cleanRequired(form[field]);
    const currentValue = cleanRequired(ticket[field] ?? '');
    if (nextValue !== currentValue) update[field] = nextValue;
  }

  const optionalFields = ['telefono', 'dni', 'empresa', 'email', 'resumen'] as const;
  for (const field of optionalFields) {
    const nextValue = cleanOptional(form[field]);
    const currentValue = cleanOptional(ticket[field]);
    if (nextValue !== currentValue) update[field] = nextValue;
  }

  return update;
}

export function getFunctionalFieldLabel(field: string): string {
  return TICKET_AUDIT_FIELD_LABELS[field] ?? field;
}
