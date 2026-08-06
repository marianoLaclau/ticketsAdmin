export const SESSION_REVOKED_EVENT = 'sesion_revocada';

export interface RealtimeEvent {
  tipo: string;
  ticket_id?: number | string;
  nombre?: string | null;
  apellido?: string | null;
  motivo?: string | null;
  cantidad?: number;
  cantidad_total?: number;
}

function optionalString(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Convierte el JSON no confiable del stream en el subconjunto que consume la
 * interfaz. Campos con tipos inesperados se descartan en vez de romper el
 * listener completo.
 */
export function parseRealtimeEvent(payload: string): RealtimeEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.tipo !== 'string' || !record.tipo.trim()) return null;

  const ticketId = record.ticket_id;
  const nombre = optionalString(record.nombre);
  const apellido = optionalString(record.apellido);
  const motivo = optionalString(record.motivo);
  const cantidad = optionalFiniteNumber(record.cantidad);
  const cantidadTotal = optionalFiniteNumber(record.cantidad_total);
  return {
    tipo: record.tipo,
    ...(typeof ticketId === 'number' || typeof ticketId === 'string'
      ? { ticket_id: ticketId }
      : {}),
    ...(nombre === undefined ? {} : { nombre }),
    ...(apellido === undefined ? {} : { apellido }),
    ...(motivo === undefined ? {} : { motivo }),
    ...(cantidad === undefined ? {} : { cantidad }),
    ...(cantidadTotal === undefined ? {} : { cantidad_total: cantidadTotal }),
  };
}

export function isSessionRevokedEvent(event: RealtimeEvent): boolean {
  return event.tipo === SESSION_REVOKED_EVENT;
}
