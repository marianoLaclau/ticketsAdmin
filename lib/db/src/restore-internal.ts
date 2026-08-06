import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { createVerifiedSqliteBackup } from "./backup";
import {
  SQLITE_RUNTIME_SUFFIXES,
  areRelatedSqliteArtifactPaths,
  areSameExistingFile,
  areSamePath,
  assertRegularFile,
  createPrivateStagingDirectory,
  pathEntryExists,
  removePrivateStagingDirectory,
  resolveExistingPath,
  resolvePotentialPath,
  syncDirectory,
} from "./sqlite-files";
import {
  SqliteRestoreError,
  type RestoreVerifiedSqliteOptions,
  type SqliteRestoreResult,
} from "./restore-types";
import {
  TICKET_MANAGER_SQLITE_VERIFICATION,
  verifySqliteFile,
  type SqliteVerificationOptions,
  type SqliteVerificationResult,
} from "./sqlite-verification";

export interface SqliteRestoreRuntime {
  /** @internal Deterministic synchronization used by the restore suite. */
  afterLockAcquired?: () => void | Promise<void>;
  /** @internal Deterministic race injection used by the restore suite. */
  beforePublish?: () => void | Promise<void>;
  /** @internal Deterministic fault injection used by the restore suite. */
  afterPublish?: () => void | Promise<void>;
  /** @internal Deterministic fault injection used by the restore suite. */
  beforeRollbackPublish?: () => void | Promise<void>;
}

interface FileIdentity {
  dev: bigint;
  ino: bigint;
}

interface AcquiredRestoreLock {
  descriptor: number;
  identity: FileIdentity;
}

interface PreparedRecovery {
  identity: FileIdentity;
  snapshot: SqliteVerificationResult;
}

interface ValidatedRestorePaths {
  sourcePath: string;
  targetPath: string;
  targetDirectory: string;
  targetStat: fs.Stats | null;
  targetIdentity: FileIdentity | null;
  recoveryPath: string | null;
  lockPath: string;
}

function invalidPath(message: string, cause?: unknown): SqliteRestoreError {
  return new SqliteRestoreError("INVALID_RESTORE_PATH", message, {
    cause,
  });
}

function targetChanged(message: string, cause?: unknown): SqliteRestoreError {
  return new SqliteRestoreError("TARGET_CHANGED", message, { cause });
}

function fileIdentity(stat: fs.BigIntStats): FileIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function identitiesMatch(first: FileIdentity, second: FileIdentity): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

function readRegularFileIdentity(filePath: string): FileIdentity | null {
  const stat = fs.lstatSync(filePath, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.ino === 0n) {
    return null;
  }
  return fileIdentity(stat);
}

function requireRegularFileIdentity(
  filePath: string,
  description: string,
): FileIdentity {
  const identity = readRegularFileIdentity(filePath);
  if (!identity) {
    throw targetChanged(`${description} dejó de ser un archivo regular`);
  }
  return identity;
}

function assertPathIdentity(
  filePath: string,
  expected: FileIdentity,
  description: string,
): void {
  const current = readRegularFileIdentity(filePath);
  if (!current || !identitiesMatch(current, expected)) {
    throw targetChanged(
      `${description} cambió durante la restauración; se abortó para no sobrescribir datos ajenos`,
    );
  }
}

