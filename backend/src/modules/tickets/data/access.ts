import { ticketsTable } from "@workspace/db/schema";
import { ticketVisibleCondition } from "@workspace/db/ticket-visibility";
import { and, eq, type SQL } from "drizzle-orm";

/**
 * Construye únicamente el alcance SQL para el ticket. Cuando `includeEmpty` es
 * verdadero, el endpoint llamador debe haber autorizado antes esa ampliación.
 */
export function buildTicketAccessCondition(
  ticketId: number,
  includeEmpty: boolean,
): SQL {
  return includeEmpty
    ? eq(ticketsTable.id, ticketId)
    : and(eq(ticketsTable.id, ticketId), ticketVisibleCondition)!;
}
