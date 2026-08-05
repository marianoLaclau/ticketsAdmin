import path from "node:path";
import Database from "better-sqlite3";
import { assertRegularFile } from "./sqlite-files";

export interface SqliteVerificationOptions {
  checkForeignKeys?: boolean;
  requiredColumns?: Readonly<Record<string, readonly string[]>>;
  requiredTables?: readonly string[];
}

export interface SqliteVerificationResult {
  integrity: "ok";
  pageCount: number;
  bytes: number;
}

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

/** Verifies a closed SQLite snapshot without modifying it. */
export function verifySqliteFile(
  input: string,
  options: SqliteVerificationOptions = {},
): SqliteVerificationResult {
  const databasePath = path.resolve(input);
  const stat = assertRegularFile(databasePath, "La base a verificar");
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });

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

    const pageCount = database.pragma("page_count", { simple: true });
    if (typeof pageCount !== "number") {
      throw new Error(
        `SQLite devolvió un page_count inválido: ${String(pageCount)}`,
      );
    }

    return {
      integrity: "ok",
      pageCount,
      bytes: stat.size,
    };
  } finally {
    database.close();
  }
}
