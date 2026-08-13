import { UpdateTicketBody } from "@workspace/api-zod";
import { findInvalidRfc3339DateTimeField } from "../../../lib/rfc3339";

const TECHNICAL_TICKET_UPDATE_FIELDS = [
  "hora",
  "notificado",
  "audio_url",
  "fecha_resolucion",
  "fecha_limite",
] as const;

const TICKET_UPDATE_FIELDS = [
  "expected_version",
  "hora",
  "nombre",
  "apellido",
  "telefono",
  "dni",
  "empresa",
  "email",
  "motivo",
  "resumen",
  "notificado",
  "estado",
  "prioridad",
  "audio_url",
  "notas",
  "fecha_limite",
  "fecha_resolucion",
  "progreso",
] as const;

const TICKET_UPDATE_DATE_FIELDS = ["fecha_limite", "fecha_resolucion"] as const;

const OPTIONAL_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ParsedTicketUpdateBody = ReturnType<typeof UpdateTicketBody.parse>;

export type TicketUpdateBodyParseResult =
  | { success: true; data: ParsedTicketUpdateBody }
  | { success: false; error: string };

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyBodyFields(
  value: unknown,
  allowed: readonly string[],
): value is Record<string, unknown> {
  return (
    isObjectBody(value) &&
    Object.keys(value).every((field) => allowed.includes(field))
  );
}

function hasOwn(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function hasInvalidTicketUpdateEmail(body: Record<string, unknown>): boolean {
  if (!hasOwn(body, "email") || body.email === null) return false;
  if (typeof body.email !== "string") return true;

  const email = body.email.trim();
  return (
    email.length > 254 ||
    (email.length > 0 && !OPTIONAL_EMAIL_PATTERN.test(email))
  );
}

export function hasTechnicalTicketUpdateFields(value: unknown): boolean {
  return (
    isObjectBody(value) &&
    TECHNICAL_TICKET_UPDATE_FIELDS.some((field) => hasOwn(value, field))
  );
}

export function parseTicketUpdateBody(
  value: unknown,
): TicketUpdateBodyParseResult {
  if (!hasOnlyBodyFields(value, TICKET_UPDATE_FIELDS)) {
    return { success: false, error: "El cuerpo contiene campos no permitidos" };
  }

  const invalidDateField = findInvalidRfc3339DateTimeField(
    value,
    TICKET_UPDATE_DATE_FIELDS,
  );
  if (invalidDateField) {
    return {
      success: false,
      error: `El campo ${invalidDateField} debe ser una fecha RFC3339 válida con zona horaria`,
    };
  }

  if (hasInvalidTicketUpdateEmail(value)) {
    return { success: false, error: "El email no tiene un formato válido" };
  }

  const bodyForParsing =
    typeof value.email === "string"
      ? { ...value, email: value.email.trim() || null }
      : value;
  const bodyParsed = UpdateTicketBody.safeParse(bodyForParsing);
  if (!bodyParsed.success) {
    return { success: false, error: "Datos de actualización inválidos" };
  }
  if (Object.keys(value).every((field) => field === "expected_version")) {
    return {
      success: false,
      error: "Indicá al menos un campo para actualizar",
    };
  }
  if (!Number.isSafeInteger(bodyParsed.data.expected_version)) {
    return {
      success: false,
      error: "La versión esperada debe ser un entero válido",
    };
  }
  if (
    bodyParsed.data.progreso !== undefined &&
    !Number.isInteger(bodyParsed.data.progreso)
  ) {
    return {
      success: false,
      error: "El progreso debe ser un número entero",
    };
  }

  return { success: true, data: bodyParsed.data };
}
