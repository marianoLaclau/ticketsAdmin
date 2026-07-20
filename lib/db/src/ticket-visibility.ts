import { and, eq, isNull, not, sql, type AnyColumn } from "drizzle-orm";
import {
  seguimientosTable,
  ticketsTable,
  type Ticket,
} from "./schema/tickets";

const NOMBRES_VACIOS = new Set(["", "sin nombre", "sin nombre proporcionado"]);
const MOTIVOS_VACIOS = new Set(["", "sin especificar"]);

function textoNormalizado(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function textoVacio(value: string | null | undefined): boolean {
  return (value ?? "").trim() === "";
}

/**
 * Determina si un ticket carece por completo de datos operativos.
 *
 * Los campos tecnicos (por ejemplo conversation_id, fechas y audio_url) no
 * participan de esta regla. Los valores ausentes de un ticket parcial se
 * interpretan como sus defaults de base de datos.
 */
export type TicketVisibilityInput = Partial<Ticket> & {
  tiene_seguimientos?: boolean;
};

export function esTicketVacio(ticket: TicketVisibilityInput): boolean {
  return (
    NOMBRES_VACIOS.has(textoNormalizado(ticket.nombre)) &&
    textoVacio(ticket.apellido) &&
    textoVacio(ticket.telefono) &&
    textoVacio(ticket.dni) &&
    textoVacio(ticket.empresa) &&
    textoVacio(ticket.email) &&
    MOTIVOS_VACIOS.has(textoNormalizado(ticket.motivo)) &&
    textoVacio(ticket.resumen) &&
    textoVacio(ticket.notas) &&
    (ticket.estado ?? "nuevo") === "nuevo" &&
    (ticket.prioridad ?? "media") === "media" &&
    (ticket.progreso ?? 0) === 0 &&
    (ticket.notificado ?? false) === false &&
    ticket.asignado_usuario_id == null &&
    textoVacio(ticket.asignado_a) &&
    (ticket.tiene_seguimientos ?? false) === false
  );
}

// Mismo conjunto de caracteres que String.prototype.trim() en ECMAScript.
// SQLite solo quita U+0020 con trim(x), por eso se declara el conjunto para
// mantener la clasificación SQL alineada con el helper puro.
const ESPACIOS_SQL = sql`char(
  9, 10, 11, 12, 13, 32, 160, 5760,
  8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
  8232, 8233, 8239, 8287, 12288, 65279
)`;

const textoSqlVacio = (column: AnyColumn) =>
  sql<boolean>`trim(coalesce(${column}, ''), ${ESPACIOS_SQL}) = ''`;

const textoSqlNormalizado = (column: AnyColumn) =>
  sql<string>`lower(trim(coalesce(${column}, ''), ${ESPACIOS_SQL}))`;

/** Equivalente SQL de {@link esTicketVacio} para consultas sobre tickets. */
export const ticketVacioCondition = and(
  sql<boolean>`${textoSqlNormalizado(ticketsTable.nombre)} in ('', 'sin nombre', 'sin nombre proporcionado')`,
  textoSqlVacio(ticketsTable.apellido),
  textoSqlVacio(ticketsTable.telefono),
  textoSqlVacio(ticketsTable.dni),
  textoSqlVacio(ticketsTable.empresa),
  textoSqlVacio(ticketsTable.email),
  sql<boolean>`${textoSqlNormalizado(ticketsTable.motivo)} in ('', 'sin especificar')`,
  textoSqlVacio(ticketsTable.resumen),
  textoSqlVacio(ticketsTable.notas),
  eq(ticketsTable.estado, "nuevo"),
  eq(ticketsTable.prioridad, "media"),
  eq(ticketsTable.progreso, 0),
  eq(ticketsTable.notificado, false),
  isNull(ticketsTable.asignado_usuario_id),
  textoSqlVacio(ticketsTable.asignado_a),
  sql<boolean>`not exists (
    select 1
    from ${seguimientosTable}
    where ${seguimientosTable.ticket_id} = ${ticketsTable.id}
  )`,
)!;

/** Selecciona exclusivamente tickets con algun dato o gestion operativa. */
export const ticketVisibleCondition = not(ticketVacioCondition);
