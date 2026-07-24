import { logger as loggerPredeterminado } from "./logger";
import {
  servicioPrioridadAutomatica,
  type ResultadoPrioridadAutomatica,
  type ServicioPrioridadAutomatica,
} from "./prioridad-automatica";

export const PRIORIDAD_AUTOMATICA_INTERVALO_PREDETERMINADO_MS = 5 * 60 * 1000;
export const PRIORIDAD_AUTOMATICA_INTERVALO_MINIMO_MS = 10 * 1000;

export function resolverIntervaloPrioridadAutomatica(
  valor: string | undefined,
): number {
  if (!valor?.trim()) return PRIORIDAD_AUTOMATICA_INTERVALO_PREDETERMINADO_MS;

  const intervalo = Number(valor);
  return Number.isInteger(intervalo) &&
    intervalo >= PRIORIDAD_AUTOMATICA_INTERVALO_MINIMO_MS
    ? intervalo
    : PRIORIDAD_AUTOMATICA_INTERVALO_PREDETERMINADO_MS;
}

interface LoggerPrioridadAutomatica {
  info(contexto: Record<string, unknown>, mensaje: string): unknown;
  error(contexto: Record<string, unknown>, mensaje: string): unknown;
  debug?(contexto: Record<string, unknown>, mensaje: string): unknown;
}

export interface TimerPrioridadAutomatica {
  unref?(): unknown;
}

type ProgramarIntervalo = (
  callback: () => void,
  intervaloMs: number,
) => TimerPrioridadAutomatica;

type CancelarIntervalo = (timer: TimerPrioridadAutomatica) => void;

export interface RunnerPrioridadAutomatica {
  ejecutarAhora(
    origen: "arranque" | "intervalo" | "manual",
  ): Promise<ResultadoPrioridadAutomatica | null>;
  iniciar(): TimerPrioridadAutomatica;
  detener(): void;
}

interface OpcionesRunnerPrioridadAutomatica {
  servicio?: ServicioPrioridadAutomatica;
  intervaloMs?: number;
  logger?: LoggerPrioridadAutomatica;
  programarIntervalo?: ProgramarIntervalo;
  cancelarIntervalo?: CancelarIntervalo;
}

const programarIntervaloPredeterminado: ProgramarIntervalo = (
  callback,
  intervaloMs,
) => setInterval(callback, intervaloMs);

const cancelarIntervaloPredeterminado: CancelarIntervalo = (timer) => {
  clearInterval(timer as NodeJS.Timeout);
};

export function crearRunnerPrioridadAutomatica(
  opciones: OpcionesRunnerPrioridadAutomatica = {},
): RunnerPrioridadAutomatica {
  const servicio = opciones.servicio ?? servicioPrioridadAutomatica;
  const logger = opciones.logger ?? loggerPredeterminado;
  const intervaloMs = resolverIntervaloPrioridadAutomatica(
    opciones.intervaloMs === undefined
      ? process.env.PRIORIDAD_AUTOMATICA_INTERVAL_MS
      : String(opciones.intervaloMs),
  );
  const programarIntervalo = opciones.programarIntervalo ??
    programarIntervaloPredeterminado;
  const cancelarIntervalo = opciones.cancelarIntervalo ??
    cancelarIntervaloPredeterminado;
  let timer: TimerPrioridadAutomatica | null = null;

  const ejecutarAhora: RunnerPrioridadAutomatica["ejecutarAhora"] = async (
    origen,
  ) => {
    if (servicio.estaEjecutando()) {
      logger.debug?.(
        { origen },
        "Revision de prioridad omitida: ya hay una ejecucion activa",
      );
      return null;
    }

    try {
      const resultado = await servicio.ejecutar();
      const cantidad = resultado.promociones.length;
      if (cantidad > 0) {
        logger.info(
          {
            origen,
            revisados: resultado.revisados,
            evaluados: resultado.evaluados,
            promociones: cantidad,
            tickets: resultado.promociones.map(({ ticketId }) => ticketId),
          },
          "Prioridades automaticas actualizadas",
        );
      } else {
        logger.debug?.(
          {
            origen,
            revisados: resultado.revisados,
            evaluados: resultado.evaluados,
          },
          "Revision de prioridades automaticas completada sin cambios",
        );
      }
      return resultado;
    } catch (error) {
      logger.error(
        { err: error, origen },
        "Fallo la revision de prioridades automaticas; el servidor continuara",
      );
      return null;
    }
  };

  return {
    ejecutarAhora,
    iniciar() {
      if (timer) return timer;

      timer = programarIntervalo(() => {
        void ejecutarAhora("intervalo");
      }, intervaloMs);
      timer.unref?.();
      logger.info(
        { intervaloMs },
        "Revision periodica de prioridades automaticas programada",
      );
      return timer;
    },
    detener() {
      if (!timer) return;
      cancelarIntervalo(timer);
      timer = null;
    },
  };
}
