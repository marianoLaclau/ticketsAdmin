interface TicketAuditActor {
  nombre: string;
  apellido: string | null;
  email: string;
}

interface TicketAuditSnapshot {
  estado: string;
  prioridad: string;
  asignado_usuario_id: number | null;
  asignado_a: string | null;
}

const AUDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  hora: "hora",
  nombre: "nombre",
  apellido: "apellido",
  telefono: "teléfono",
  dni: "DNI / CUIT",
  empresa: "empresa",
  estado_empleado: "estado laboral",
  email: "email",
  motivo: "motivo",
  motivo_categoria: "categoría",
  resumen: "resumen",
  notificado: "notificación",
  audio_url: "audio",
  notas: "notas internas",
  fecha_limite: "fecha límite",
  fecha_resolucion: "fecha de resolución",
  progreso: "progreso",
};

const STRUCTURED_AUDIT_FIELDS = new Set([
  "estado",
  "prioridad",
  "asignado_usuario_id",
  "asignado_a",
  // La categoría cambia como consecuencia del motivo/resumen y no representa
  // una segunda edición realizada por el usuario.
  "motivo_categoria",
  // El progreso se deriva del estado, cuyo cambio ya se informa arriba.
  // Listarlo como campo editado sugeriría una edición que nadie hizo.
  "progreso",
]);

export function formatTicketAuditAuthor(actor: TicketAuditActor): string {
  return (
    [actor.nombre, actor.apellido].filter(Boolean).join(" ").trim() ||
    actor.email
  );
}

export function getTicketAuditEditedFields(
  changedFields: readonly string[],
): string[] {
  return changedFields.filter((field) => !STRUCTURED_AUDIT_FIELDS.has(field));
}

export function buildTicketAuditNote(
  current: TicketAuditSnapshot,
  updated: TicketAuditSnapshot,
  changedFields: readonly string[],
): string {
  const details: string[] = [];

  if (current.estado !== updated.estado) {
    details.push(`Estado: ${current.estado} → ${updated.estado}`);
  }
  if (current.prioridad !== updated.prioridad) {
    details.push(`Prioridad: ${current.prioridad} → ${updated.prioridad}`);
  }
  if (
    current.asignado_usuario_id !== updated.asignado_usuario_id ||
    current.asignado_a !== updated.asignado_a
  ) {
    details.push(
      `Asignación: ${current.asignado_a || "Sin asignar"} → ${updated.asignado_a || "Sin asignar"}`,
    );
  }

  const editedLabels = getTicketAuditEditedFields(changedFields).map(
    (field) => AUDIT_FIELD_LABELS[field] ?? field,
  );
  if (editedLabels.length > 0) {
    details.push(`Campos editados: ${editedLabels.join(", ")}`);
  }

  return details.length > 0
    ? `Ticket actualizado. ${details.join(". ")}.`
    : "Ticket actualizado.";
}
