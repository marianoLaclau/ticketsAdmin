import type {
  Ticket,
  TicketInput,
} from '@workspace/api-client-react';
import type { TicketChanges } from './ticket-version';

export interface AdminTicketForm {
  conversation_id: string;
  hora: string;
  nombre: string;
  apellido: string;
  telefono: string;
  dni: string;
  empresa: string;
  email: string;
  motivo: string;
  resumen: string;
  notas: string;
  audio_url: string;
  estado: Ticket['estado'];
  prioridad: Ticket['prioridad'];
}

export type AdminTicketTextField = Exclude<
  keyof AdminTicketForm,
  'estado' | 'prioridad'
>;

const cleanRequired = (value: string): string => value.trim();
const cleanNullable = (value: string): string | null => value.trim() || null;
const cleanOptional = (value: string): string | undefined =>
  value.trim() || undefined;

export function createEmptyAdminTicketForm(
  now = new Date(),
): AdminTicketForm {
  return {
    conversation_id: `manual_${now.getTime()}`,
    hora: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    nombre: '',
    apellido: '',
    telefono: '',
    dni: '',
    empresa: '',
    email: '',
    motivo: '',
    resumen: '',
    notas: '',
    audio_url: '',
    estado: 'nuevo',
    prioridad: 'media',
  };
}

export function ticketToAdminTicketForm(ticket: Ticket): AdminTicketForm {
  return {
    conversation_id: ticket.conversation_id,
    hora: ticket.hora,
    nombre: ticket.nombre,
    apellido: ticket.apellido,
    telefono: ticket.telefono ?? '',
    dni: ticket.dni ?? '',
    empresa: ticket.empresa ?? '',
    email: ticket.email ?? '',
    motivo: ticket.motivo,
    resumen: ticket.resumen ?? '',
    notas: ticket.notas ?? '',
    audio_url: ticket.audio_url ?? '',
    estado: ticket.estado,
    prioridad: ticket.prioridad,
  };
}

export function buildAdminTicketInput(form: AdminTicketForm): TicketInput {
  return {
    conversation_id: cleanRequired(form.conversation_id),
    hora: cleanRequired(form.hora),
    nombre: cleanRequired(form.nombre),
    apellido: cleanRequired(form.apellido),
    telefono: cleanOptional(form.telefono),
    dni: cleanOptional(form.dni),
    empresa: cleanOptional(form.empresa),
    email: cleanOptional(form.email),
    motivo: cleanRequired(form.motivo),
    resumen: cleanOptional(form.resumen),
    notas: cleanOptional(form.notas),
    audio_url: cleanOptional(form.audio_url),
    estado: form.estado,
    prioridad: form.prioridad,
  };
}

/** Construye el PATCH contra el snapshot tomado al abrir la fila. */
export function buildAdminTicketUpdate(
  baseline: AdminTicketForm,
  form: AdminTicketForm,
): TicketChanges {
  const update: TicketChanges = {};

  const requiredFields = ['hora', 'nombre', 'apellido', 'motivo'] as const;
  for (const field of requiredFields) {
    const nextValue = cleanRequired(form[field]);
    const currentValue = cleanRequired(baseline[field]);
    if (nextValue !== currentValue) update[field] = nextValue;
  }

  const nullableFields = [
    'telefono',
    'dni',
    'empresa',
    'email',
    'resumen',
    'notas',
    'audio_url',
  ] as const;
  for (const field of nullableFields) {
    const nextValue = cleanNullable(form[field]);
    const currentValue = cleanNullable(baseline[field]);
    const clearedLegacyWhitespace =
      nextValue === null && form[field] !== baseline[field];
    if (nextValue !== currentValue || clearedLegacyWhitespace) {
      update[field] = nextValue;
    }
  }

  if (form.estado !== baseline.estado) update.estado = form.estado;
  if (form.prioridad !== baseline.prioridad) {
    update.prioridad = form.prioridad;
  }

  return update;
}
