import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Carga la primera .env encontrada al subir hasta la raíz del workspace.
 * Las variables ya presentes conservan precedencia por contrato de Node.
 */
export function loadWorkspaceEnv(
  startDirectory = process.cwd(),
): string | null {
  let directory = path.resolve(startDirectory);
  while (true) {
    const envPath = path.join(directory, ".env");
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
      return envPath;
    }
    const parent = path.dirname(directory);
    if (
      parent === directory ||
      existsSync(path.join(directory, "pnpm-workspace.yaml"))
    ) {
      return null;
    }
    directory = parent;
  }
}
