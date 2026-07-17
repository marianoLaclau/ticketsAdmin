/**
 * Lógica compartida de ingesta de llamadas desde CSV/planillas.
 *
 * La usan dos consumidores:
 *  - scripts/src/import-excel.ts (CLI, agrega soporte .xlsx vía exceljs)
 *  - backend /api/admin/import (importador web)
 *
 * Todo acá es puro (strings adentro, strings/objetos afuera) — sin
 * dependencias de base de datos ni de Node más allá de lo estándar.
 */

import { clasificarMotivo, type MotivoCategoria } from "./motivos";

export * from "./motivos";

// SLA: 48 hs desde la recepción del llamado para resolverlo
export const SLA_MS = 48 * 60 * 60 * 1000;

// Espejo de los enums del schema (lib/db/src/schema/tickets.ts).
// Se duplican acá a propósito para que esta lib no arrastre better-sqlite3.
export const ESTADOS_VALIDOS = ["nuevo", "en_proceso", "pendiente", "resuelto", "cerrado"] as const;
export const PRIORIDADES_VALIDAS = ["baja", "media", "alta", "urgente"] as const;

// --- Mapeo de encabezados ----------------------------------------------------
// Se normalizan los encabezados (minúsculas, sin acentos, espacios → _) y se
// buscan estos alias. Si el archivo real usa otros nombres, agregarlos acá.
export const HEADER_ALIASES: Record<string, string[]> = {
  conversation_id: ["conversation_id", "conversationid", "id_conversacion", "conversacion", "id"],
  hora: ["hora", "time", "hora_llamada"],
  fecha: ["fecha", "fecha_hora", "date", "fecha_creacion", "fecha_llamada", "dia"],
  nombre: ["nombre", "first_name", "name"],
  apellido: ["apellido", "last_name", "surname"],
  telefono: ["telefono", "phone", "celular", "tel"],
  dni: ["dni", "documento", "doc"],
  empresa: ["empresa", "company", "compania", "organizacion"],
  email: ["email", "mail", "correo", "e_mail"],
  motivo: ["motivo", "reason", "asunto", "tema"],
  resumen: ["resumen", "summary", "descripcion", "detalle"],
  notificado: ["notificado", "notified", "notificacion"],
  estado: ["estado", "status"],
  prioridad: ["prioridad", "priority"],
  asignado_a: ["asignado_a", "asignado", "assigned_to", "responsable"],
  audio_url: ["audio_url", "audio", "url_audio", "grabacion", "recording"],
  notas: ["notas", "notes", "observaciones"],
};

export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[\s\-./]+/g, "_");
}

export function parseBoolean(raw: string): boolean {
  return ["si", "sí", "true", "1", "yes", "x", "verdadero"].includes(raw.toLowerCase().trim());
}

export function parseFecha(s: string): Date | null {
  if (!s) return null;
  // dd/mm/yyyy con hora opcional en formatos "hh:mm", "- hh:mm", "- hh:mmhs"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2})\s*(?:hs)?)?/i);
  if (m) {
    const [, d, mo, y, h, mi] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(year, Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// --- CSV → grilla de strings -------------------------------------------------

/** Parser CSV con soporte de comillas (RFC 4180) y autodetección de ; o , */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.includes("�")) {
    // Marcador de decodificación fallida — el llamador debería reintentar latin1
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

// --- Detección de columnas ---------------------------------------------------

export interface ColumnasDetectadas {
  /** índice de columna (0-based) → campo del ticket */
  columnas: Map<number, string>;
  /** encabezados que no matchearon ningún alias */
  sinMapear: string[];
}

export function detectarColumnas(headers: string[]): ColumnasDetectadas {
  const columnas = new Map<number, string>();
  const sinMapear: string[] = [];
  headers.forEach((raw, idx) => {
    const normalized = normalizeHeader(raw ?? "");
    if (!normalized) return;
    const field = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0];
    if (field && ![...columnas.values()].includes(field)) {
      columnas.set(idx, field);
    } else {
      sinMapear.push(raw);
    }
  });
  return { columnas, sinMapear };
}

// --- Fila → valores del ticket -----------------------------------------------

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
  fecha_creacion?: Date;
}

/**
 * Convierte un registro plano (campo → valor string) en los valores del
 * ticket, aplicando defaults, validación de enums, derivación de hora y SLA.
 * Devuelve null si la fila no tiene conversation_id (inválida).
 */
export function filaATicket(record: Record<string, string | undefined>): TicketImportado | null {
  const conversationId = (record.conversation_id ?? "").trim();
  if (!conversationId) return null;

  const estadoRaw = normalizeHeader(record.estado ?? "");
  const prioridadRaw = normalizeHeader(record.prioridad ?? "");
  const estado = (ESTADOS_VALIDOS as readonly string[]).includes(estadoRaw)
    ? (estadoRaw as TicketImportado["estado"]) : "nuevo";
  const prioridad = (PRIORIDADES_VALIDAS as readonly string[]).includes(prioridadRaw)
    ? (prioridadRaw as TicketImportado["prioridad"]) : "media";

  const fechaCreacion = parseFecha(record.fecha ?? "");

  // Si no hay columna de hora pero la fecha trae hora, derivarla de ahí
  let hora = (record.hora ?? "").trim();
  if (!hora && fechaCreacion && (fechaCreacion.getHours() !== 0 || fechaCreacion.getMinutes() !== 0)) {
    hora = `${String(fechaCreacion.getHours()).padStart(2, "0")}:${String(fechaCreacion.getMinutes()).padStart(2, "0")}`;
  }

  const limpio = (v: string | undefined) => (v ?? "").trim() || null;
  const motivo = (record.motivo ?? "").trim() || "Sin especificar";
  const resumen = limpio(record.resumen);

  return {
    conversation_id: conversationId,
    hora: hora || "00:00",
    nombre: (record.nombre ?? "").trim() || "Sin nombre",
    apellido: (record.apellido ?? "").trim() || "",
    telefono: limpio(record.telefono),
    dni: limpio(record.dni),
    empresa: limpio(record.empresa),
    email: limpio(record.email),
    motivo,
    motivo_categoria: clasificarMotivo(motivo, resumen),
    resumen,
    notificado: parseBoolean(record.notificado ?? ""),
    estado,
    prioridad,
    asignado_a: limpio(record.asignado_a),
    audio_url: limpio(record.audio_url),
    notas: limpio(record.notas),
    fecha_limite: new Date((fechaCreacion?.getTime() ?? Date.now()) + SLA_MS),
    ...(fechaCreacion ? { fecha_creacion: fechaCreacion } : {}),
  };
}
