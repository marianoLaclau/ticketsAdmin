import { and, eq, isNull } from "drizzle-orm";
import { clasificarMotivo } from "@workspace/ingesta";
import type { MotivoCategoria } from "@workspace/db/schema";

export interface TicketCategoriaCandidato {
  id: number;
  motivo: string;
  resumen: string | null;
  motivoCategoria: string;
}

export interface CambioCategoriaMotivo {
  ticketId: number;
  categoriaAnterior: string;
  categoriaNueva: MotivoCategoria;
  motivoEsperado: string;
  resumenEsperado: string | null;
}

export interface ResultadoReclasificacionMotivos {
  revisados: number;
  actualizados: number;
  cambios: CambioCategoriaMotivo[];
}

type ModuloDbCategorias = Pick<
  typeof import("@workspace/db"),
  "db" | "ticketsTable"
>;

export type CargarModuloDbCategorias = () => Promise<ModuloDbCategorias>;

export function detectarCambiosCategoriaMotivo(
  tickets: readonly TicketCategoriaCandidato[],
): CambioCategoriaMotivo[] {
  return tickets.flatMap((ticket) => {
    const categoriaNueva = clasificarMotivo(ticket.motivo, ticket.resumen);
    if (
      categoriaNueva !== "embargos" ||
      categoriaNueva === ticket.motivoCategoria
    ) {
      return [];
    }

    return [{
      ticketId: ticket.id,
      categoriaAnterior: ticket.motivoCategoria,
      categoriaNueva,
      motivoEsperado: ticket.motivo,
      resumenEsperado: ticket.resumen,
    }];
  });
}

/**
 * Promueve únicamente históricos que ahora corresponden a Embargos. No
 * recalcula otras categorías: motivo y resumen se leen, nunca se reescriben.
 * El compare-and-set evita pisar una reclasificación concurrente más nueva.
 */
export async function reconciliarCategoriasMotivo(
  cargarModulo: CargarModuloDbCategorias = () => import("@workspace/db"),
): Promise<ResultadoReclasificacionMotivos> {
  const { db, ticketsTable } = await cargarModulo();
  const tickets = db
    .select({
      id: ticketsTable.id,
      motivo: ticketsTable.motivo,
      resumen: ticketsTable.resumen,
      motivoCategoria: ticketsTable.motivo_categoria,
    })
    .from(ticketsTable)
    .all();
  const cambiosDetectados = detectarCambiosCategoriaMotivo(tickets);

  const cambios = db.transaction((tx) => {
    const aplicados: CambioCategoriaMotivo[] = [];
    for (const cambio of cambiosDetectados) {
      const rows = tx
        .update(ticketsTable)
        .set({ motivo_categoria: cambio.categoriaNueva })
        .where(
          and(
            eq(ticketsTable.id, cambio.ticketId),
            eq(
              ticketsTable.motivo_categoria,
              cambio.categoriaAnterior as MotivoCategoria,
            ),
            eq(ticketsTable.motivo, cambio.motivoEsperado),
            cambio.resumenEsperado === null
              ? isNull(ticketsTable.resumen)
              : eq(ticketsTable.resumen, cambio.resumenEsperado),
          ),
        )
        .returning({ id: ticketsTable.id })
        .all();
      if (rows.length === 1) aplicados.push(cambio);
    }
    return aplicados;
  });

  return {
    revisados: tickets.length,
    actualizados: cambios.length,
    cambios,
  };
}
