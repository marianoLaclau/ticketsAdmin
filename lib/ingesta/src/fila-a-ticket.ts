import { TZDateMini } from "@date-fns/tz";
import { aplicarHoraLocal, parseFecha, parseHoraLocal } from "./fecha-hora";
import { normalizeHeader } from "./headers";
import { clasificarMotivo } from "./motivos";
import { calcularFechaLimiteSla, SLA_TIME_ZONE } from "./sla";
import {
  ESTADOS_VALIDOS,
  PRIORIDADES_VALIDAS,
  type TicketImportado,
} from "./types";

export function parseBoolean(raw: string): boolean {
  return ["si", "sí", "true", "1", "yes", "x", "verdadero"].includes(
    raw.toLowerCase().trim(),
  );
}

/**
 * Convierte un registro plano (campo → valor string) en los valores del
 * ticket, aplicando defaults, validación de enums, derivación de hora y SLA.
 * Devuelve null si la fila no tiene conversation_id o si trae una fecha/hora
 * explícita con formato o valores inválidos.
 */
export function filaATicket(
  record: Record<string, string | undefined>,
): TicketImportado | null {
  const conversationId = (record.conversation_id ?? "").trim();
  if (!conversationId) return null;

  const estadoRaw = normalizeHeader(record.estado ?? "");
  const prioridadRaw = normalizeHeader(record.prioridad ?? "");
  const estado = (ESTADOS_VALIDOS as readonly string[]).includes(estadoRaw)
    ? (estadoRaw as TicketImportado["estado"])
    : "nuevo";
  const prioridad = (PRIORIDADES_VALIDAS as readonly string[]).includes(
    prioridadRaw,
  )
    ? (prioridadRaw as TicketImportado["prioridad"])
    : "media";

  const fechaRaw = (record.fecha ?? "").trim();
  let fechaCreacionImportada = parseFecha(fechaRaw);
  if (fechaRaw && !fechaCreacionImportada) return null;

  // Si hay una columna de hora separada, también forma parte del instante que
  // alimenta el SLA. Si no la hay, se deriva de la fecha/hora combinada.
  const horaRaw = (record.hora ?? "").trim();
  const horaSeparada = parseHoraLocal(horaRaw);
  if (horaRaw && !horaSeparada) return null;
  if (fechaCreacionImportada && horaSeparada) {
    fechaCreacionImportada = aplicarHoraLocal(
      fechaCreacionImportada,
      horaSeparada,
    );
  }

  let hora = horaSeparada
    ? `${String(horaSeparada.hours).padStart(2, "0")}:${String(
        horaSeparada.minutes,
      ).padStart(2, "0")}`
    : horaRaw;
  if (!hora && fechaCreacionImportada) {
    const fechaLocal = new TZDateMini(
      fechaCreacionImportada.getTime(),
      SLA_TIME_ZONE,
    );
    if (fechaLocal.getHours() !== 0 || fechaLocal.getMinutes() !== 0) {
      hora = `${String(fechaLocal.getHours()).padStart(2, "0")}:${String(
        fechaLocal.getMinutes(),
      ).padStart(2, "0")}`;
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
