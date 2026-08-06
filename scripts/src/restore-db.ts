#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { resolveDbPath } from "@workspace/db/db-path";
import {
  restoreVerifiedSqliteBackup,
  SqliteRestoreError,
} from "@workspace/db/restore";
import {
  loadWorkspaceEnv,
  readOptionValue,
  resolveInvocationDirectory,
} from "./lib/cli-environment";

const USAGE = `Uso:
  pnpm run restore:db -- --source <backup.db> --recovery-output <estado-actual.db> --confirm-stopped [--target <tickets.db>]

Opciones:
  -s, --source             Backup de origen verificado (obligatorio).
  -t, --target             Base destino. Por defecto usa TICKETS_DB_PATH o data/tickets.db.
  -r, --recovery-output    Copia no-clobber del destino actual (obligatoria si existe).
      --confirm-stopped    Confirma que backend, frontend y todo escritor están detenidos.
      --allow-missing-target
                           Permite crear el destino si no existe (recuperación excepcional).
  -h, --help               Muestra esta ayuda.

La restauración valida origen y recovery, consolida un WAL offline, bloquea
restores concurrentes y publica atómicamente sin copiar un archivo parcial.
Nunca ejecutes este comando mientras la aplicación pueda escribir la base.`;

interface CliOptions {
  source?: string;
  target?: string;
  recoveryOutput?: string;
  confirmStopped: boolean;
  allowMissingTarget: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    confirmStopped: false,
    allowMissingTarget: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "-h" || argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument === "-s" || argument === "--source") {
      options.source = readOptionValue(args, ++index, argument);
      continue;
    }
    if (argument === "-t" || argument === "--target") {
      options.target = readOptionValue(args, ++index, argument);
      continue;
    }
    if (argument === "-r" || argument === "--recovery-output") {
      options.recoveryOutput = readOptionValue(args, ++index, argument);
      continue;
    }
    if (argument === "--confirm-stopped") {
      options.confirmStopped = true;
      continue;
    }
    if (argument === "--allow-missing-target") {
      options.allowMissingTarget = true;
      continue;
    }
    throw new Error(`Argumento desconocido: ${argument}`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!options.source) {
    throw new Error(`--source es obligatorio\n\n${USAGE}`);
  }
  if (!options.confirmStopped) {
    throw new Error(`--confirm-stopped es obligatorio\n\n${USAGE}`);
  }

  const invocationDirectory = resolveInvocationDirectory();
  loadWorkspaceEnv(invocationDirectory);
  const sourcePath = path.resolve(invocationDirectory, options.source);
  const targetPath = options.target
    ? path.resolve(invocationDirectory, options.target)
    : resolveDbPath(invocationDirectory);
  const recoveryPath = options.recoveryOutput
    ? path.resolve(invocationDirectory, options.recoveryOutput)
    : undefined;

  const result = await restoreVerifiedSqliteBackup({
    source: sourcePath,
    target: targetPath,
    recoveryOutput: recoveryPath,
    offlineConfirmed: true,
    allowMissingTarget: options.allowMissingTarget,
  });

  console.log("Restauración SQLite completada y verificada");
  console.log(`Origen: ${result.sourcePath}`);
  console.log(`Destino: ${result.targetPath}`);
  console.log(`Recovery previa: ${result.recoveryPath ?? "no correspondía"}`);
  console.log(`Integridad: ${result.integrity}`);
  console.log(`Páginas: ${result.pageCount}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`SHA-256: ${result.sha256}`);
}

main().catch((error: unknown) => {
  if (error instanceof SqliteRestoreError) {
    console.error(`Restauración rechazada [${error.code}]: ${error.message}`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error al restaurar SQLite: ${message}`);
  }
  process.exitCode = 1;
});
