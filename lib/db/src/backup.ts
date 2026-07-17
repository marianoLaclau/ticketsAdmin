import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

export interface SqliteBackupResult {
  sourcePath: string;
  outputPath: string;
  integrity: "ok";
  pageCount: number;
  bytes: number;
}

function areSamePath(first: string, second: string): boolean {
  if (process.platform === "win32") {
    return first.toLocaleLowerCase("en-US") === second.toLocaleLowerCase("en-US");
  }
  return first === second;
}

function removeTemporaryArtifacts(databasePath: string): void {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

/**
 * Creates a transactionally consistent SQLite backup, including committed
 * pages that are still in the source WAL. The destination is never
 * overwritten and is only published after PRAGMA integrity_check succeeds.
 */
export async function createVerifiedSqliteBackup(
  source: string,
  output: string,
): Promise<SqliteBackupResult> {
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(output);

  if (areSamePath(sourcePath, outputPath)) {
    throw new Error("El destino del backup no puede ser la base de origen");
  }

  const sourceStat = fs.statSync(sourcePath, { throwIfNoEntry: false });
  if (!sourceStat?.isFile()) {
    throw new Error(`La base de origen no existe o no es un archivo: ${sourcePath}`);
  }

  if (fs.existsSync(outputPath)) {
    throw new Error(`El destino ya existe; elegí otro nombre: ${outputPath}`);
  }

  const outputDirectory = path.dirname(outputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });

  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.partial`,
  );

  let sourceDatabase: Database.Database | undefined;

  try {
    sourceDatabase = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
    await sourceDatabase.backup(temporaryPath);
    sourceDatabase.close();
    sourceDatabase = undefined;

    const backupDatabase = new Database(temporaryPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });

    let integrityResult: unknown;
    let pageCount: unknown;
    try {
      integrityResult = backupDatabase.pragma("integrity_check", { simple: true });
      pageCount = backupDatabase.pragma("page_count", { simple: true });
    } finally {
      backupDatabase.close();
    }

    if (integrityResult !== "ok") {
      throw new Error(`La copia no pasó integrity_check: ${String(integrityResult)}`);
    }
    if (typeof pageCount !== "number") {
      throw new Error(`SQLite devolvió un page_count inválido: ${String(pageCount)}`);
    }

    // Publicación sin sobrescritura: el hard link falla atómicamente si otro
    // proceso creó el destino mientras se generaba/verificaba el backup.
    fs.linkSync(temporaryPath, outputPath);
    fs.rmSync(temporaryPath);

    return {
      sourcePath,
      outputPath,
      integrity: "ok",
      pageCount,
      bytes: fs.statSync(outputPath).size,
    };
  } finally {
    sourceDatabase?.close();
    removeTemporaryArtifacts(temporaryPath);
  }
}
