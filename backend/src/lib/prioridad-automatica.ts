import { and, eq, inArray, isNotNull, not } from "drizzle-orm";
import {
  calcularHorasHabilesRestantes,
  calcularPrioridadPorSla,
  type PrioridadSla,
} from "@workspace/ingesta";
import { broadcastEvent } from "./events";
import { logger } from "./logger";

export const ESTADOS_FINALIZADOS_PRIORIDAD = ["resuelto", "cerrado"] as const;

export type EstadoTicketPrioridad =
  | "nuevo"
  | "en_proceso"
  | "pendiente"
  | "resuelto"
  | "cerrado";

export interface TicketCandidatoPrioridad {
  id: number;
  estado: EstadoTicketPrioridad;
  prioridad: PrioridadSla;
  fechaLimite: Date | null;
  /** El repositorio SQL lo deriva con ticketVisibleCondition. */
  visible: boolean;
}

export interface PromocionPrioridad {
  ticketId: number;
  prioridadAnterior: PrioridadSla;
  prioridadNueva: PrioridadSla;
  horasHabilesRestantes: number;
}

export interface ResultadoPrioridadAutomatica {
  instanteEvaluado: Date;
  revisados: number;
  evaluados: number;
  promociones: PromocionPrioridad[];
}

export interface CambioPrioridadCondicional {
  ticketId: number;
  prioridadEsperada: PrioridadSla;
  prioridadNueva: PrioridadSla;
  fechaLimiteEsperada: Date;
  horasHabilesRestantes: number;
}

export interface RepositorioPrioridadAutomatica {
  listarCandidatos(): Promise<readonly TicketCandidatoPrioridad[]>;
  promoverSiCoincide(cambio: CambioPrioridadCondicional): Promise<boolean>;
}

export interface ServicioPrioridadAutomatica {
  ejecutar(ahora?: Date): Promise<ResultadoPrioridadAutomatica>;
  estaEjecutando(): boolean;
}

export type NotificadorPromocionPrioridad = (
  promocion: PromocionPrioridad,
) => void | Promise<void>;

type ModuloDbPrioridad = Pick<
  typeof import("@workspace/db"),
  | "db"
  | "ticketsTable"
  | "seguimientosTable"
  | "ticketVisibleCondition"
>;

export type CargarModuloDbPrioridad = () => Promise<ModuloDbPrioridad>;

function formatearHorasParaNota(horas: number): string {
  const valor = Math.round(Math.abs(horas) * 10) / 10;
  return Number.isInteger(valor)
    ? String(valor)
    : valor.toFixed(1).replace(".", ",");
}

export function crearNotaPromocionPrioridad(
  cambio: Pick<
    CambioPrioridadCondicional,
    "prioridadEsperada" | "prioridadNueva" | "horasHabilesRestantes"
  >,
): string {
  const anterior = cambio.prioridadEsperada.toUpperCase();
  const nueva = cambio.prioridadNueva.toUpperCase();
  const horas = formatearHorasParaNota(cambio.horasHabilesRestantes);
  const referencia = cambio.horasHabilesRestantes < 0
    ? `vencido hace ${horas} horas hábiles`
    : `${horas} horas hábiles restantes`;

  return `Prioridad actualizada automáticamente de ${anterior} a ${nueva} por proximidad al vencimiento (${referencia}).`;
}

export function emitirPromocionPrioridadSse(
  promocion: PromocionPrioridad,
  emitir: typeof broadcastEvent = broadcastEvent,
): void {
  try {
    emitir("ticket_actualizado", {
      ticket_id: promocion.ticketId,
      prioridad: promocion.prioridadNueva,
      prioridad_anterior: promocion.prioridadAnterior,
      prioridad_nueva: promocion.prioridadNueva,
      origen: "prioridad_automatica",
    });
  } catch (error) {
    logger.error(
      { err: error, ticketId: promocion.ticketId },
      "No se pudo emitir la promocion automatica por SSE",
    );
  }
}

export function esCandidatoPrioridadAutomatica(
  ticket: TicketCandidatoPrioridad,
): ticket is TicketCandidatoPrioridad & { fechaLimite: Date } {
  return (
    ticket.visible &&
    ticket.estado !== "resuelto" &&
    ticket.estado !== "cerrado" &&
    ticket.fechaLimite instanceof Date &&
    !Number.isNaN(ticket.fechaLimite.getTime())
  );
}

/**
 * Ejecuta un ciclo con un unico instante de referencia.
 *
 * La escritura usa compare-and-set sobre prioridad, fecha limite, estado y
 * visibilidad. Asi una edicion concurrente no queda pisada por una lectura
 * anterior y repetir el ciclo no genera nuevas escrituras.
 */
