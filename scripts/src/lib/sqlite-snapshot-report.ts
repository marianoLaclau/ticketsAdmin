import type { SqliteVerificationResult } from "@workspace/db/backup";
import process from "node:process";

export const SQLITE_EVIDENCE_CONTRACT = "ticketsadmin.sqlite-evidence" as const;
export const SQLITE_EVIDENCE_VERSION = 1 as const;
export const SQLITE_EVIDENCE_STORAGE = "sqlite-single-file-v1" as const;

export type SqliteEvidenceOperation = "backup" | "verify";
export type SqliteEvidenceMismatchField =
  "artifact.sha256" | "artifact.bytes" | "artifact.pageCount";

interface SqliteEvidenceEnvelope {
  contract: typeof SQLITE_EVIDENCE_CONTRACT;
  contractVersion: typeof SQLITE_EVIDENCE_VERSION;
  ok: true;
  artifact: {
    path: string;
    storage: typeof SQLITE_EVIDENCE_STORAGE;
    sha256: string;
    bytes: number;
    pageCount: number;
  };
  checks: {
    integrity: "ok";
    foreignKeys: "ok";
    ticketManagerSchema: "ok";
  };
}

export interface SqliteBackupEvidence extends SqliteEvidenceEnvelope {
  operation: "backup";
  sourcePath: string;
  comparison?: never;
}

export interface SqliteVerificationEvidence extends SqliteEvidenceEnvelope {
  operation: "verify";
  sourcePath?: never;
  comparison?: {
    matched: true;
  };
}

export type SqliteEvidence = SqliteBackupEvidence | SqliteVerificationEvidence;

export type SqliteCliErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_EVIDENCE"
  | "EVIDENCE_MISMATCH"
  | "VERIFICATION_FAILED"
  | "BACKUP_FAILED"
  | "INTERNAL_ERROR";

export class SqliteCliError extends Error {
  constructor(
    readonly code: SqliteCliErrorCode,
    message: string,
    readonly exitCode: 1 | 2 | 3,
    readonly fields?: readonly SqliteEvidenceMismatchField[],
  ) {
    super(message);
    this.name = "SqliteCliError";
  }
}

