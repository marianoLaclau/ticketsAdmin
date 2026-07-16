import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the SQLite database file path.
 *
 * Priority:
 *   1. TICKETS_DB_PATH env var (absolute or relative to cwd)
 *   2. <repo root>/data/tickets.db — the repo root is found by walking up
 *      from cwd until pnpm-workspace.yaml appears, so every package
 *      (backend, scripts, drizzle-kit) hits the same file no matter
 *      which directory it runs from.
 */
export function resolveDbPath(): string {
  const dbPath = computeDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return dbPath;
}

function computeDbPath(): string {
  const fromEnv = process.env.TICKETS_DB_PATH;
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return path.join(dir, "data", "tickets.db");
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      // No workspace root found — fall back to cwd
      return path.join(process.cwd(), "data", "tickets.db");
    }
    dir = parent;
  }
}
