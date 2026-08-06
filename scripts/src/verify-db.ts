#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  TICKET_MANAGER_SQLITE_VERIFICATION,
  verifySqliteFile,
} from "@workspace/db/backup";
import {
  assertEvidenceMatches,
  createSqliteEvidence,
  parseBackupEvidence,
  SqliteCliError,
  writeSqliteCliError,
} from "./lib/sqlite-snapshot-report";
import {
  readOptionValue,
  resolveInvocationDirectory,
} from "./lib/cli-environment";

const USAGE = `Uso humano:
  pnpm run verify:db -- --source <snapshot.db> [--expect-evidence <backup.json>]

Automatización (JSON puro desde el bundle):
  node dist/verify-db.mjs --source <snapshot.db> [--expect-evidence <backup.json>] --json

Opciones:
  -s, --source         Snapshot SQLite autocontenido que se verificará (obligatorio).
      --expect-evidence  JSON emitido por backup-db.mjs --json; exige coincidencia exacta.
      --json           Solo para el bundle: una línea JSON en stdout o stderr.
  -h, --help           Muestra esta ayuda.

La verificación abre el archivo en modo readonly, rechaza WAL/sidecars y valida
integridad, claves foráneas, esquema histórico mínimo, bytes y SHA-256.`;

interface CliOptions {
  source?: string;
  expectedResult?: string;
  json: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false, help: false };

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
    if (argument === "--expect-evidence") {
      try {
        options.expectedResult = readOptionValue(args, ++index, argument);
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

function readExpectedReport(filePath: string) {
  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "No se pudo leer la evidencia esperada",
      2,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia esperada no contiene JSON válido",
      2,
    );
  }
  return parseBackupEvidence(parsed);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!options.source) {
    throw new SqliteCliError("INVALID_ARGUMENT", "--source es obligatorio", 2);
  }

  const invocationDirectory = resolveInvocationDirectory();
  const sourcePath = path.resolve(invocationDirectory, options.source);
  let result: ReturnType<typeof verifySqliteFile>;
  try {
    result = verifySqliteFile(sourcePath, TICKET_MANAGER_SQLITE_VERIFICATION);
  } catch (error) {
    throw new SqliteCliError(
      "VERIFICATION_FAILED",
      error instanceof Error ? error.message : String(error),
      3,
    );
  }

  if (options.expectedResult) {
    const expectedPath = path.resolve(
      invocationDirectory,
      options.expectedResult,
    );
    assertEvidenceMatches(result, readExpectedReport(expectedPath));
  }

  const evidence = createSqliteEvidence("verify", sourcePath, result, {
    matchedExpected: Boolean(options.expectedResult),
  });
  if (options.json) {
    console.log(JSON.stringify(evidence));
    return;
  }

  console.log("Snapshot SQLite verificado");
  console.log(`Origen: ${evidence.artifact.path}`);
  console.log(`Integridad: ${evidence.checks.integrity}`);
  console.log(`Páginas: ${evidence.artifact.pageCount}`);
  console.log(`Bytes: ${evidence.artifact.bytes}`);
  console.log(`SHA-256: ${evidence.artifact.sha256}`);
}

const jsonRequested = process.argv.slice(2).includes("--json");
try {
  main();
} catch (error) {
  writeSqliteCliError("verify", error, jsonRequested);
}
