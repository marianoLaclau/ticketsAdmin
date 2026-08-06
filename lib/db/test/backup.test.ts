import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import {
  createVerifiedSqliteBackup,
  TICKET_MANAGER_SQLITE_VERIFICATION,
  verifySqliteFile,
} from "../src/backup";
import {
  createPrivateFile,
  createPrivateStagingDirectory,
  removePrivateStagingDirectory,
} from "../src/sqlite-files";
import {
  createApplicationDatabase as createFixtureDatabase,
  insertTicket,
  ticketNames,
} from "./support/sqlite-fixture";

const APP_VERIFICATION = TICKET_MANAGER_SQLITE_VERIFICATION;

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
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "tickets-backup-"));
  temporaryDirectories.add(directory);
  return directory;
}

function createApplicationDatabase(databasePath: string): Database.Database {
  const database = createFixtureDatabase(databasePath);
  openDatabases.add(database);
  return database;
}

function assertNoTemporaryArtifacts(directory: string): void {
  assert.deepEqual(
    fs
      .readdirSync(directory)
      .filter(
        (name) => name.includes(".partial") || name.includes(".staging-"),
      ),
    [],
  );
}

describe("backup SQLite verificado", () => {
  it("incluye commits en WAL y excluye una transacción todavía abierta", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = path.join(directory, "copia.db");
    const source = createApplicationDatabase(sourcePath);
    source.pragma("journal_mode = WAL");
    source.pragma("wal_autocheckpoint = 0");
    source.pragma("wal_checkpoint(TRUNCATE)");
    insertTicket(source, 1, "Confirmado");
    source.exec("BEGIN IMMEDIATE");
    insertTicket(source, 2, "Sin confirmar");

    const result = await createVerifiedSqliteBackup(
      sourcePath,
      outputPath,
      APP_VERIFICATION,
    );

    assert.deepEqual(ticketNames(outputPath), ["Confirmado"]);
    assert.equal(result.integrity, "ok");
    assert.ok(result.pageCount > 0);
    assert.equal(result.bytes, fs.statSync(outputPath).size);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    const published = new Database(outputPath, {
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(published.pragma("journal_mode", { simple: true }), "delete");
    published.close();
    assert.equal(fs.existsSync(`${outputPath}-wal`), false);
    assert.equal(fs.existsSync(`${outputPath}-shm`), false);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    }

    source.exec("ROLLBACK");
    source.close();
    assertNoTemporaryArtifacts(directory);
  });

  it("rechaza un snapshot WAL sin crear ni consumir sidecars", () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "wal-no-cerrado.db");
    const source = createApplicationDatabase(sourcePath);
    source.pragma("journal_mode = WAL");
    insertTicket(source, 1, "Confirmado");
    source.close();
    assert.equal(fs.existsSync(`${sourcePath}-wal`), false);
    assert.equal(fs.existsSync(`${sourcePath}-shm`), false);

    assert.throws(
      () => verifySqliteFile(sourcePath, APP_VERIFICATION),
      /journal mode WAL|autocontenido/i,
    );

    assert.equal(fs.existsSync(`${sourcePath}-wal`), false);
    assert.equal(fs.existsSync(`${sourcePath}-shm`), false);
  });

  it("rechaza claves foráneas rotas sin publicar una copia", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = path.join(directory, "copia.db");
    const source = createApplicationDatabase(sourcePath);
    source.pragma("foreign_keys = OFF");
    source
      .prepare("INSERT INTO seguimientos VALUES (?, ?, ?, ?)")
      .run(1, 999, "Huérfano", 1);
    source.close();

    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
      /claves foráneas/i,
    );
    assert.equal(fs.existsSync(outputPath), false);
    assertNoTemporaryArtifacts(directory);
  });

  it("rechaza una SQLite ajena y un archivo corrupto", async () => {
    const directory = makeTemporaryDirectory();
    const unrelatedPath = path.join(directory, "otra.db");
    const corruptPath = path.join(directory, "corrupta.db");
    const unrelated = new Database(unrelatedPath);
    openDatabases.add(unrelated);
    unrelated.exec("CREATE TABLE inventario (id INTEGER PRIMARY KEY)");
    unrelated.close();
    fs.writeFileSync(corruptPath, "esto no es sqlite", { mode: 0o600 });

    await assert.rejects(
      createVerifiedSqliteBackup(
        unrelatedPath,
        path.join(directory, "otra-copia.db"),
        APP_VERIFICATION,
      ),
      /faltan tablas requeridas/i,
    );
    await assert.rejects(
      createVerifiedSqliteBackup(
        corruptPath,
        path.join(directory, "corrupta-copia.db"),
        APP_VERIFICATION,
      ),
    );
    assert.equal(fs.existsSync(path.join(directory, "otra-copia.db")), false);
    assert.equal(
      fs.existsSync(path.join(directory, "corrupta-copia.db")),
      false,
    );
    assertNoTemporaryArtifacts(directory);
  });

  it("rechaza tablas homónimas que no cumplen el esquema histórico mínimo", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "imitacion.db");
    const outputPath = path.join(directory, "copia.db");
    const source = new Database(sourcePath);
    openDatabases.add(source);
    source.exec(`
      CREATE TABLE tickets (id INTEGER PRIMARY KEY);
      CREATE TABLE seguimientos (id INTEGER PRIMARY KEY);
    `);
    source.close();

    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
      /columnas requeridas/i,
    );
    assert.equal(fs.existsSync(outputPath), false);
    assertNoTemporaryArtifacts(directory);
  });

  it("no sobrescribe un destino preexistente", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = path.join(directory, "copia.db");
    const source = createApplicationDatabase(sourcePath);
    source.close();
    fs.writeFileSync(outputPath, "sentinela");

    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
      /destino ya existe/i,
    );
    assert.equal(fs.readFileSync(outputPath, "utf8"), "sentinela");
    assertNoTemporaryArtifacts(directory);
  });

  it("mantiene permisos privados aunque el umask sea permisivo", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = path.join(directory, "copia.db");
    const source = createApplicationDatabase(sourcePath);
    source.close();
    const previousUmask = process.umask(0);

    try {
      const observedStaging = createPrivateStagingDirectory(
        directory,
        ".permission-probe-",
      );
      const observedPartial = path.join(
        observedStaging.path,
        "snapshot.partial",
      );
      createPrivateFile(observedPartial);
      if (process.platform !== "win32") {
        assert.equal(fs.statSync(observedStaging.path).mode & 0o777, 0o700);
        assert.equal(fs.statSync(observedPartial).mode & 0o777, 0o600);
      }
      fs.unlinkSync(observedPartial);
      fs.rmdirSync(observedStaging.path);

      await createVerifiedSqliteBackup(
        sourcePath,
        outputPath,
        APP_VERIFICATION,
      );
    } finally {
      process.umask(previousUmask);
    }

    if (process.platform !== "win32") {
      assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    }
    assertNoTemporaryArtifacts(directory);
  });

  it("rechaza origen y destino idénticos, incluso mediante hard link", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const aliasPath = path.join(directory, "alias.db");
    const source = createApplicationDatabase(sourcePath);
    source.close();
    fs.linkSync(sourcePath, aliasPath);

    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, sourcePath, APP_VERIFICATION),
      /no puede ser la base de origen/i,
    );
    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, aliasPath, APP_VERIFICATION),
      /no puede ser la base de origen/i,
    );
    assert.deepEqual(ticketNames(sourcePath), []);
  });

  it("publica exactamente un ganador ante dos destinos concurrentes", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = path.join(directory, "copia.db");
    const source = createApplicationDatabase(sourcePath);
    insertTicket(source, 1, "Único");
    source.close();

    const results = await Promise.allSettled([
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
    ]);

    assert.equal(
      results.filter(({ status }) => status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter(({ status }) => status === "rejected").length,
      1,
    );
    assert.deepEqual(ticketNames(outputPath), ["Único"]);
    assert.deepEqual(
      verifySqliteFile(outputPath, APP_VERIFICATION).integrity,
      "ok",
    );
    assertNoTemporaryArtifacts(directory);
  });

  it("rechaza publicar un backup como sidecar de su propia fuente", async () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, "origen.db");
    const outputPath = `${sourcePath}-wal`;
    const source = createApplicationDatabase(sourcePath);
    source.close();

    await assert.rejects(
      createVerifiedSqliteBackup(sourcePath, outputPath, APP_VERIFICATION),
      /no puede ser la base de origen/i,
    );

    assert.equal(fs.existsSync(outputPath), false);
    assertNoTemporaryArtifacts(directory);
  });

  it("preserva un staging reemplazado y nunca lo borra recursivamente", () => {
    const directory = makeTemporaryDirectory();
    const staging = createPrivateStagingDirectory(directory, ".cleanup-probe-");
    const movedPath = path.join(directory, "staging-original-movido");
    fs.renameSync(staging.path, movedPath);
    fs.mkdirSync(staging.path);
    const sentinelPath = path.join(staging.path, "sentinela-ajeno");
    fs.writeFileSync(sentinelPath, "no borrar");

    assert.throws(
      () => removePrivateStagingDirectory(staging, ["snapshot.partial"]),
      /retirado o reemplazado/i,
    );

    assert.equal(fs.readFileSync(sentinelPath, "utf8"), "no borrar");
    assert.equal(fs.existsSync(movedPath), true);
  });
});
