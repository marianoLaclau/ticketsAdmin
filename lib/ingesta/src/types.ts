import type { MotivoCategoria } from "./motivos";

// Espejo de los enums del schema (lib/db/src/schema/tickets.ts).
// Se duplican acá a propósito para que esta lib no arrastre better-sqlite3.
export const ESTADOS_VALIDOS = [
  "nuevo",
  "en_proceso",
  "pendiente",
  "resuelto",
  "cerrado",
] as const;
export const PRIORIDADES_VALIDAS = [
  "baja",
  "media",
  "alta",
  "urgente",
] as const;

export interface TicketImportado {
  conversation_id: string;
  hora: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  dni: string | null;
  empresa: string | null;
  email: string | null;
  motivo: string;
  motivo_categoria: MotivoCategoria;
  resumen: string | null;
  notificado: boolean;
  estado: (typeof ESTADOS_VALIDOS)[number];
  prioridad: (typeof PRIORIDADES_VALIDAS)[number];
  asignado_a: string | null;
  audio_url: string | null;
  notas: string | null;
  fecha_limite: Date;
  fecha_creacion: Date;
}
