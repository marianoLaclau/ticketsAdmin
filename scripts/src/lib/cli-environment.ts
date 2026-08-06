import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function readOptionValue(
  args: string[],
  index: number,
  option: string,
): string {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Falta el valor de ${option}`);
  }
  return value;
}

export function resolveInvocationDirectory(): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd());
}

export function loadWorkspaceEnv(startDirectory: string): void {
  let directory = startDirectory;

  while (true) {
    const envPath = path.join(directory, ".env");
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
      return;
    }

    const parent = path.dirname(directory);
    if (
      parent === directory ||
      fs.existsSync(path.join(directory, "pnpm-workspace.yaml"))
    ) {
      return;
    }
    directory = parent;
  }
}
