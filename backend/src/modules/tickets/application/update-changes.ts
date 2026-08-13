import { ticketsTable, type Ticket } from "@workspace/db/schema";
import { clasificarMotivo } from "@workspace/ingesta";
import type { ParsedTicketUpdateBody } from "./update-validation";

export type TicketUpdates = Partial<typeof ticketsTable.$inferInsert>;

export interface BuildTicketUpdateChangesInput {
  current: Ticket;
  body: ParsedTicketUpdateBody;
  assigneeUserId: number;
  assigneeDisplayName: string;
  now: Date;
}

export interface TicketUpdateChanges {
  updates: TicketUpdates;
  changedFields: string[];
}

function normalizeRequiredText(value: string): string {
  return value.trim();
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) return null;
  return value.trim() || null;
}

function sameStoredValue(current: unknown, next: unknown): boolean {
  if (current instanceof Date && next instanceof Date) {
    return current.getTime() === next.getTime();
  }
  return current === next;
}

export function buildTicketUpdateChanges({
  current,
  body,
  assigneeUserId,
  assigneeDisplayName,
  now,
}: BuildTicketUpdateChangesInput): TicketUpdateChanges {
  const requested: TicketUpdates = {};
  if (body.hora !== undefined) {
    requested.hora = normalizeRequiredText(body.hora);
  }
  if (body.nombre !== undefined) {
    requested.nombre = normalizeRequiredText(body.nombre);
  }
  if (body.apellido !== undefined) {
    requested.apellido = normalizeRequiredText(body.apellido);
  }
  if (body.telefono !== undefined) {
    requested.telefono = normalizeNullableText(body.telefono);
  }
  if (body.dni !== undefined) {
    requested.dni = normalizeNullableText(body.dni);
  }
  if (body.empresa !== undefined) {
    requested.empresa = normalizeNullableText(body.empresa);
  }
  if (body.email !== undefined) {
    requested.email = normalizeNullableText(body.email);
  }
  if (body.motivo !== undefined) {
    requested.motivo = normalizeRequiredText(body.motivo);
  }
  if (body.resumen !== undefined) {
    requested.resumen = normalizeNullableText(body.resumen);
  }
  if (body.notificado !== undefined) requested.notificado = body.notificado;
  if (body.estado !== undefined) requested.estado = body.estado;
  if (body.prioridad !== undefined) requested.prioridad = body.prioridad;
  if (body.audio_url !== undefined) {
    requested.audio_url = normalizeNullableText(body.audio_url);
  }
  if (body.notas !== undefined) {
    requested.notas = normalizeNullableText(body.notas);
  }
  if (body.progreso !== undefined) requested.progreso = body.progreso;
  if (body.fecha_limite !== undefined) {
    requested.fecha_limite = new Date(body.fecha_limite.getTime());
  }
  if (body.fecha_resolucion !== undefined) {
    requested.fecha_resolucion = new Date(body.fecha_resolucion.getTime());
  }

  // El estado laboral proviene de la consulta a Serin para un DNI y una
  // empresa concretos. Si una persona corrige cualquiera de esos datos,
  // el valor anterior deja de ser confiable y debe volver a obtenerse.
  const cambiaIdentidadSerin =
    (body.dni !== undefined && !sameStoredValue(current.dni, requested.dni)) ||
    (body.empresa !== undefined &&
      !sameStoredValue(current.empresa, requested.empresa));
  if (cambiaIdentidadSerin) {
    requested.estado_empleado = null;
  }

  if (body.motivo !== undefined || body.resumen !== undefined) {
    requested.motivo_categoria = clasificarMotivo(
      requested.motivo ?? current.motivo,
      body.resumen !== undefined ? requested.resumen : current.resumen,
    );
  }

  // Una transición real toma o reasigna el ticket al usuario autenticado.
  if (body.estado !== undefined && body.estado !== current.estado) {
    requested.asignado_usuario_id = assigneeUserId;
    requested.asignado_a = assigneeDisplayName;
  }

  if (
    body.estado !== undefined &&
    body.estado !== current.estado &&
    body.fecha_resolucion === undefined
  ) {
    const estadoAnteriorFinalizado =
      current.estado === "resuelto" || current.estado === "cerrado";
    const estadoNuevoFinalizado =
      body.estado === "resuelto" || body.estado === "cerrado";

    if (estadoNuevoFinalizado && !estadoAnteriorFinalizado) {
      // Cada resolución real debe reflejar su propio instante, incluso si
      // una fila histórica conservaba una fecha de una resolución previa.
      requested.fecha_resolucion = now;
    } else if (!estadoNuevoFinalizado && estadoAnteriorFinalizado) {
      // Al reabrir el caso deja de estar resuelto; la próxima resolución
      // establecerá una fecha nueva.
      requested.fecha_resolucion = null;
    }
  }

  const updates: TicketUpdates = {};
  const changedFields: string[] = [];
  const currentRecord = current as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(requested)) {
    if (sameStoredValue(currentRecord[field], value)) continue;
    (updates as Record<string, unknown>)[field] = value;
    changedFields.push(field);
  }

  return { updates, changedFields };
}
