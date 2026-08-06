#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  createVerifiedSqliteBackup,
  TICKET_MANAGER_SQLITE_VERIFICATION,
  verifySqliteFile,
} from "@workspace/db/backup";
import { resolveDbPath } from "@workspace/db/db-path";
import {
  loadWorkspaceEnv,
  readOptionValue,
  resolveInvocationDirectory,
} from "./lib/cli-environment";
import {
  assertEvidenceMatches,
  createSqliteEvidence,
  SqliteCliError,
  writeSqliteCliError,
} from "./lib/sqlite-snapshot-report";

const USAGE = `Uso humano:
  pnpm run backup:db -- --output <archivo.db> [--source <tickets.db>]

Automatización (JSON puro desde el bundle):
  node dist/backup-db.mjs --output <archivo.db> [--source <tickets.db>] --json

Opciones:
  -o, --output  Destino explícito del backup (obligatorio; no se sobrescribe).
  -s, --source  Base de origen. Por defecto usa TICKETS_DB_PATH o data/tickets.db.
      --json    Solo para el bundle: una línea JSON en stdout o stderr.
  -h, --help    Muestra esta ayuda.

El backup usa la API online de SQLite, por lo que incluye transacciones
confirmadas que todavía estén en el WAL. El archivo solo se publica después
de validar integridad, claves foráneas y el esquema histórico mínimo.`;

interface CliOptions {
  output?: string;
  source?: string;
  json: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false, help: false };

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
      try {
        options.output = readOptionValue(args, ++index, argument);
      } catch (error) {
        throw new SqliteCliError(
          "INVALID_ARGUMENT",
          error instanceof Error ? error.message : String(error),
          2,
        );
      }
      continue;
    }

    if (argument === "-s" || argument === "--source") {
      try {
        options.source = readOptionValue(args, ++index, argument);
      } catch (error) {
        throw new SqliteCliError(
          "INVALID_ARGUMENT",
          error instanceof Error ? error.message : String(error),
          2,
        );
      }
      continue;
    }

    if (argument === "--json") {
      options.json = true;
      continue;
    }

    throw new SqliteCliError(
      "INVALID_ARGUMENT",
      `Argumento desconocido: ${argument}`,
      2,
    );
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
    throw new SqliteCliError("INVALID_ARGUMENT", "--output es obligatorio", 2);
  }

  const invocationDirectory = resolveInvocationDirectory();
  loadWorkspaceEnv(invocationDirectory);

  const sourcePath = options.source
    ? path.resolve(invocationDirectory, options.source)
    : resolveDbPath(invocationDirectory);
  const outputPath = path.resolve(invocationDirectory, options.output);
  let result: Awaited<ReturnType<typeof createVerifiedSqliteBackup>>;
  try {
    result = await createVerifiedSqliteBackup(
      sourcePath,
      outputPath,
      TICKET_MANAGER_SQLITE_VERIFICATION,
    );
  } catch (error) {
    throw new SqliteCliError(
      "BACKUP_FAILED",
      error instanceof Error ? error.message : String(error),
      1,
    );
  }

  // Reopen the published pathname instead of trusting only the private
  // staging verification. This is the evidence transported by docker cp.
  let publishedResult: ReturnType<typeof verifySqliteFile>;
  try {
    publishedResult = verifySqliteFile(
      result.outputPath,
      TICKET_MANAGER_SQLITE_VERIFICATION,
    );
  } catch (error) {
    throw new SqliteCliError(
      "BACKUP_FAILED",
      error instanceof Error ? error.message : String(error),
      1,
    );
  }
  try {
    assertEvidenceMatches(
      publishedResult,
      createSqliteEvidence("backup", result.outputPath, result, {
        sourcePath: result.sourcePath,
      }),
    );
  } catch {
    throw new SqliteCliError(
      "BACKUP_FAILED",
      "El backup publicado cambió después de su verificación inicial",
      1,
    );
  }

  const evidence = createSqliteEvidence(
    "backup",
    result.outputPath,
    publishedResult,
    { sourcePath: result.sourcePath },
  );
  if (options.json) {
    console.log(JSON.stringify(evidence));
    return;
  }

  console.log("Backup SQLite creado y verificado");
  console.log(`Origen: ${evidence.sourcePath}`);
  console.log(`Destino: ${evidence.artifact.path}`);
  console.log(`Integridad: ${evidence.checks.integrity}`);
  console.log(`Páginas: ${evidence.artifact.pageCount}`);
  console.log(`Bytes: ${evidence.artifact.bytes}`);
  console.log(`SHA-256: ${evidence.artifact.sha256}`);
}

const jsonRequested = process.argv.slice(2).includes("--json");
main().catch((error: unknown) => {
  writeSqliteCliError("backup", error, jsonRequested);
});
