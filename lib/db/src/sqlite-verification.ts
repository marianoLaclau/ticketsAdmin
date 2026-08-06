import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SQLITE_RUNTIME_SUFFIXES, pathEntryExists } from "./sqlite-files";

export interface SqliteVerificationOptions {
  checkForeignKeys?: boolean;
  requiredColumns?: Readonly<Record<string, readonly string[]>>;
  requiredTables?: readonly string[];
}

export interface SqliteVerificationResult {
  integrity: "ok";
  pageCount: number;
  bytes: number;
  sha256: string;
}

/**
 * Oldest application shape that remains a valid migration source. The Drizzle
 * ledger is intentionally not required because local databases may have been
 * created with `drizzle-kit push`.
 */
export const TICKET_MANAGER_SQLITE_VERIFICATION = {
  checkForeignKeys: true,
  requiredTables: ["tickets", "seguimientos"],
  requiredColumns: {
    tickets: [
      "id",
      "conversation_id",
      "hora",
      "nombre",
      "apellido",
      "motivo",
      "fecha_creacion",
    ],
    seguimientos: ["id", "ticket_id", "nota", "fecha_creacion"],
  },
} as const satisfies SqliteVerificationOptions;

function assertRequiredColumns(
  database: Database.Database,
  requiredColumns: Readonly<Record<string, readonly string[]>>,
): void {
  const readColumns = database.prepare(
    "SELECT name FROM pragma_table_info(?) ORDER BY cid",
  );

  for (const [table, expectedColumns] of Object.entries(requiredColumns)) {
    const presentColumns = new Set(
      (readColumns.all(table) as Array<{ name: string }>).map(
        ({ name }) => name,
      ),
    );
    const missing = expectedColumns.filter(
      (column) => !presentColumns.has(column),
    );
    if (missing.length > 0) {
      throw new Error(
        `La tabla ${table} no tiene las columnas requeridas: ${missing.join(", ")}`,
      );
    }
  }
}

function assertRequiredTables(
  database: Database.Database,
  requiredTables: readonly string[],
): void {
  if (requiredTables.length === 0) {
    return;
  }

  const findTable = database.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1",
  );
  const missing = requiredTables.filter((table) => !findTable.get(table));
  if (missing.length > 0) {
    throw new Error(
      `La base no corresponde a la aplicación; faltan tablas requeridas: ${missing.join(", ")}`,
    );
  }
}

function calculateSha256(filePath: string): string {
  const hash = createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }

  return hash.digest("hex");
}

function presentRuntimeSidecars(databasePath: string): string[] {
  return SQLITE_RUNTIME_SUFFIXES.map(
    (suffix) => `${databasePath}${suffix}`,
  ).filter(pathEntryExists);
}

function assertNoRuntimeSidecars(databasePath: string): void {
  const present = presentRuntimeSidecars(databasePath);
  if (present.length > 0) {
    throw new Error(
      `El snapshot no es autocontenido; conserva sidecars SQLite: ${present.join(", ")}`,
    );
  }
}

function assertRollbackJournalHeader(databasePath: string): void {
  const descriptor = fs.openSync(databasePath, "r");
  const header = Buffer.alloc(20);
  let bytesRead: number;
  try {
    bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }

  const sqliteSignature = "SQLite format 3\0";
  if (
    bytesRead >= header.length &&
    header.subarray(0, 16).toString("binary") === sqliteSignature &&
    (header[18] === 2 || header[19] === 2)
  ) {
    throw new Error(
      "El snapshot conserva journal mode WAL y no es un archivo autocontenido",
    );
  }
}

/** Converts a private SQLite candidate into a closed single-file snapshot. */
export function normalizeSqliteSnapshotForPublication(input: string): void {
  const databasePath = path.resolve(input);
  readRegularFileStat(databasePath, "El candidato a normalizar");
  assertNoRuntimeSidecars(databasePath);

  const database = new Database(databasePath, {
    fileMustExist: true,
    timeout: 5_000,
  });
  try {
    const journalMode = database.pragma("journal_mode = DELETE", {
      simple: true,
    });
    if (
      typeof journalMode !== "string" ||
      journalMode.toLowerCase() !== "delete"
    ) {
      throw new Error(
        `SQLite no pudo normalizar el snapshot a journal DELETE: ${String(journalMode)}`,
      );
    }
  } finally {
    database.close();
  }

  assertNoRuntimeSidecars(databasePath);
  assertRollbackJournalHeader(databasePath);
}

function assertFileUnchanged(
  before: fs.BigIntStats,
  after: fs.BigIntStats,
  filePath: string,
): void {
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  ) {
    throw new Error(
      `La base cambió mientras se verificaba y no es un snapshot estable: ${filePath}`,
    );
  }
}

function readRegularFileStat(
  filePath: string,
  description: string,
): fs.BigIntStats {
  const stat = fs.statSync(filePath, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat?.isFile()) {
    throw new Error(`${description} no existe o no es un archivo: ${filePath}`);
  }
  if (stat.ino === 0n) {
    throw new Error(
      `${description} está en un filesystem que no expone una identidad de archivo estable: ${filePath}`,
    );
  }
  return stat;
}

/** Verifies a closed SQLite snapshot without modifying it. */
export function verifySqliteFile(
  input: string,
  options: SqliteVerificationOptions = {},
): SqliteVerificationResult {
  const databasePath = path.resolve(input);
  const initialStat = readRegularFileStat(databasePath, "La base a verificar");
  assertNoRuntimeSidecars(databasePath);
  assertRollbackJournalHeader(databasePath);
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });

  let pageCount: number;
  try {
    const integrityResult = database.pragma("integrity_check", {
      simple: true,
    });
    if (integrityResult !== "ok") {
      throw new Error(
        `La copia no pasó integrity_check: ${String(integrityResult)}`,
      );
    }

    if (
      options.checkForeignKeys &&
      database.prepare("PRAGMA foreign_key_check").get()
    ) {
      throw new Error(
        "La copia contiene al menos una violación de claves foráneas",
      );
    }

    assertRequiredTables(database, options.requiredTables ?? []);
    assertRequiredColumns(database, options.requiredColumns ?? {});

    const pageCountResult = database.pragma("page_count", { simple: true });
    if (typeof pageCountResult !== "number") {
      throw new Error(
        `SQLite devolvió un page_count inválido: ${String(pageCountResult)}`,
      );
    }
    pageCount = pageCountResult;
  } finally {
    database.close();
  }

  assertNoRuntimeSidecars(databasePath);
  const sha256 = calculateSha256(databasePath);
  const finalStat = readRegularFileStat(databasePath, "La base verificada");
  assertFileUnchanged(initialStat, finalStat, databasePath);
  assertNoRuntimeSidecars(databasePath);

  return {
    integrity: "ok",
    pageCount,
    bytes: Number(finalStat.size),
    sha256,
  };
}
