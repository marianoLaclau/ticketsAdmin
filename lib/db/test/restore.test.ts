import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import {
  createVerifiedSqliteBackup,
  TICKET_MANAGER_SQLITE_VERIFICATION,
} from "../src/backup";
import { restoreVerifiedSqliteBackupInternal } from "../src/restore-internal";
import {
  restoreVerifiedSqliteBackup,
  SqliteRestoreError,
} from "../src/restore";
import {
  createApplicationDatabase,
  insertTicket,
  ticketNames,
} from "./support/sqlite-fixture";

const temporaryDirectories = new Set<string>();
const openDatabases = new Set<Database.Database>();

afterEach(() => {
  for (const database of openDatabases) {
    if (database.open) {
      database.close();
    }
  }
  openDatabases.clear();
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

function makeTemporaryDirectory(): string {
  const temporaryRoot = path.join(process.cwd(), "tmp");
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(
    path.join(temporaryRoot, "tickets-restore-"),
  );
  temporaryDirectories.add(directory);
  return directory;
}

function trackDatabase(database: Database.Database): Database.Database {
  openDatabases.add(database);
  return database;
}

function createClosedDatabase(databasePath: string, nombre: string): void {
  const database = createApplicationDatabase(databasePath);
  insertTicket(database, 1, nombre);
  database.close();
}

async function createRestorableBackup(
  directory: string,
  nombre: string,
): Promise<string> {
  const sourcePath = path.join(directory, `source-${nombre}.db`);
  const backupPath = path.join(directory, `backup-${nombre}.db`);
  createClosedDatabase(sourcePath, nombre);
  await createVerifiedSqliteBackup(
    sourcePath,
    backupPath,
    TICKET_MANAGER_SQLITE_VERIFICATION,
  );
  return backupPath;
}

function assertRestoreError(
  code: SqliteRestoreError["code"],
): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof SqliteRestoreError);
    assert.equal(error.code, code);
    return true;
  };
}

function restoreArtifacts(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter(
      (name) =>
        name.startsWith(".ticketmanager-restore-") ||
        name.endsWith(".restore.lock"),
    );
}

function findRestoreStaging(directory: string): string {
  const stagingDirectories = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith(".ticketmanager-restore-"));
  assert.equal(stagingDirectories.length, 1);
  return path.join(directory, stagingDirectories[0]!);
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function isUnsupportedLinkError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ENOTSUP" ||
    code === "EINVAL"
  );
}

