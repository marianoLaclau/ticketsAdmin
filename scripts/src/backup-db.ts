#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  createVerifiedSqliteBackup,
  TICKET_MANAGER_SQLITE_VERIFICATION,
} from "@workspace/db/backup";
import { resolveDbPath } from "@workspace/db/db-path";
import {
  loadWorkspaceEnv,
  readOptionValue,
  resolveInvocationDirectory,
} from "./lib/cli-environment";

const USAGE = `Uso:
  pnpm run backup:db -- --output <archivo.db> [--source <tickets.db>]

Opciones:
  -o, --output  Destino explícito del backup (obligatorio; no se sobrescribe).
  -s, --source  Base de origen. Por defecto usa TICKETS_DB_PATH o data/tickets.db.
  -h, --help    Muestra esta ayuda.

El backup usa la API online de SQLite, por lo que incluye transacciones
confirmadas que todavía estén en el WAL. El archivo solo se publica después
de validar integridad, claves foráneas y el esquema histórico mínimo.`;

interface CliOptions {
  output?: string;
  source?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { help: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    // pnpm puede conservar el separador al reenviar argumentos desde el script raíz.
    if (argument === "--") {
      continue;
    }

    if (argument === "-h" || argument === "--help") {
      options.help = true;
      continue;
    }

    if (argument === "-o" || argument === "--output") {
      options.output = readOptionValue(args, ++index, argument);
      continue;
    }

    if (argument === "-s" || argument === "--source") {
      options.source = readOptionValue(args, ++index, argument);
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

  if (!options.output) {
    throw new Error(`--output es obligatorio\n\n${USAGE}`);
  }

  const invocationDirectory = resolveInvocationDirectory();
  loadWorkspaceEnv(invocationDirectory);

  const sourcePath = options.source
    ? path.resolve(invocationDirectory, options.source)
    : resolveDbPath(invocationDirectory);
  const outputPath = path.resolve(invocationDirectory, options.output);
  const result = await createVerifiedSqliteBackup(
    sourcePath,
    outputPath,
    TICKET_MANAGER_SQLITE_VERIFICATION,
  );

  console.log("Backup SQLite creado y verificado");
  console.log(`Origen: ${result.sourcePath}`);
  console.log(`Destino: ${result.outputPath}`);
  console.log(`Integridad: ${result.integrity}`);
  console.log(`Páginas: ${result.pageCount}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`SHA-256: ${result.sha256}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error al crear el backup: ${message}`);
  process.exitCode = 1;
});