function validateRestorePaths(
  options: RestoreVerifiedSqliteOptions,
): ValidatedRestorePaths {
  if (options.offlineConfirmed !== true) {
    throw new SqliteRestoreError(
      "OFFLINE_CONFIRMATION_REQUIRED",
      "La restauración exige confirmar que backend, frontend y todo escritor de SQLite están detenidos",
    );
  }

  const requestedSourcePath = path.resolve(options.source);
  let sourcePath: string;
  try {
    assertRegularFile(requestedSourcePath, "El backup de origen");
    sourcePath = resolveExistingPath(requestedSourcePath);
  } catch (error) {
    throw invalidPath(
      "El backup de origen no es un archivo SQLite accesible",
      error,
    );
  }

  let targetPath: string;
  try {
    targetPath = resolvePotentialPath(options.target);
  } catch (error) {
    throw invalidPath("No se pudo resolver la ruta de la base destino", error);
  }
  const targetDirectory = path.dirname(targetPath);
  const lockPath = `${targetPath}.restore.lock`;

  if (
    areSameExistingFile(sourcePath, targetPath) ||
    areRelatedSqliteArtifactPaths(sourcePath, targetPath)
  ) {
    throw invalidPath(
      "El backup de origen y la base destino deben usar rutas SQLite independientes",
    );
  }

  const targetEntry = fs.lstatSync(targetPath, { throwIfNoEntry: false });
  if (targetEntry?.isSymbolicLink()) {
    throw invalidPath("La base destino no puede ser un enlace simbólico");
  }
  if (targetEntry && !targetEntry.isFile()) {
    throw invalidPath("La base destino debe ser un archivo regular");
  }

  const targetStat = targetEntry ?? null;
  const targetIdentity = targetStat
    ? readRegularFileIdentity(targetPath)
    : null;
  if (targetStat && !targetIdentity) {
    throw invalidPath(
      "No se pudo capturar una identidad estable de la base destino",
    );
  }
  if (!targetStat && !options.allowMissingTarget) {
    throw new SqliteRestoreError(
      "TARGET_NOT_FOUND",
      "La base destino no existe; corregí la ruta o habilitá explícitamente una restauración sobre destino ausente",
    );
  }

  let recoveryPath: string | null = null;
  if (options.recoveryOutput) {
    try {
      recoveryPath = resolvePotentialPath(options.recoveryOutput);
    } catch (error) {
      throw invalidPath("No se pudo resolver la ruta de recovery", error);
    }
  }

  if (targetStat && !recoveryPath) {
    throw new SqliteRestoreError(
      "RECOVERY_REQUIRED",
      "La copia de recuperación es obligatoria cuando la base destino ya existe",
    );
  }
  if (!targetStat && recoveryPath) {
    throw invalidPath(
      "No corresponde indicar una copia de recuperación cuando la base destino todavía no existe",
    );
  }

  if (recoveryPath) {
    if (
      areSameExistingFile(recoveryPath, sourcePath) ||
      areSameExistingFile(recoveryPath, targetPath) ||
      areSamePath(recoveryPath, lockPath) ||
      areRelatedSqliteArtifactPaths(recoveryPath, sourcePath) ||
      areRelatedSqliteArtifactPaths(recoveryPath, targetPath)
    ) {
      throw invalidPath(
        "Origen, destino, recovery y lock deben usar rutas independientes",
      );
    }
    if (pathEntryExists(recoveryPath)) {
      throw new SqliteRestoreError(
        "RECOVERY_ALREADY_EXISTS",
        `La copia de recuperación ya existe y nunca se sobrescribe: ${recoveryPath}`,
      );
    }
  }

  if (areSamePath(sourcePath, lockPath)) {
    throw invalidPath(
      "El backup de origen no puede ocupar la ruta del lock de restauración",
    );
  }

  return {
    sourcePath,
    targetPath,
    targetDirectory,
    targetStat,
    targetIdentity,
    recoveryPath,
    lockPath,
  };
}

function restoreLockLost(message: string): SqliteRestoreError {
  return new SqliteRestoreError("RESTORE_LOCK_LOST", message);
}

function assertOwnedRestoreLock(
  lockPath: string,
  expected: FileIdentity,
): void {
  const current = readRegularFileIdentity(lockPath);
  if (!current || !identitiesMatch(current, expected)) {
    throw restoreLockLost(
      "El lock de restauración fue retirado o reemplazado durante la operación",
    );
  }
}

function removeRestoreLockIfOwned(
  lockPath: string,
  expected: FileIdentity,
): void {
  const current = readRegularFileIdentity(lockPath);
  if (current && identitiesMatch(current, expected)) {
    fs.unlinkSync(lockPath);
  }
}

