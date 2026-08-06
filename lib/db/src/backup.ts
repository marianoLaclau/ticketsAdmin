import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import {
  areSameExistingFile,
  areRelatedSqliteArtifactPaths,
  assertRegularFile,
  createPrivateFile,
  createPrivateStagingDirectory,
  pathEntryExists,
  removePrivateStagingDirectory,
  resolveExistingPath,
  resolvePotentialPath,
  syncDirectory,
  syncFile,
} from "./sqlite-files";
import {
  normalizeSqliteSnapshotForPublication,
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
  const requestedSourcePath = path.resolve(source);
  assertRegularFile(requestedSourcePath, "La base de origen");
  const sourcePath = resolveExistingPath(requestedSourcePath);
  const outputPath = resolvePotentialPath(output);

  if (
    areSameExistingFile(sourcePath, outputPath) ||
    areRelatedSqliteArtifactPaths(sourcePath, outputPath)
  ) {
    throw new Error("El destino del backup no puede ser la base de origen");
  }

  if (pathEntryExists(outputPath)) {
    throw new Error(`El destino ya existe; elegí otro nombre: ${outputPath}`);
  }

  const outputDirectory = path.dirname(outputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const staging = createPrivateStagingDirectory(
    outputDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.staging-`,
  );
  const temporaryPath = path.join(staging.path, "snapshot.partial");

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

    // SQLite backup inherits the source journal mode. Normalize the isolated
    // destination before verification so the published snapshot never needs
    // adjacent WAL/SHM files to represent committed data.
    normalizeSqliteSnapshotForPublication(temporaryPath);

    // Preserve the invariant even if a filesystem altered the requested mode;
    // Windows still needs appropriate directory ACLs.
    fs.chmodSync(temporaryPath, 0o600);
    const result = verifySqliteFile(temporaryPath, verification);
    syncFile(temporaryPath);

    // No-clobber publication: the hard link fails atomically if another
    // process created the destination while the snapshot was being checked.
    fs.linkSync(temporaryPath, outputPath);
    syncDirectory(outputDirectory);
    fs.unlinkSync(temporaryPath);
    syncDirectory(outputDirectory);

    return {
      sourcePath,
      outputPath,
      ...result,
    };
  } finally {
    sourceDatabase?.close();
    removePrivateStagingDirectory(staging, ["snapshot.partial"]);
  }
}

export { verifySqliteFile } from "./sqlite-verification";
export type {
  SqliteVerificationOptions,
  SqliteVerificationResult,
} from "./sqlite-verification";
export { TICKET_MANAGER_SQLITE_VERIFICATION } from "./sqlite-verification";
