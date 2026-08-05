import "./lib/load-env";
import { sqlite } from "@workspace/db";
import app from "./app";
import { beginEventClientShutdown } from "./lib/events";
import { logger } from "./lib/logger";
import { ensureAdminSeed } from "./lib/seed";
import { crearRunnerPrioridadAutomatica } from "./lib/prioridad-automatica-runner";
import { reconciliarCategoriasMotivo } from "./lib/reclasificar-motivos";
import { validateServiceSecrets } from "./lib/service-secrets";
import { purgeUnsafeStoredSessions } from "./lib/session-store";
import { readinessControl } from "./lib/runtime-readiness";
import {
  crearApagadoControlado,
  registrarCierreAntesDeSalir,
  registrarSenalesApagado,
} from "./lib/server-lifecycle";

const port = Number(process.env["PORT"] ?? 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

// Un backend sin credenciales entre servicios no debe abrir el puerto ni
// reportarse saludable. Los valores nunca se incluyen en el error.
validateServiceSecrets();

// La migración de digest revoca las sesiones una vez. Repetir esta limpieza
// en cada arranque cubre también un eventual rollback que haya creado nuevos
// bearer crudos en la columna histórica antes de volver a esta versión.
const unsafeSessionsRevoked = await purgeUnsafeStoredSessions();
if (unsafeSessionsRevoked > 0) {
  logger.warn(
    { total: unsafeSessionsRevoked },
    "Sesiones legadas o inválidas revocadas al arrancar",
  );
}

// Garantiza que exista un usuario capaz de loguearse antes de abrir el puerto
await ensureAdminSeed();

// Promueve de forma idempotente únicamente históricos de Embargos. No
// reclasifica otras categorías ni toca los textos originales recibidos de n8n.
const categorias = await reconciliarCategoriasMotivo();
if (categorias.actualizados > 0) {
  logger.info(
    {
      revisados: categorias.revisados,
      actualizados: categorias.actualizados,
      tickets: categorias.cambios.map(({ ticketId }) => ticketId),
    },
    "Categorias de motivo reconciliadas",
  );
}

// La primera evaluacion ocurre antes de aceptar trafico. Un fallo queda
// registrado pero no impide levantar el servidor; las siguientes revisiones
// se ejecutan con un timer sin referencia y sin solaparse entre si.
const runnerPrioridadAutomatica = crearRunnerPrioridadAutomatica();
await runnerPrioridadAutomatica.ejecutarAhora("arranque");
runnerPrioridadAutomatica.iniciar();

const server = app.listen(port);
const apagar = crearApagadoControlado({
  server,
  iniciarDrenaje: () => readinessControl.beginDrain(),
  detenerTareas: () => runnerPrioridadAutomatica.detener(),
  esperarTareas: () => runnerPrioridadAutomatica.esperarEjecucionActiva(),
  cerrarStreams: beginEventClientShutdown,
  logger,
});
registrarCierreAntesDeSalir(() => {
  if (sqlite.open) sqlite.close();
});
registrarSenalesApagado(apagar);

server.once("listening", () => {
  readinessControl.markReady();
  logger.info({ port }, "Server listening");
});

server.once("error", (err) => {
  logger.error({ err, port }, "Error listening on port");
  process.exitCode = 1;
  void apagar("server_error");
});
