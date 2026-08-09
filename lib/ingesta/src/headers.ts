// Se normalizan los encabezados (minúsculas, sin acentos, espacios → _) y se
// buscan estos alias. Si el archivo real usa otros nombres, agregarlos acá.
export const HEADER_ALIASES: Record<string, string[]> = {
  conversation_id: [
    "conversation_id",
    "conversationid",
    "id_conversacion",
    "conversacion",
    "id",
  ],
  hora: ["hora", "time", "hora_llamada"],
  fecha: [
    "fecha",
    "fecha_hora",
    "date",
    "fecha_creacion",
    "fecha_llamada",
    "dia",
  ],
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
    const field = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized),
    )?.[0];
    if (field && ![...columnas.values()].includes(field)) {
      columnas.set(idx, field);
    } else {
      sinMapear.push(raw);
    }
  });
  return { columnas, sinMapear };
}