describe("restauración SQLite offline", () => {
  it("exige confirmación offline, recovery y rutas independientes", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    const originalBytes = fs.readFileSync(targetPath);

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: false as true,
      }),
      assertRestoreError("OFFLINE_CONFIRMATION_REQUIRED"),
    );
    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("RECOVERY_REQUIRED"),
    );
    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: targetPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("rechaza usar un sidecar del destino como ruta de recovery", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    createClosedDatabase(targetPath, "Anterior");
    const originalBytes = fs.readFileSync(targetPath);
    const sidecars = ["-wal", "-shm", "-journal"].map(
      (suffix) => `${targetPath}${suffix}`,
    );
    for (const [index, sidecarPath] of sidecars.entries()) {
      fs.writeFileSync(sidecarPath, `sentinela-${index}`, { mode: 0o600 });
    }

    for (const [index, sidecarPath] of sidecars.entries()) {
      await assert.rejects(
        restoreVerifiedSqliteBackup({
          source: backupPath,
          target: targetPath,
          recoveryOutput: sidecarPath,
          offlineConfirmed: true,
        }),
        assertRestoreError("INVALID_RESTORE_PATH"),
      );
      assert.equal(fs.readFileSync(sidecarPath, "utf8"), `sentinela-${index}`);
    }

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("reemplaza atómicamente el destino y conserva una recovery verificada", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o640);
    }

    const result = await restoreVerifiedSqliteBackup({
      source: backupPath,
      target: targetPath,
      recoveryOutput: recoveryPath,
      offlineConfirmed: true,
    });

    assert.deepEqual(ticketNames(targetPath), ["Nuevo"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.equal(result.integrity, "ok");
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.equal(result.recoveryPath, path.resolve(recoveryPath));
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(targetPath).mode & 0o777, 0o640);
      assert.equal(fs.statSync(recoveryPath).mode & 0o777, 0o600);
    }
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("consolida un commit que solo estaba en WAL antes de crear recovery", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Restaurado");
    const livePath = path.join(directory, "live.db");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const live = trackDatabase(createApplicationDatabase(livePath));
    live.pragma("journal_mode = WAL");
    live.pragma("wal_autocheckpoint = 0");
    live.pragma("wal_checkpoint(TRUNCATE)");
    insertTicket(live, 1, "Persistido en WAL");
    fs.copyFileSync(livePath, targetPath);
    fs.copyFileSync(`${livePath}-wal`, `${targetPath}-wal`);
    live.close();

    await restoreVerifiedSqliteBackup({
      source: backupPath,
      target: targetPath,
      recoveryOutput: recoveryPath,
      offlineConfirmed: true,
    });

    assert.deepEqual(ticketNames(targetPath), ["Restaurado"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Persistido en WAL"]);
    assert.equal(fs.existsSync(`${targetPath}-wal`), false);
    assert.equal(fs.existsSync(`${targetPath}-shm`), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("restaura de WAL a WAL usando snapshots autocontenidos", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "source-wal.db");
    const backupPath = path.join(directory, "backup-wal.db");
    const source = createApplicationDatabase(sourcePath);
    source.pragma("journal_mode = WAL");
    insertTicket(source, 1, "Nuevo WAL");
    source.close();
    await createVerifiedSqliteBackup(
      sourcePath,
      backupPath,
      TICKET_MANAGER_SQLITE_VERIFICATION,
    );

    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const target = createApplicationDatabase(targetPath);
    target.pragma("journal_mode = WAL");
    insertTicket(target, 1, "Anterior WAL");
    target.close();

    await restoreVerifiedSqliteBackup({
      source: backupPath,
      target: targetPath,
      recoveryOutput: recoveryPath,
      offlineConfirmed: true,
    });

    assert.deepEqual(ticketNames(targetPath), ["Nuevo WAL"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior WAL"]);
    for (const databasePath of [backupPath, targetPath, recoveryPath]) {
      assert.equal(fs.existsSync(`${databasePath}-wal`), false);
      assert.equal(fs.existsSync(`${databasePath}-shm`), false);
    }
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("falla cerrado si un escritor mantiene una transacción activa", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const target = trackDatabase(createApplicationDatabase(targetPath));
    target.pragma("journal_mode = WAL");
    insertTicket(target, 1, "Anterior");
    target.exec("BEGIN IMMEDIATE");
    insertTicket(target, 2, "Sin confirmar");

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("TARGET_BUSY"),
    );

    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    target.exec("ROLLBACK");
    target.close();
    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("falla cerrado aunque la conexión ajena esté abierta pero inactiva", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const target = trackDatabase(createApplicationDatabase(targetPath));
    target.pragma("journal_mode = WAL");
    insertTicket(target, 1, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("TARGET_BUSY"),
    );

    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    target.close();
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("una fuente corrupta no toca el destino ni publica recovery", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "corrupto.db");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    fs.writeFileSync(sourcePath, "no es sqlite", { mode: 0o600 });
    createClosedDatabase(targetPath, "Anterior");
    const originalBytes = fs.readFileSync(targetPath);

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: sourcePath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("no sobrescribe una recovery existente ni altera físicamente el target", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    fs.writeFileSync(recoveryPath, "sentinela", { mode: 0o600 });
    const originalBytes = fs.readFileSync(targetPath);

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("RECOVERY_ALREADY_EXISTS"),
    );

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.equal(fs.readFileSync(recoveryPath, "utf8"), "sentinela");
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("respeta un lock ajeno y nunca lo elimina", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const lockPath = `${targetPath}.restore.lock`;
    createClosedDatabase(targetPath, "Anterior");
    fs.writeFileSync(lockPath, "otro proceso", { mode: 0o600 });

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("RESTORE_LOCKED"),
    );

    assert.equal(fs.readFileSync(lockPath, "utf8"), "otro proceso");
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(
      restoreArtifacts(directory).filter(
        (name) => !name.endsWith(".restore.lock"),
      ),
      [],
    );
  });

  it("serializa dos restauraciones que compiten por el mismo lock real", async () => {
    const directory = makeTemporaryDirectory();
    const firstBackupPath = await createRestorableBackup(directory, "Primero");
    const secondBackupPath = await createRestorableBackup(directory, "Segundo");
    const targetPath = path.join(directory, "tickets.db");
    const firstRecoveryPath = path.join(directory, "pre-first.db");
    const secondRecoveryPath = path.join(directory, "pre-second.db");
    createClosedDatabase(targetPath, "Anterior");
    const lockAcquired = createDeferred();
    const releaseFirstRestore = createDeferred();

    const firstRestore = restoreVerifiedSqliteBackupInternal(
      {
        source: firstBackupPath,
        target: targetPath,
        recoveryOutput: firstRecoveryPath,
        offlineConfirmed: true,
      },
      {
        afterLockAcquired: async () => {
          lockAcquired.resolve();
          await releaseFirstRestore.promise;
        },
      },
    );

    await lockAcquired.promise;
    try {
      await assert.rejects(
        restoreVerifiedSqliteBackup({
          source: secondBackupPath,
          target: targetPath,
          recoveryOutput: secondRecoveryPath,
          offlineConfirmed: true,
        }),
        assertRestoreError("RESTORE_LOCKED"),
      );
    } finally {
      releaseFirstRestore.resolve();
    }
    await firstRestore;

    assert.deepEqual(ticketNames(targetPath), ["Primero"]);
    assert.deepEqual(ticketNames(firstRecoveryPath), ["Anterior"]);
    assert.equal(fs.existsSync(secondRecoveryPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("falla cerrado y preserva un lock ajeno que reemplaza al propio", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const lockPath = `${targetPath}.restore.lock`;
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterLockAcquired: () => {
            fs.unlinkSync(lockPath);
            fs.writeFileSync(lockPath, "lock de otro restore", {
              mode: 0o600,
            });
          },
        },
      ),
      assertRestoreError("RESTORE_LOCK_LOST"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.equal(fs.readFileSync(lockPath, "utf8"), "lock de otro restore");
    assert.deepEqual(
      restoreArtifacts(directory).filter(
        (name) => name !== path.basename(lockPath),
      ),
      [],
    );
  });

  it("rechaza un origen que es un hardlink del destino", async () => {
    const directory = makeTemporaryDirectory();
    const targetPath = path.join(directory, "tickets.db");
    const sourceAliasPath = path.join(directory, "source-alias.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    fs.linkSync(targetPath, sourceAliasPath);
    const originalBytes = fs.readFileSync(targetPath);

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: sourceAliasPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("rechaza relaciones base/sidecar en cualquier dirección", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const sidecarTargetPath = `${backupPath}-wal`;

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: sidecarTargetPath,
        offlineConfirmed: true,
        allowMissingTarget: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    const targetPath = path.join(directory, "tickets.db");
    const sourceSidecarPath = path.join(directory, "pre-restore.db-wal");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    fs.copyFileSync(backupPath, sourceSidecarPath);
    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: sourceSidecarPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    assert.equal(fs.existsSync(sidecarTargetPath), false);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("rechaza un destino que es un enlace simbólico", async (context) => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const realTargetPath = path.join(directory, "real-tickets.db");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(realTargetPath, "Anterior");
    try {
      fs.symlinkSync(realTargetPath, targetPath, "file");
    } catch (error) {
      if (isUnsupportedLinkError(error)) {
        context.skip(
          "La plataforma no permite crear symlinks para esta prueba",
        );
        return;
      }
      throw error;
    }

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    assert.deepEqual(ticketNames(realTargetPath), ["Anterior"]);
    assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), true);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("canonicaliza parents simbólicos antes de comparar sidecars", async (context) => {
    const directory = makeTemporaryDirectory();
    const realDirectory = path.join(directory, "real");
    const aliasDirectory = path.join(directory, "alias");
    fs.mkdirSync(realDirectory);
    const backupPath = await createRestorableBackup(realDirectory, "Nuevo");
    try {
      fs.symlinkSync(
        realDirectory,
        aliasDirectory,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (isUnsupportedLinkError(error)) {
        context.skip(
          "La plataforma no permite crear un alias de directorio para esta prueba",
        );
        return;
      }
      throw error;
    }

    const aliasedSidecarPath = path.join(
      aliasDirectory,
      `${path.basename(backupPath)}-wal`,
    );
    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: aliasedSidecarPath,
        offlineConfirmed: true,
        allowMissingTarget: true,
      }),
      assertRestoreError("INVALID_RESTORE_PATH"),
    );

    assert.equal(fs.existsSync(`${backupPath}-wal`), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("un fallo al publicar la recovery no altera el destino", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const invalidParentPath = path.join(directory, "no-es-directorio");
    const recoveryPath = path.join(invalidParentPath, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    fs.writeFileSync(invalidParentPath, "bloqueo", { mode: 0o600 });
    const originalBytes = fs.readFileSync(targetPath);

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        recoveryOutput: recoveryPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.deepEqual(fs.readFileSync(targetPath), originalBytes);
    assert.equal(fs.readFileSync(invalidParentPath, "utf8"), "bloqueo");
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("revalida el candidato después del hook y nunca publica su reemplazo", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const foreignBackupPath = await createRestorableBackup(
      directory,
      "Intruso",
    );
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          beforePublish: () => {
            const candidatePath = path.join(
              findRestoreStaging(directory),
              "candidate.db",
            );
            fs.unlinkSync(candidatePath);
            fs.copyFileSync(foreignBackupPath, candidatePath);
          },
        },
      ),
      assertRestoreError("TARGET_CHANGED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("fija recovery por inode y SHA antes de publicar el candidato", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const foreignBackupPath = await createRestorableBackup(directory, "Ajeno");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          beforePublish: () => {
            fs.unlinkSync(recoveryPath);
            fs.copyFileSync(foreignBackupPath, recoveryPath);
          },
        },
      ),
      assertRestoreError("TARGET_CHANGED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Ajeno"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("nunca usa una recovery sustituida durante el rollback", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const foreignBackupPath = await createRestorableBackup(directory, "Ajeno");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterPublish: () => {
            fs.unlinkSync(recoveryPath);
            fs.copyFileSync(foreignBackupPath, recoveryPath);
            throw new Error("fallo con recovery sustituida");
          },
        },
      ),
      assertRestoreError("ROLLBACK_FAILED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Nuevo"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Ajeno"]);
    assert.equal(fs.existsSync(`${targetPath}.restore.lock`), true);
    assert.equal(fs.existsSync(findRestoreStaging(directory)), true);
  });

  it("nunca limpia recursivamente un staging reemplazado", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    const movedStagingPath = path.join(directory, "staging-original-movido");
    let replacementStagingPath = "";
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          beforePublish: () => {
            replacementStagingPath = findRestoreStaging(directory);
            fs.renameSync(replacementStagingPath, movedStagingPath);
            fs.mkdirSync(replacementStagingPath);
            fs.writeFileSync(
              path.join(replacementStagingPath, "sentinela-ajeno"),
              "no borrar",
            );
            throw new Error("fallo después de reemplazar staging");
          },
        },
      ),
    );

    assert.equal(
      fs.readFileSync(
        path.join(replacementStagingPath, "sentinela-ajeno"),
        "utf8",
      ),
      "no borrar",
    );
    assert.equal(
      fs.existsSync(path.join(movedStagingPath, "candidate.db")),
      true,
    );
    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
  });

  it("repone la base anterior si falla una comprobación post-publicación", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterPublish: async () => {
            await Promise.resolve();
            throw new Error("fallo post-publicación inyectado");
          },
        },
      ),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("el rollback conserva los permisos observados del destino anterior", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    fs.chmodSync(targetPath, 0o640);
    const originalMode = fs.statSync(targetPath).mode & 0o777;

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterPublish: () => {
            throw new Error("fallo post-publicación inyectado");
          },
        },
      ),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.equal(fs.statSync(targetPath).mode & 0o777, originalMode);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("detecta una base válida distinta aunque conserve tamaño y páginas", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const tamperedBackupPath = await createRestorableBackup(directory, "Falso");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");
    assert.equal(
      fs.statSync(backupPath).size,
      fs.statSync(tamperedBackupPath).size,
      "la precondición exige dos snapshots válidos del mismo tamaño",
    );
    assert.notDeepEqual(
      fs.readFileSync(backupPath),
      fs.readFileSync(tamperedBackupPath),
    );

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterPublish: () => {
            fs.copyFileSync(tamperedBackupPath, targetPath);
          },
        },
      ),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("preserva recovery, staging y lock si también falla el rollback", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          afterPublish: () => {
            throw new Error("fallo post-publicación inyectado");
          },
          beforeRollbackPublish: async () => {
            await Promise.resolve();
            throw new Error("fallo de rollback inyectado");
          },
        },
      ),
      assertRestoreError("ROLLBACK_FAILED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Nuevo"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.equal(fs.existsSync(`${targetPath}.restore.lock`), true);
    assert.equal(
      restoreArtifacts(directory).some((name) =>
        name.startsWith(".ticketmanager-restore-"),
      ),
      true,
    );
  });

  it("exige opt-in para restaurar un destino ausente", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        offlineConfirmed: true,
      }),
      assertRestoreError("TARGET_NOT_FOUND"),
    );

    await restoreVerifiedSqliteBackup({
      source: backupPath,
      target: targetPath,
      offlineConfirmed: true,
      allowMissingTarget: true,
    });

    assert.deepEqual(ticketNames(targetPath), ["Nuevo"]);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(targetPath).mode & 0o777, 0o600);
    }
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("preserva sidecars huérfanos y rechaza publicar sobre un destino ausente", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const sidecars = new Map<string, Buffer>([
      [`${targetPath}-wal`, Buffer.from("wal-ajeno")],
      [`${targetPath}-shm`, Buffer.from("shm-ajeno")],
      [`${targetPath}-journal`, Buffer.from("journal-ajeno")],
    ]);
    for (const [sidecarPath, contents] of sidecars) {
      fs.writeFileSync(sidecarPath, contents, { mode: 0o600 });
    }

    await assert.rejects(
      restoreVerifiedSqliteBackup({
        source: backupPath,
        target: targetPath,
        offlineConfirmed: true,
        allowMissingTarget: true,
      }),
      assertRestoreError("TARGET_BUSY"),
    );

    assert.equal(fs.existsSync(targetPath), false);
    for (const [sidecarPath, contents] of sidecars) {
      assert.deepEqual(fs.readFileSync(sidecarPath), contents);
    }
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("retira el candidato publicado si el destino originalmente no existía", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          offlineConfirmed: true,
          allowMissingTarget: true,
        },
        {
          afterPublish: () => {
            throw new Error("fallo post-publicación inyectado");
          },
        },
      ),
      assertRestoreError("RESTORE_FAILED"),
    );

    assert.equal(fs.existsSync(targetPath), false);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("no pisa un destino que aparece durante una restauración excepcional", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          offlineConfirmed: true,
          allowMissingTarget: true,
        },
        {
          beforePublish: () => {
            createClosedDatabase(targetPath, "Intruso");
          },
        },
      ),
      assertRestoreError("TARGET_CHANGED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Intruso"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });

  it("no pisa un destino existente reemplazado durante la restauración", async () => {
    const directory = makeTemporaryDirectory();
    const backupPath = await createRestorableBackup(directory, "Nuevo");
    const targetPath = path.join(directory, "tickets.db");
    const displacedTargetPath = path.join(directory, "tickets-desplazado.db");
    const recoveryPath = path.join(directory, "pre-restore.db");
    createClosedDatabase(targetPath, "Anterior");

    await assert.rejects(
      restoreVerifiedSqliteBackupInternal(
        {
          source: backupPath,
          target: targetPath,
          recoveryOutput: recoveryPath,
          offlineConfirmed: true,
        },
        {
          beforePublish: () => {
            fs.renameSync(targetPath, displacedTargetPath);
            createClosedDatabase(targetPath, "Intruso");
          },
        },
      ),
      assertRestoreError("TARGET_CHANGED"),
    );

    assert.deepEqual(ticketNames(targetPath), ["Intruso"]);
    assert.deepEqual(ticketNames(displacedTargetPath), ["Anterior"]);
    assert.deepEqual(ticketNames(recoveryPath), ["Anterior"]);
    assert.deepEqual(restoreArtifacts(directory), []);
  });
});
