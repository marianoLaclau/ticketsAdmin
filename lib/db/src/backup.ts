import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import {
  areSameExistingFile,
  assertRegularFile,
  createPrivateFile,
  createPrivateStagingDirectory,
  pathEntryExists,
  removeSqliteArtifacts,
  syncDirectory,
  syncFile,
} from "./sqlite-files";
import {
  verifySqliteFile,
  type SqliteVerificationOptions,
  type SqliteVerificationResult,
} from "./sqlite-verification";

export interface SqliteBackupResult extends SqliteVerificationResult {
  sourcePath: string;
  outputPath: string;
}

/**
 * Creates a transactionally consistent SQLite backup, including committed
 * pages that are still in the source WAL. The destination is never
 * overwritten and is only published after all requested checks succeed.
 */
export async function createVerifiedSqliteBackup(
  source: string,
  output: string,
  verification: SqliteVerificationOptions = {},
): Promise<SqliteBackupResult> {
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(output);

  if (areSameExistingFile(sourcePath, outputPath)) {
    throw new Error("El destino del backup no puede ser la base de origen");
  }

  assertRegularFile(sourcePath, "La base de origen");

  if (pathEntryExists(outputPath)) {
    throw new Error(`El destino ya existe; elegí otro nombre: ${outputPath}`);
  }

  const outputDirectory = path.dirname(outputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const stagingDirectory = createPrivateStagingDirectory(
    outputDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.staging-`,
  );
  const temporaryPath = path.join(stagingDirectory, "snapshot.partial");

  let sourceDatabase: Database.Database | undefined;

  try {
    // Create the sensitive path with restrictive permissions before SQLite
    // writes its first page. Applying chmod only after backup() would expose a
    // world-readable partial whenever the process umask is permissive.
    createPrivateFile(temporaryPath);

    sourceDatabase = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
    await sourceDatabase.backup(temporaryPath);
    sourceDatabase.close();
    sourceDatabase = undefined;

    // Preserve the invariant even if a filesystem altered the requested mode;
    // Windows still needs appropriate directory ACLs.
    fs.chmodSync(temporaryPath, 0o600);
    const result = verifySqliteFile(temporaryPath, verification);
    syncFile(temporaryPath);

    // No-clobber publication: the hard link fails atomically if another
    // process created the destination while the snapshot was being checked.
    fs.linkSync(temporaryPath, outputPath);
    syncDirectory(outputDirectory);
    fs.rmSync(temporaryPath);
    syncDirectory(outputDirectory);

    return {
      sourcePath,
      outputPath,
      ...result,
    };
  } finally {
    sourceDatabase?.close();
    removeSqliteArtifacts(temporaryPath);
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export { verifySqliteFile } from "./sqlite-verification";
export type {
  SqliteVerificationOptions,
  SqliteVerificationResult,
} from "./sqlite-verification";