export function createSqliteEvidence(
  operation: "backup",
  artifactPath: string,
  result: SqliteVerificationResult,
  options: { sourcePath: string },
): SqliteBackupEvidence;
export function createSqliteEvidence(
  operation: "verify",
  artifactPath: string,
  result: SqliteVerificationResult,
  options?: { matchedExpected?: boolean },
): SqliteVerificationEvidence;
export function createSqliteEvidence(
  operation: SqliteEvidenceOperation,
  artifactPath: string,
  result: SqliteVerificationResult,
  options: { sourcePath?: string; matchedExpected?: boolean } = {},
): SqliteEvidence {
  const envelope: SqliteEvidenceEnvelope = {
    contract: SQLITE_EVIDENCE_CONTRACT,
    contractVersion: SQLITE_EVIDENCE_VERSION,
    ok: true,
    artifact: {
      path: artifactPath,
      storage: SQLITE_EVIDENCE_STORAGE,
      sha256: result.sha256,
      bytes: result.bytes,
      pageCount: result.pageCount,
    },
    checks: {
      integrity: result.integrity,
      foreignKeys: "ok",
      ticketManagerSchema: "ok",
    },
  };

  if (operation === "backup") {
    if (!options.sourcePath) {
      throw new SqliteCliError(
        "INTERNAL_ERROR",
        "No se pudo construir la evidencia del backup",
        1,
      );
    }
    return {
      ...envelope,
      operation,
      sourcePath: options.sourcePath,
    };
  }

  return {
    ...envelope,
    operation,
    ...(options.matchedExpected ? { comparison: { matched: true } } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveSafeInteger(value: unknown, description: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      `La evidencia contiene ${description} inválido`,
      2,
    );
  }
  return Number(value);
}

/** Parses evidence emitted by backup-db --json. Extra v1 fields are ignored. */
export function parseBackupEvidence(value: unknown): SqliteBackupEvidence {
  if (!isRecord(value)) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia no es un objeto JSON",
      2,
    );
  }
  if (
    value.contract !== SQLITE_EVIDENCE_CONTRACT ||
    value.contractVersion !== SQLITE_EVIDENCE_VERSION
  ) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "El contrato de evidencia SQLite no está soportado",
      2,
    );
  }
  if (value.ok !== true || value.operation !== "backup") {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia no corresponde a un backup exitoso",
      2,
    );
  }
  if (typeof value.sourcePath !== "string" || value.sourcePath.length === 0) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia no contiene un origen válido",
      2,
    );
  }
  if (!isRecord(value.artifact)) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia no contiene un artefacto válido",
      2,
    );
  }
  if (
    typeof value.artifact.path !== "string" ||
    value.artifact.path.length === 0 ||
    value.artifact.storage !== SQLITE_EVIDENCE_STORAGE ||
    typeof value.artifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.artifact.sha256)
  ) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia contiene una identidad de artefacto inválida",
      2,
    );
  }
  if (
    !isRecord(value.checks) ||
    value.checks.integrity !== "ok" ||
    value.checks.foreignKeys !== "ok" ||
    value.checks.ticketManagerSchema !== "ok"
  ) {
    throw new SqliteCliError(
      "INVALID_EVIDENCE",
      "La evidencia no confirma todas las verificaciones requeridas",
      2,
    );
  }

  return {
    contract: SQLITE_EVIDENCE_CONTRACT,
    contractVersion: SQLITE_EVIDENCE_VERSION,
    ok: true,
    operation: "backup",
    sourcePath: value.sourcePath,
    artifact: {
      path: value.artifact.path,
      storage: SQLITE_EVIDENCE_STORAGE,
      sha256: value.artifact.sha256,
      bytes: readPositiveSafeInteger(value.artifact.bytes, "un tamaño"),
      pageCount: readPositiveSafeInteger(
        value.artifact.pageCount,
        "un conteo de páginas",
      ),
    },
    checks: {
      integrity: "ok",
      foreignKeys: "ok",
      ticketManagerSchema: "ok",
    },
  };
}

export function assertEvidenceMatches(
  actual: SqliteVerificationResult,
  expected: SqliteBackupEvidence,
): void {
  const fields: SqliteEvidenceMismatchField[] = [];

  if (actual.sha256 !== expected.artifact.sha256) {
    fields.push("artifact.sha256");
  }
  if (actual.bytes !== expected.artifact.bytes) {
    fields.push("artifact.bytes");
  }
  if (actual.pageCount !== expected.artifact.pageCount) {
    fields.push("artifact.pageCount");
  }

  if (fields.length > 0) {
    throw new SqliteCliError(
      "EVIDENCE_MISMATCH",
      "La copia no coincide con la evidencia original",
      3,
      fields,
    );
  }
}

function oneLine(message: string): string {
  // eslint-disable-next-line no-control-regex -- Sanea deliberadamente caracteres de control antes de escribir la CLI.
  return message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

export function writeSqliteCliError(
  operation: SqliteEvidenceOperation,
  error: unknown,
  json: boolean,
): void {
  const normalized =
    error instanceof SqliteCliError
      ? error
      : new SqliteCliError(
          "INTERNAL_ERROR",
          "La operación SQLite falló de forma inesperada",
          1,
        );

  const message = oneLine(normalized.message) || "La operación SQLite falló";
  if (json) {
    console.error(
      JSON.stringify({
        contract: SQLITE_EVIDENCE_CONTRACT,
        contractVersion: SQLITE_EVIDENCE_VERSION,
        ok: false,
        operation,
        error: {
          code: normalized.code,
          message,
          ...(normalized.fields ? { fields: normalized.fields } : {}),
        },
      }),
    );
  } else {
    console.error(
      `${operation === "backup" ? "Error al crear el backup" : "Error al verificar el snapshot"}: ${message}`,
    );
  }
  process.exitCode = normalized.exitCode;
}
