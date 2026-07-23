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

import { TZDateMini } from "@date-fns/tz";
import { clasificarMotivo, type MotivoCategoria } from "./motivos";
import { calcularFechaLimiteSla, SLA_TIME_ZONE } from "./sla";

export * from "./motivos";
export * from "./sla";
export * from "./serin";

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

interface PartesFechaLocal {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function fechaLocalEnBuenosAires(partes: PartesFechaLocal): Date | null {
  const {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
  } = partes;

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59 ||
    milliseconds < 0 || milliseconds > 999
  ) {
    return null;
  }

  const local = new TZDateMini(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
    SLA_TIME_ZONE,
  );

  // TZDate, igual que Date, normaliza 31/02 a marzo. Comparar las partes evita
  // importar silenciosamente una fecha de calendario imposible.
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hours ||
    local.getMinutes() !== minutes ||
    local.getSeconds() !== seconds ||
    local.getMilliseconds() !== milliseconds
  ) {
    return null;
  }

  return new Date(local.getTime());
}

interface HoraLocal {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function parseHoraLocal(raw: string): HoraLocal | null {
  const valor = raw.trim();
  if (!valor) return null;

  // Acepta HH:mm, HH:mm:ss(.SSS) y la representación ISO local que produce
  // fechaExcelAStringLocal para una celda de hora de Excel.
  const match = valor.match(
    /^(?:\d{4}-\d{2}-\d{2}[T\s])?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(?:hs?)?$/i,
  );
  if (!match) return null;

  const [, h, mi, s = "0", ms = "0"] = match;
  const parsed = {
    hours: Number(h),
    minutes: Number(mi),
    seconds: Number(s),
    milliseconds: Number(ms.padEnd(3, "0")),
  };

  return parsed.hours <= 23 && parsed.minutes <= 59 && parsed.seconds <= 59
    ? parsed
    : null;
}

export function parseFecha(s: string): Date | null {
  const valor = s.trim();
  if (!valor) return null;

  // dd/mm/yyyy con hora opcional en formatos "hh:mm", "- hh:mm", "- hh:mmhs"
  const dmy = valor.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(?:hs?)?)?$/i,
  );
  if (dmy) {
    const [, d, mo, y, h = "0", mi = "0", seconds = "0", ms = "0"] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return fechaLocalEnBuenosAires({
      year,
      month: Number(mo),
      day: Number(d),
      hours: Number(h),
      minutes: Number(mi),
      seconds: Number(seconds),
      milliseconds: Number(ms.padEnd(3, "0")),
    });
  }

  // ISO sin zona representa la fecha/hora de negocio, no la zona del proceso.
  const isoLocal = valor.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (isoLocal) {
    const [, y, mo, d, h = "0", mi = "0", seconds = "0", ms = "0"] = isoLocal;
    return fechaLocalEnBuenosAires({
      year: Number(y),
      month: Number(mo),
      day: Number(d),
      hours: Number(h),
      minutes: Number(mi),
      seconds: Number(seconds),
      milliseconds: Number(ms.padEnd(3, "0")),
    });
  }

  // Un ISO con Z u offset sí expresa un instante absoluto y se conserva.
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(valor)) {
    return null;
  }
  const parsed = new Date(valor);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Excel no guarda zona horaria. ExcelJS representa sus componentes de pared
 * dentro de un Date usando UTC; quitar la Z permite reinterpretarlos luego en
 * la zona de negocio sin desplazar la celda al día anterior.
 */
export function fechaExcelAStringLocal(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toISOString().slice(0, -1);
}

function aplicarHoraLocal(fecha: Date, hora: HoraLocal): Date | null {
  const local = new TZDateMini(fecha.getTime(), SLA_TIME_ZONE);
  return fechaLocalEnBuenosAires({
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    ...hora,
  });
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
  fecha_creacion: Date;
}

/**
 * Convierte un registro plano (campo → valor string) en los valores del
 * ticket, aplicando defaults, validación de enums, derivación de hora y SLA.
 * Devuelve null si la fila no tiene conversation_id o si trae una fecha/hora
 * explícita con formato o valores inválidos.
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

  const fechaRaw = (record.fecha ?? "").trim();
  let fechaCreacionImportada = parseFecha(fechaRaw);
  if (fechaRaw && !fechaCreacionImportada) return null;

  // Si hay una columna de hora separada, también forma parte del instante que
  // alimenta el SLA. Si no la hay, se deriva de la fecha/hora combinada.
  const horaRaw = (record.hora ?? "").trim();
  const horaSeparada = parseHoraLocal(horaRaw);
  if (horaRaw && !horaSeparada) return null;
  if (fechaCreacionImportada && horaSeparada) {
    fechaCreacionImportada = aplicarHoraLocal(fechaCreacionImportada, horaSeparada);
  }

  let hora = horaSeparada
    ? `${String(horaSeparada.hours).padStart(2, "0")}:${String(horaSeparada.minutes).padStart(2, "0")}`
    : horaRaw;
  if (!hora && fechaCreacionImportada) {
    const fechaLocal = new TZDateMini(
      fechaCreacionImportada.getTime(),
      SLA_TIME_ZONE,
    );
    if (fechaLocal.getHours() !== 0 || fechaLocal.getMinutes() !== 0) {
      hora = `${String(fechaLocal.getHours()).padStart(2, "0")}:${String(fechaLocal.getMinutes()).padStart(2, "0")}`;
    }
  }

  const limpio = (v: string | undefined) => (v ?? "").trim() || null;
  const motivo = (record.motivo ?? "").trim() || "Sin especificar";
  const resumen = limpio(record.resumen);
  const fechaCreacion = fechaCreacionImportada ?? new Date();

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
    fecha_limite: calcularFechaLimiteSla(fechaCreacion),
    fecha_creacion: fechaCreacion,
  };
}
