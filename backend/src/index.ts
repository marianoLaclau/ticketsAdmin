import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdminSeed } from "./lib/seed";
import { crearRunnerPrioridadAutomatica } from "./lib/prioridad-automatica-runner";
import { reconciliarCategoriasMotivo } from "./lib/reclasificar-motivos";

const port = Number(process.env["PORT"] ?? 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