export async function ejecutarCicloPrioridadAutomatica(
  repositorio: RepositorioPrioridadAutomatica,
  ahora = new Date(),
  notificarPromocion?: NotificadorPromocionPrioridad,
): Promise<ResultadoPrioridadAutomatica> {
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) {
    throw new RangeError("El instante de evaluacion no es valido");
  }

  const instanteEvaluado = new Date(ahora.getTime());
  const tickets = await repositorio.listarCandidatos();
  const promociones: PromocionPrioridad[] = [];
  let evaluados = 0;

  for (const ticket of tickets) {
    if (!esCandidatoPrioridadAutomatica(ticket)) continue;
    evaluados += 1;

    const horasHabilesRestantes = calcularHorasHabilesRestantes(
      ticket.fechaLimite,
      instanteEvaluado,
    );
    const prioridadNueva = calcularPrioridadPorSla(
      ticket.prioridad,
      horasHabilesRestantes,
    );
    if (prioridadNueva === ticket.prioridad) continue;

    const actualizado = await repositorio.promoverSiCoincide({
      ticketId: ticket.id,
      prioridadEsperada: ticket.prioridad,
      prioridadNueva,
      fechaLimiteEsperada: ticket.fechaLimite,
      horasHabilesRestantes,
    });
    if (!actualizado) continue;

    const promocion = {
      ticketId: ticket.id,
      prioridadAnterior: ticket.prioridad,
      prioridadNueva,
      horasHabilesRestantes,
    } satisfies PromocionPrioridad;
    promociones.push(promocion);
    await notificarPromocion?.(promocion);
  }

  return {
    instanteEvaluado,
    revisados: tickets.length,
    evaluados,
    promociones,
  };
}

/**
 * Crea un servicio cuyo lock vive en memoria. Llamadas concurrentes reciben
 * la misma promesa activa; al completar o fallar, el lock siempre se libera.
 */
export function crearServicioPrioridadAutomatica(
  repositorio: RepositorioPrioridadAutomatica,
  reloj: () => Date = () => new Date(),
  notificarPromocion?: NotificadorPromocionPrioridad,
): ServicioPrioridadAutomatica {
  let ejecucionActiva: Promise<ResultadoPrioridadAutomatica> | null = null;

  return {
    ejecutar(ahora) {
      if (ejecucionActiva) return ejecucionActiva;

      const ejecucion = ejecutarCicloPrioridadAutomatica(
        repositorio,
        ahora ?? reloj(),
        notificarPromocion,
      );
      let ejecucionConLiberacion: Promise<ResultadoPrioridadAutomatica>;
      ejecucionConLiberacion = ejecucion.finally(() => {
        if (ejecucionActiva === ejecucionConLiberacion) {
          ejecucionActiva = null;
        }
      });
      ejecucionActiva = ejecucionConLiberacion;
      return ejecucionConLiberacion;
    },
    estaEjecutando() {
      return ejecucionActiva !== null;
    },
  };
}

/** Repositorio productivo, cargado de forma perezosa para facilitar tests. */
export function crearRepositorioPrioridadAutomaticaDb(
  cargarModulo: CargarModuloDbPrioridad = () => import("@workspace/db"),
): RepositorioPrioridadAutomatica {
  return {
    async listarCandidatos() {
      const { db, ticketsTable, ticketVisibleCondition } = await cargarModulo();
      const rows = await db
        .select({
          id: ticketsTable.id,
          estado: ticketsTable.estado,
          prioridad: ticketsTable.prioridad,
          fechaLimite: ticketsTable.fecha_limite,
        })
        .from(ticketsTable)
        .where(
          and(
            ticketVisibleCondition,
            isNotNull(ticketsTable.fecha_limite),
            not(inArray(ticketsTable.estado, ESTADOS_FINALIZADOS_PRIORIDAD)),
          ),
        );

      return rows.map((ticket) => ({ ...ticket, visible: true }));
    },
    async promoverSiCoincide(cambio) {
      const {
        db,
        ticketsTable,
        seguimientosTable,
        ticketVisibleCondition,
      } = await cargarModulo();

      // better-sqlite3 ejecuta las transacciones de forma sincrona. Usar
      // .all()/.run() dentro del callback garantiza que UPDATE + auditoria se
      // confirmen juntos o se reviertan juntos si el INSERT falla.
      return db.transaction((tx) => {
        const actualizados = tx
          .update(ticketsTable)
          .set({ prioridad: cambio.prioridadNueva })
          .where(
            and(
              eq(ticketsTable.id, cambio.ticketId),
              eq(ticketsTable.prioridad, cambio.prioridadEsperada),
              eq(ticketsTable.fecha_limite, cambio.fechaLimiteEsperada),
              ticketVisibleCondition,
              not(inArray(ticketsTable.estado, ESTADOS_FINALIZADOS_PRIORIDAD)),
            ),
          )
          .returning({ id: ticketsTable.id })
          .all();

        if (actualizados.length !== 1) return false;

        tx.insert(seguimientosTable)
          .values({
            ticket_id: cambio.ticketId,
            nota: crearNotaPromocionPrioridad(cambio),
            prioridad_anterior: cambio.prioridadEsperada,
            prioridad_nueva: cambio.prioridadNueva,
            autor: "Sistema",
          })
          .run();

        return true;
      });
    },
  };
}

export const servicioPrioridadAutomatica = crearServicioPrioridadAutomatica(
  crearRepositorioPrioridadAutomaticaDb(),
  () => new Date(),
  emitirPromocionPrioridadSse,
);
