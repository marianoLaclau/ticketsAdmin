import { sqlite } from "@workspace/db";
import { logger } from "../observability/logger";
import { createReadinessControl } from "./readiness-control";
import { probeSqliteReadiness } from "./sqlite-readiness";

function reportProbeFailure(error: unknown): void {
  try {
    logger.warn({ err: error }, "La sonda de readiness de SQLite fallo");
  } catch {
    // El diagnostico nunca debe alterar la respuesta cerrada de readiness.
  }
}

export const readinessControl = createReadinessControl(
  () => probeSqliteReadiness(sqlite),
  reportProbeFailure,
);
