import { loadWorkspaceEnv } from "./load-workspace-env";
import { ensureTicketQuarantineProjection } from "./ticket-quarantine-projection";

loadWorkspaceEnv();

const { sqlite } = await import("./index");
try {
  const { repaired } = ensureTicketQuarantineProjection(sqlite);
  process.stdout.write(
    repaired
      ? "Proyección de cuarentena reconciliada.\n"
      : "Proyección de cuarentena verificada.\n",
  );
} finally {
  sqlite.close();
}
