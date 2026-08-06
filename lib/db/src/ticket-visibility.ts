import { sql } from "drizzle-orm";
import {
  ticketsCuarentenaTable,
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

/** Consulta la proyección materializada mantenida por SQLite. */
export const ticketVacioCondition = sql<boolean>`exists (
  select 1
  from ${ticketsCuarentenaTable}
  where ${ticketsCuarentenaTable.ticket_id} = ${ticketsTable.id}
)`;

/** Selecciona exclusivamente tickets con algún dato o gestión operativa. */
export const ticketVisibleCondition = sql<boolean>`not exists (
    select 1
    from ${ticketsCuarentenaTable}
    where ${ticketsCuarentenaTable.ticket_id} = ${ticketsTable.id}
  )`;
