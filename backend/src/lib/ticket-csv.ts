import { MOTIVO_CATEGORIA_LABELS, SLA_TIME_ZONE } from "@workspace/ingesta";

export const TICKET_CSV_DELIMITER = ";";
export const TICKET_CSV_BOM = "\uFEFF";
export const TICKET_CSV_LINE_ENDING = "\r\n";

export interface TicketCsvRecord {
  id: number;
  conversation_id: string;
  hora: string;
  nombre: string;
  apellido: string;
  telefono?: string | null;
  dni?: string | null;
  empresa?: string | null;
  estado_empleado?: string | null;
  email?: string | null;
  motivo: string;
  motivo_categoria: string;
  resumen?: string | null;
  notificado: boolean;
  estado: string;
  prioridad: string;
  asignado_a?: string | null;
  audio_url?: string | null;
  notas?: string | null;
  progreso: number;
  fecha_creacion: Date | string | number;
  fecha_limite?: Date | string | number | null;
  fecha_resolucion?: Date | string | number | null;
}

export interface TicketCsvOptions {
  includeBom?: boolean;
  timeZone?: string;
}

export const TICKET_CSV_HEADERS = [
  "ID",
  "Conversation ID",
  "Fecha de creación",
  "Hora",
  "Nombre",
  "Apellido",
  "Teléfono",
  "DNI / CUIT",
  "Empresa",
  "Estado laboral",
  "Email",
  "Categoría",
  "Motivo",
  "Resumen",
  "Notificado",
  "Estado",
  "Prioridad",
  "Asignado",
  "Progreso (%)",
  "Fecha límite",
  "Fecha de resolución",
  "URL del audio",
  "Notas",
] as const;

const ESTADO_LABELS: Readonly<Record<string, string>> = {
  nuevo: "Nuevo",
  en_proceso: "En proceso",
  pendiente: "Pendiente (fue contactado)",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

const PRIORIDAD_LABELS: Readonly<Record<string, string>> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;

function asValidDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(
  value: Date | string | number,
  timeZone: string,
): Record<string, string> | null {
  const date = asValidDate(value);
  if (!date) return null;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, part]),
  );
}

export function formatTicketCsvDateTime(
  value: Date | string | number | null | undefined,
  timeZone = SLA_TIME_ZONE,
): string {
  if (value == null) return "";
  const parts = dateParts(value, timeZone);
  if (!parts) return "";
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Todas las celdas se entrecomillan. Ademas, los textos cuyo primer caracter
 * significativo puede iniciar una formula reciben un apostrofo protector.
 * Los numeros producidos por el sistema conservan su tipo visual en Excel.
 */
export function escapeTicketCsvCell(value: unknown): string {
  if (value == null) return '""';

  let text = String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function categoriaLabel(categoria: string): string {
  return (
    (MOTIVO_CATEGORIA_LABELS as Readonly<Record<string, string>>)[categoria] ??
    categoria
  );
}

export function ticketToCsvRow(
  ticket: TicketCsvRecord,
  timeZone = SLA_TIME_ZONE,
): unknown[] {
  return [
    ticket.id,
    ticket.conversation_id,
    formatTicketCsvDateTime(ticket.fecha_creacion, timeZone),
    ticket.hora,
    ticket.nombre,
    ticket.apellido,
    ticket.telefono,
    ticket.dni,
    ticket.empresa,
    ticket.estado_empleado,
    ticket.email,
    categoriaLabel(ticket.motivo_categoria),
    ticket.motivo,
    ticket.resumen,
    ticket.notificado ? "Sí" : "No",
    ESTADO_LABELS[ticket.estado] ?? ticket.estado,
    PRIORIDAD_LABELS[ticket.prioridad] ?? ticket.prioridad,
    ticket.asignado_a,
    ticket.progreso,
    formatTicketCsvDateTime(ticket.fecha_limite, timeZone),
    formatTicketCsvDateTime(ticket.fecha_resolucion, timeZone),
    ticket.audio_url,
    ticket.notas,
  ];
}

export function serializeTicketsCsv(
  tickets: readonly TicketCsvRecord[],
  options: TicketCsvOptions = {},
): string {
  const timeZone = options.timeZone ?? SLA_TIME_ZONE;
  const rows = [
    [...TICKET_CSV_HEADERS],
    ...tickets.map((ticket) => ticketToCsvRow(ticket, timeZone)),
  ];
  const csv = rows
    .map((row) => row.map(escapeTicketCsvCell).join(TICKET_CSV_DELIMITER))
    .join(TICKET_CSV_LINE_ENDING);

  return options.includeBom === false ? csv : `${TICKET_CSV_BOM}${csv}`;
}

export function createTicketCsvFilename(
  now: Date = new Date(),
  timeZone = SLA_TIME_ZONE,
): string {
  const parts = dateParts(now, timeZone);
  if (!parts) return "tickets.csv";
  return `tickets-${parts.year}-${parts.month}-${parts.day}.csv`;
}
