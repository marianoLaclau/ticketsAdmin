import type { Request } from "express";

export function parseBooleanQueryParam(value: unknown): unknown {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

function parseLocalDateQueryParam(value: unknown, endOfDay = false): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return new Date(Number.NaN);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  date.setFullYear(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

export function normalizeTicketQuery(
  query: Request["query"],
): Record<string, unknown> {
  return {
    ...query,
    fecha_desde: parseLocalDateQueryParam(query.fecha_desde),
    fecha_hasta: parseLocalDateQueryParam(query.fecha_hasta, true),
    vencidos: parseBooleanQueryParam(query.vencidos),
    incluir_vacios: parseBooleanQueryParam(query.incluir_vacios),
  };
}
