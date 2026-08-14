import {
  ticketsTable,
  type MotivoCategoria,
  type Prioridad,
} from "@workspace/db/schema";
import { ticketVisibleCondition } from "@workspace/db/ticket-visibility";
import { eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { BusinessDateRange } from "../../../shared/time/business-date-range";

export type PerformanceFilters = BusinessDateRange & {
  empresa?: string;
  motivo_categoria?: MotivoCategoria;
  prioridad?: Prioridad;
};

/** Escapa los comodines de LIKE para buscar el texto de empresa literalmente. */
function escapeLikeFragment(value: string): string {
  return value
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_");
}

/** Construye la única definición SQL del conjunto analizado del módulo Rendimiento. */
export function buildPerformanceCohortConditions(
  filters: PerformanceFilters,
): SQL[] {
  const conditions: SQL[] = [ticketVisibleCondition];
  if (filters.fecha_desde) {
    conditions.push(gte(ticketsTable.fecha_creacion, filters.fecha_desde));
  }
  if (filters.fecha_hasta) {
    conditions.push(lte(ticketsTable.fecha_creacion, filters.fecha_hasta));
  }
  const company = filters.empresa?.trim();
  if (company) {
    const pattern = `%${escapeLikeFragment(company)}%`;
    conditions.push(sql`${ticketsTable.empresa} like ${pattern} escape '!'`);
  }
  if (filters.motivo_categoria) {
    conditions.push(
      eq(ticketsTable.motivo_categoria, filters.motivo_categoria),
    );
  }
  if (filters.prioridad) {
    conditions.push(eq(ticketsTable.prioridad, filters.prioridad));
  }
  return conditions;
}
