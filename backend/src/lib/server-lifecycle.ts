import type { Server } from "node:http";

export const APAGADO_TIMEOUT_PREDETERMINADO_MS = 20_000;

export type MotivoApagado = "SIGINT" | "SIGTERM" | "server_error";

interface LoggerApagado {
  info(contexto: Record<string, unknown>, mensaje: string): unknown;
  error(contexto: Record<string, unknown>, mensaje: string): unknown;
  flush?(callback?: (error?: Error) => void): unknown;
}

interface TimerApagado {
  unref?(): unknown;
}

interface FuenteSenales {
  on(evento: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(evento: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

interface FuenteSalida {
  once(evento: "beforeExit", listener: () => void): unknown;
  removeListener(evento: "beforeExit", listener: () => void): unknown;
}

interface OpcionesApagadoControlado {
  server: Pick<Server, "close" | "closeAllConnections">;
  detenerTareas: () => void;
  esperarTareas: () => Promise<void>;
  cerrarStreams: () => number;
  logger: LoggerApagado;
  timeoutMs?: number;
  programarTimeout?: (callback: () => void, timeoutMs: number) => TimerApagado;
  cancelarTimeout?: (timer: TimerApagado) => void;
  salir?: (codigo: number) => void;
}

export type ApagadoControlado = (motivo: MotivoApagado) => Promise<void>;

const programarTimeoutPredeterminado = (
  callback: () => void,
  timeoutMs: number,
): TimerApagado => setTimeout(callback, timeoutMs);

const cancelarTimeoutPredeterminado = (timer: TimerApagado): void => {
  clearTimeout(timer as NodeJS.Timeout);
};

async function vaciarLogs(logger: LoggerApagado): Promise<void> {
  if (!logger.flush) return;

  await new Promise<void>((resolve) => {
    let completado = false;
    const completar = () => {
      if (completado) return;
      completado = true;
      clearTimeout(fusible);
      resolve();
    };
    const fusible = setTimeout(completar, 500);
    try {
      logger.flush?.(() => completar());
    } catch {
      completar();
    }
  });
}

function esperarCierreHttp(server: Pick<Server, "close">): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (
        error &&
        (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
      )
        reject(error);
      else resolve();
    });
  });
}

/**
 * Crea un cierre idempotente. El proceso deja de admitir conexiones antes de
 * esperar trabajos. SQLite se cierra aparte en beforeExit: `server.close()` no
 * conoce handlers async que siguieron vivos después de que su cliente abortó.
 */
export function crearApagadoControlado(
  opciones: OpcionesApagadoControlado,
): ApagadoControlado {
  const timeoutMs = opciones.timeoutMs ?? APAGADO_TIMEOUT_PREDETERMINADO_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs debe ser un entero positivo");
  }

  const programarTimeout =
    opciones.programarTimeout ?? programarTimeoutPredeterminado;
  const cancelarTimeout =
    opciones.cancelarTimeout ?? cancelarTimeoutPredeterminado;
  const salir = opciones.salir ?? ((codigo) => process.exit(codigo));
  let apagado: Promise<void> | null = null;
  let salidaForzada: Promise<void> | null = null;

  return (motivo) => {
    if (apagado) return apagado;

    apagado = (async () => {
      let timer: TimerApagado | null = null;
      let streamsCerrados = 0;
      let deadlineVencido = false;
      const forzarSalida = (error?: unknown): Promise<void> => {
        if (salidaForzada) return salidaForzada;
        salidaForzada = (async () => {
          try {
            opciones.logger.error(
              { err: error, motivo, timeoutMs, streamsCerrados },
              error
                ? "Fallo el apagado controlado; se fuerza la salida"
                : "El apagado controlado excedio el plazo; se fuerza la salida",
            );
          } catch {
            // El logger no debe impedir el mecanismo de salida.
          }
          try {
            opciones.server.closeAllConnections();
          } catch {
            // La salida forzada sigue siendo el ultimo recurso.
          }
          await vaciarLogs(opciones.logger);
          salir(1);
        })();
        return salidaForzada;
      };

      try {
        opciones.logger.info(
          { motivo, timeoutMs },
          "Apagado controlado iniciado",
        );
        opciones.detenerTareas();

        // close() deja de aceptar conexiones de inmediato y resuelve cuando
        // terminaron las solicitudes existentes. Los SSE se cierran aparte
        // porque, por diseño, nunca finalizarían por sí solos.
        const cierreHttp = esperarCierreHttp(opciones.server);
        streamsCerrados = opciones.cerrarStreams();
        const drenaje = Promise.all([cierreHttp, opciones.esperarTareas()]);

        let resolverVencimiento!: (resultado: "timeout") => void;
        const vencimiento = new Promise<"timeout">((resolve) => {
          resolverVencimiento = resolve;
        });
        const deadline = programarTimeout(() => {
          deadlineVencido = true;
          resolverVencimiento("timeout");
          void forzarSalida().catch(() => undefined);
        }, timeoutMs);
        timer = deadline;
        const resultado = await Promise.race([
          drenaje.then(() => "drenado" as const),
          vencimiento,
        ]);

        if (resultado === "timeout" || deadlineVencido) {
          await forzarSalida();
          return;
        }

        // El deadline sigue armado, pero ya no mantiene vivo el proceso. Si un
        // handler async abortado conserva un trabajo libuv, todavia lo limita;
        // si no queda ninguno, Node llega a beforeExit y termina normalmente.
        deadline.unref?.();
        opciones.logger.info(
          { motivo, streamsCerrados },
          "HTTP y tareas periodicas drenados; esperando salida del proceso",
        );
      } catch (error) {
        if (timer) cancelarTimeout(timer);
        await forzarSalida(error);
      }
    })();

    return apagado;
  };
}

/**
 * Cierra un recurso una vez que Node ya no tiene trabajos capaces de reanudar
 * handlers. `beforeExit` no se emite en la salida forzada del deadline.
 */
export function registrarCierreAntesDeSalir(
  cerrar: () => void,
  fuente: FuenteSalida = process,
): () => void {
  const alSalir = () => cerrar();
  fuente.once("beforeExit", alSalir);
  return () => fuente.removeListener("beforeExit", alSalir);
}

/** Instala señales idempotentes y devuelve una función de desregistro. */
export function registrarSenalesApagado(
  apagar: ApagadoControlado,
  fuente: FuenteSenales = process,
): () => void {
  const alRecibirSigint = () => void apagar("SIGINT");
  const alRecibirSigterm = () => void apagar("SIGTERM");

  fuente.on("SIGINT", alRecibirSigint);
  fuente.on("SIGTERM", alRecibirSigterm);

  return () => {
    fuente.removeListener("SIGINT", alRecibirSigint);
    fuente.removeListener("SIGTERM", alRecibirSigterm);
  };
}