function acquireRestoreLock(lockPath: string): AcquiredRestoreLock {
  let descriptor: number | undefined;
  let identity: FileIdentity | undefined;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
    const lockStat = fs.fstatSync(descriptor, { bigint: true });
    if (lockStat.ino === 0n) {
      throw restoreLockLost(
        "El filesystem no expone una identidad estable para el lock de restauración",
      );
    }
    identity = fileIdentity(lockStat);
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    fs.fsyncSync(descriptor);
    assertOwnedRestoreLock(lockPath, identity);
    return { descriptor, identity };
  } catch (error) {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      if (identity) {
        removeRestoreLockIfOwned(lockPath, identity);
      }
    }
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new SqliteRestoreError(
        "RESTORE_LOCKED",
        `Ya existe otra restauración o un lock pendiente de revisión: ${lockPath}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function checkpointTargetWal(targetPath: string): void {
  let database: Database.Database | undefined;
  try {
    database = new Database(targetPath, {
      fileMustExist: true,
      timeout: 1_000,
    });
    database.pragma("busy_timeout = 1000");
    const rows = database.pragma("wal_checkpoint(TRUNCATE)") as Array<{
      busy?: number;
      checkpointed?: number;
      log?: number;
    }>;
    if (rows.length !== 1 || rows[0]?.busy !== 0) {
      throw new SqliteRestoreError(
        "TARGET_BUSY",
        "No se pudo consolidar el WAL de la base destino; todavía está ocupada",
      );
    }

    // Normalize the stopped target into a single-file snapshot. An idle WAL
    // connection can allow a checkpoint but cannot safely change journal
    // mode, so this also closes that otherwise undetectable class of writers.
    const journalMode = database.pragma("journal_mode = DELETE", {
      simple: true,
    });
    if (
      typeof journalMode !== "string" ||
      journalMode.toLowerCase() !== "delete"
    ) {
      throw new SqliteRestoreError(
        "TARGET_BUSY",
        "La base destino no pudo salir de modo WAL; todavía puede estar abierta por otro proceso",
      );
    }
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
      throw new SqliteRestoreError(
        "TARGET_BUSY",
        "La base destino está siendo utilizada por otro proceso",
        { cause: error },
      );
    }
    throw error;
  } finally {
    database?.close();
  }
}

function assertNoRuntimeSidecars(targetPath: string): void {
  const present = SQLITE_RUNTIME_SUFFIXES.map(
    (suffix) => `${targetPath}${suffix}`,
  ).filter(pathEntryExists);
  if (present.length > 0) {
    throw new SqliteRestoreError(
      "TARGET_BUSY",
      "SQLite conserva WAL/SHM/journal en el destino. No es seguro reemplazarlo hasta comprobar que todos los escritores estén detenidos",
    );
  }
}

function assertInitialTargetState(paths: ValidatedRestorePaths): void {
  if (paths.targetIdentity) {
    assertPathIdentity(
      paths.targetPath,
      paths.targetIdentity,
      "La base destino",
    );
    return;
  }

  if (pathEntryExists(paths.targetPath)) {
    throw targetChanged(
      "La base destino apareció después de validar la restauración",
    );
  }
  assertNoRuntimeSidecars(paths.targetPath);
}

function applyTargetMetadata(
  candidatePath: string,
  targetStat: fs.Stats | null,
): void {
  // Open before restoring a potentially read-only mode. The already-open
  // descriptor still permits fsync after chmod removes write permissions.
  const descriptor = fs.openSync(candidatePath, "r+");
  try {
    if (targetStat) {
      if (process.platform !== "win32") {
        const candidateStat = fs.statSync(candidatePath);
        if (
          candidateStat.uid !== targetStat.uid ||
          candidateStat.gid !== targetStat.gid
        ) {
          fs.chownSync(candidatePath, targetStat.uid, targetStat.gid);
        }
      }
      fs.chmodSync(candidatePath, targetStat.mode & 0o777);
    } else {
      fs.chmodSync(candidatePath, 0o600);
    }
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function assertSameSnapshot(
  expected: SqliteVerificationResult,
  installed: SqliteVerificationResult,
): void {
  if (
    expected.pageCount !== installed.pageCount ||
    expected.bytes !== installed.bytes ||
    expected.sha256 !== installed.sha256
  ) {
    throw new Error(
      "La base instalada no coincide con el candidato verificado",
    );
  }
}

function assertPreparedRecovery(
  paths: ValidatedRestorePaths,
  recovery: PreparedRecovery,
  verification: SqliteVerificationOptions,
): void {
  if (!paths.recoveryPath) {
    throw new Error("La restauración no tiene una ruta de recovery preparada");
  }
  assertPathIdentity(
    paths.recoveryPath,
    recovery.identity,
    "La copia de recuperación",
  );
  const current = verifySqliteFile(paths.recoveryPath, verification);
  assertSameSnapshot(recovery.snapshot, current);
  assertPathIdentity(
    paths.recoveryPath,
    recovery.identity,
    "La copia de recuperación",
  );
}

async function rollbackPublishedTarget(
  paths: ValidatedRestorePaths,
  stagingDirectory: string,
  verification: SqliteVerificationOptions,
  runtime: SqliteRestoreRuntime,
  publishedIdentity: FileIdentity,
  lockIdentity: FileIdentity,
  preparedRecovery: PreparedRecovery | null,
): Promise<void> {
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  assertPathIdentity(paths.targetPath, publishedIdentity, "La base publicada");
  assertNoRuntimeSidecars(paths.targetPath);

  if (!paths.targetStat || !paths.recoveryPath) {
    // The target did not exist before this operation. Remove only the exact
    // inode we published; never delete sidecars or a replacement from another
    // process.
    fs.unlinkSync(paths.targetPath);
    syncDirectory(paths.targetDirectory);
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    return;
  }

  if (!preparedRecovery) {
    throw new Error("No existe una recovery fijada para ejecutar el rollback");
  }

  assertPreparedRecovery(paths, preparedRecovery, verification);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);

  const rollbackCandidatePath = path.join(stagingDirectory, "rollback.db");
  const rollbackSnapshot = await createVerifiedSqliteBackup(
    paths.recoveryPath,
    rollbackCandidatePath,
    verification,
  );
  assertSameSnapshot(preparedRecovery.snapshot, rollbackSnapshot);
  assertPreparedRecovery(paths, preparedRecovery, verification);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  applyTargetMetadata(rollbackCandidatePath, paths.targetStat);
  const rollbackIdentity = requireRegularFileIdentity(
    rollbackCandidatePath,
    "El candidato de rollback",
  );
  await runtime.beforeRollbackPublish?.();
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  assertPathIdentity(
    rollbackCandidatePath,
    rollbackIdentity,
    "El candidato de rollback",
  );
  const rollbackReady = verifySqliteFile(rollbackCandidatePath, verification);
  assertSameSnapshot(rollbackSnapshot, rollbackReady);
  assertPathIdentity(
    rollbackCandidatePath,
    rollbackIdentity,
    "El candidato de rollback",
  );
  assertPreparedRecovery(paths, preparedRecovery, verification);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  assertPathIdentity(paths.targetPath, publishedIdentity, "La base publicada");
  assertNoRuntimeSidecars(paths.targetPath);
  fs.renameSync(rollbackCandidatePath, paths.targetPath);
  syncDirectory(paths.targetDirectory);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  assertPathIdentity(paths.targetPath, rollbackIdentity, "La base repuesta");
  const installed = verifySqliteFile(paths.targetPath, verification);
  assertSameSnapshot(rollbackSnapshot, installed);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
  assertPathIdentity(paths.targetPath, rollbackIdentity, "La base repuesta");
  assertNoRuntimeSidecars(paths.targetPath);
  assertOwnedRestoreLock(paths.lockPath, lockIdentity);
}

/** @internal Public only for deterministic fault-injection tests. */
export async function restoreVerifiedSqliteBackupInternal(
  options: RestoreVerifiedSqliteOptions,
  runtime: SqliteRestoreRuntime = {},
): Promise<SqliteRestoreResult> {
  const paths = validateRestorePaths(options);
  const verification =
    options.verification ?? TICKET_MANAGER_SQLITE_VERIFICATION;

  fs.mkdirSync(paths.targetDirectory, { recursive: true });
  const staging = createPrivateStagingDirectory(
    paths.targetDirectory,
    ".ticketmanager-restore-",
  );
  const candidatePath = path.join(staging.path, "candidate.db");

  let lockDescriptor: number | undefined;
  let lockIdentity: FileIdentity | null = null;
  let ownsLock = false;
  let published = false;
  let publishedIdentity: FileIdentity | null = null;
  let preparedRecovery: PreparedRecovery | null = null;
  let preserveRecoveryArtifacts = false;
  let operationError: unknown;

  try {
    const acquiredLock = acquireRestoreLock(paths.lockPath);
    lockDescriptor = acquiredLock.descriptor;
    lockIdentity = acquiredLock.identity;
    ownsLock = true;
    syncDirectory(paths.targetDirectory);
    await runtime.afterLockAcquired?.();
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);

    assertInitialTargetState(paths);

    const candidateSnapshot = await createVerifiedSqliteBackup(
      paths.sourcePath,
      candidatePath,
      verification,
    );
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    assertInitialTargetState(paths);

    if (paths.targetStat && paths.recoveryPath) {
      // Publish and verify the recovery before any checkpoint or journal-mode
      // transition can physically alter the target.
      const recoverySnapshot = await createVerifiedSqliteBackup(
        paths.targetPath,
        paths.recoveryPath,
        verification,
      );
      preparedRecovery = {
        identity: requireRegularFileIdentity(
          paths.recoveryPath,
          "La copia de recuperación",
        ),
        snapshot: recoverySnapshot,
      };
      assertPreparedRecovery(paths, preparedRecovery, verification);
      assertOwnedRestoreLock(paths.lockPath, lockIdentity);
      assertInitialTargetState(paths);

      checkpointTargetWal(paths.targetPath);
      assertOwnedRestoreLock(paths.lockPath, lockIdentity);
      assertInitialTargetState(paths);
      assertNoRuntimeSidecars(paths.targetPath);
    }

    applyTargetMetadata(candidatePath, paths.targetStat);
    const candidateIdentity = requireRegularFileIdentity(
      candidatePath,
      "El candidato verificado",
    );
    await runtime.beforePublish?.();
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    assertPathIdentity(
      candidatePath,
      candidateIdentity,
      "El candidato verificado",
    );
    const publishReady = verifySqliteFile(candidatePath, verification);
    assertSameSnapshot(candidateSnapshot, publishReady);
    assertPathIdentity(
      candidatePath,
      candidateIdentity,
      "El candidato verificado",
    );
    if (preparedRecovery) {
      assertPreparedRecovery(paths, preparedRecovery, verification);
    }
    assertInitialTargetState(paths);
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);

    if (paths.targetStat) {
      // Candidate and target share a directory. rename is the only
      // publication operation, so an existing target is never absent or
      // partially copied. The offline contract plus the immediately previous
      // identity check closes all races observable through portable Node APIs.
      fs.renameSync(candidatePath, paths.targetPath);
    } else {
      // A no-clobber hard link is required for disaster recovery into a
      // missing target: if another process creates it during preparation, it
      // must never be overwritten without a recovery copy.
      try {
        fs.linkSync(candidatePath, paths.targetPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw targetChanged(
            "La base destino apareció justo antes de publicar el candidato",
            error,
          );
        }
        throw error;
      }
    }
    published = true;
    publishedIdentity = candidateIdentity;
    syncDirectory(paths.targetDirectory);
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    assertPathIdentity(
      paths.targetPath,
      publishedIdentity,
      "La base publicada",
    );

    await runtime.afterPublish?.();
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    assertPathIdentity(
      paths.targetPath,
      publishedIdentity,
      "La base publicada",
    );
    assertNoRuntimeSidecars(paths.targetPath);

    const installed = verifySqliteFile(paths.targetPath, verification);
    assertSameSnapshot(candidateSnapshot, installed);
    if (preparedRecovery) {
      assertPreparedRecovery(paths, preparedRecovery, verification);
    }
    assertOwnedRestoreLock(paths.lockPath, lockIdentity);
    assertPathIdentity(
      paths.targetPath,
      publishedIdentity,
      "La base publicada",
    );
    assertNoRuntimeSidecars(paths.targetPath);

    return {
      sourcePath: paths.sourcePath,
      targetPath: paths.targetPath,
      recoveryPath: paths.recoveryPath,
      ...installed,
    };
  } catch (error) {
    if (published && publishedIdentity && lockIdentity) {
      try {
        await rollbackPublishedTarget(
          paths,
          staging.path,
          verification,
          runtime,
          publishedIdentity,
          lockIdentity,
          preparedRecovery,
        );
        published = false;
      } catch (rollbackError) {
        preserveRecoveryArtifacts = true;
        operationError = new SqliteRestoreError(
          "ROLLBACK_FAILED",
          "La restauración falló y no se pudo reponer automáticamente el estado anterior. Se conservaron recovery, staging y lock para intervención manual",
          { cause: new AggregateError([error, rollbackError]) },
        );
        throw operationError;
      }

      operationError = new SqliteRestoreError(
        "RESTORE_FAILED",
        paths.targetStat
          ? "La restauración falló después de publicar el candidato; la base anterior fue repuesta desde la copia de recuperación"
          : "La restauración falló después de publicar el candidato; el destino creado fue retirado",
        { cause: error },
      );
      throw operationError;
    }

    operationError =
      error instanceof SqliteRestoreError
        ? error
        : new SqliteRestoreError(
            "RESTORE_FAILED",
            "La restauración falló antes de reemplazar la base destino",
            { cause: error },
          );
    throw operationError;
  } finally {
    let cleanupError: unknown;
    try {
      if (ownsLock && lockDescriptor !== undefined) {
        fs.closeSync(lockDescriptor);
      }
      if (!preserveRecoveryArtifacts) {
        removePrivateStagingDirectory(staging, ["candidate.db", "rollback.db"]);
        if (ownsLock && lockIdentity) {
          removeRestoreLockIfOwned(paths.lockPath, lockIdentity);
        }
        syncDirectory(paths.targetDirectory);
      }
    } catch (error) {
      cleanupError = error;
    }

    if (cleanupError) {
      if (operationError) {
        throw new AggregateError(
          [operationError, cleanupError],
          "La restauración y la limpieza de sus artefactos fallaron",
        );
      }
      throw new SqliteRestoreError(
        "RESTORE_FAILED",
        "La base fue restaurada y verificada, pero no se pudieron limpiar todos los artefactos operativos",
        { cause: cleanupError },
      );
    }
  }
}
