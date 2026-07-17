import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdminSeed } from "./lib/seed";

const port = Number(process.env["PORT"] ?? 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

// Garantiza que exista un usuario capaz de loguearse antes de abrir el puerto
await ensureAdminSeed();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
