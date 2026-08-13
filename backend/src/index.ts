import "./shared/runtime/load-env";
import { ensureTicketQuarantineProjection, sqlite } from "@workspace/db";
import app from "./app";
import { beginEventClientShutdown } from "./shared/realtime/events";
import { logger } from "./shared/observability/logger";
import { ensureAdminSeed, purgeUnsafeStoredSessions } from "./modules/auth";
import {
  crearRunnerPrioridadAutomatica,
  reconciliarCategoriasMotivo,
} from "./modules/tickets";
import { validateServiceSecrets } from "./shared/config/service-secrets";
import { readinessControl } from "./shared/runtime/runtime-readiness";
import {
  crearApagadoControlado,
  registrarCierreAntesDeSalir,
  registrarSenalesApagado,
} from "./shared/runtime/server-lifecycle";

const port = Number(process.env["PORT"] ?? 5000);
const listenHost = process.env["LISTEN_HOST"]?.trim() || undefined;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

// Un backend sin credenciales entre servicios no debe abrir el puerto ni
// reportarse saludable. Los valores nunca se incluyen en el error.
validateServiceSecrets();

// Las bases locales históricas creadas con drizzle-kit push no tienen ledger:
// instala y verifica allí la misma proyección definida por 0014. En una base
// versionada, cualquier drift falla cerrado en vez de ocultar una migración.
ensureTicketQuarantineProjection(sqlite);

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

const server = listenHost ? app.listen(port, listenHost) : app.listen(port);
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
  logger.info(
    { port, ...(listenHost ? { host: listenHost } : {}) },
    "Server listening",
  );
});

server.once("error", (err) => {
  logger.error({ err, port }, "Error listening on port");
  process.exitCode = 1;
  void apagar("server_error");
});
