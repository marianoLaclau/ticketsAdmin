import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type {
  SqliteBackupEvidence,
  SqliteEvidence,
} from "../src/lib/sqlite-snapshot-report";

interface CliFailure {
  contract: string;
  contractVersion: number;
  ok: false;
  operation: string;
  error: {
    code: string;
    message: string;
    fields?: string[];
  };
}

const packageDirectory = process.cwd();
const testDirectory = join(
  packageDirectory,
  "..",
  "tmp",
  `scripts-sqlite-cli-${process.pid}`,
);
const databasePath = join(testDirectory, "source.db");
const backupPath = join(testDirectory, "backup.db");
const copiedBackupPath = join(testDirectory, "copied-backup.db");
const corruptBackupPath = join(testDirectory, "corrupt-backup.db");
const sidecarBackupPath = join(testDirectory, "sidecar-backup.db");
const evidencePath = join(testDirectory, "backup-evidence.json");
mkdirSync(testDirectory, { recursive: true });
process.env.TICKETS_DB_PATH = databasePath;

const { sqlite } = await import("@workspace/db");
let backupEvidence: SqliteBackupEvidence;

function runCli(name: "backup-db" | "verify-db", args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", join(packageDirectory, "src", `${name}.ts`), ...args],
    {
      cwd: packageDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        ADMIN_API_KEY: "sentinel-admin-must-not-leak",
        WEBHOOK_API_KEY: "sentinel-webhook-must-not-leak",
      },
      timeout: 30_000,
    },
  );
}

function parseSingleJsonLine<T>(output: string): T {
  const lines = output.trim().split(/\r?\n/);
  assert.equal(lines.length, 1, `salida inesperada: ${output}`);
  return JSON.parse(lines[0]!) as T;
}

function writeEvidence(evidence: unknown): void {
  writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

before(() => {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      motivo TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      nota TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
    INSERT INTO tickets (
      id, conversation_id, hora, nombre, apellido, motivo, fecha_creacion
    ) VALUES (1, 'cli-evidence', '10:00', 'Ana', 'Pérez', 'Consulta', 1);
    INSERT INTO seguimientos (id, ticket_id, nota, fecha_creacion)
    VALUES (1, 1, 'Creado para la prueba', 1);
  `);
  sqlite.close();

  const backup = runCli("backup-db", [
    "--source",
    databasePath,
    "--output",
    backupPath,
    "--json",
  ]);
  assert.equal(backup.status, 0, backup.stderr);
  assert.equal(backup.stderr, "");
  backupEvidence = parseSingleJsonLine<SqliteBackupEvidence>(backup.stdout);
  writeEvidence(backupEvidence);
});

after(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("evidencia de snapshots SQLite", () => {
  it("emite un contrato versionado y reverifica una copia en otra ruta", () => {
    assert.deepEqual(
      {
        contract: backupEvidence.contract,
        contractVersion: backupEvidence.contractVersion,
        ok: backupEvidence.ok,
        operation: backupEvidence.operation,
        storage: backupEvidence.artifact.storage,
        checks: backupEvidence.checks,
      },
      {
        contract: "ticketsadmin.sqlite-evidence",
        contractVersion: 1,
        ok: true,
        operation: "backup",
        storage: "sqlite-single-file-v1",
        checks: {
          integrity: "ok",
          foreignKeys: "ok",
          ticketManagerSchema: "ok",
        },
      },
    );
    assert.equal(backupEvidence.sourcePath, databasePath);
    assert.equal(backupEvidence.artifact.path, backupPath);
    assert.ok(backupEvidence.artifact.pageCount > 0);
    assert.ok(backupEvidence.artifact.bytes > 0);
    assert.match(backupEvidence.artifact.sha256, /^[a-f0-9]{64}$/);

    // Simula el transporte docker cp: la ruta cambia, el contenido no.
    copyFileSync(backupPath, copiedBackupPath);

    const verification = runCli("verify-db", [
      "--source",
      copiedBackupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(verification.status, 0, verification.stderr);
    assert.equal(verification.stderr, "");
    const verified = parseSingleJsonLine<SqliteEvidence>(verification.stdout);
    assert.equal(verified.operation, "verify");
    assert.deepEqual(verified.comparison, { matched: true });
    assert.equal(verified.artifact.sha256, backupEvidence.artifact.sha256);
    assert.equal(verified.artifact.bytes, backupEvidence.artifact.bytes);
    assert.equal(
      verified.artifact.pageCount,
      backupEvidence.artifact.pageCount,
    );
  });

  it("detecta evidencia alterada con código y campos estables", () => {
    const altered = structuredClone(backupEvidence);
    altered.artifact.sha256 = "0".repeat(64);
    altered.artifact.bytes += 1;
    writeEvidence(altered);

    const verification = runCli("verify-db", [
      "--source",
      backupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(verification.status, 3);
    assert.equal(verification.stdout, "");
    const failure = parseSingleJsonLine<CliFailure>(verification.stderr);
    assert.equal(failure.error.code, "EVIDENCE_MISMATCH");
    assert.deepEqual(failure.error.fields, [
      "artifact.sha256",
      "artifact.bytes",
    ]);
    assert.doesNotMatch(verification.stderr, /\n\s+at\s/);
  });

  it("detecta otra SQLite válida aunque conserve bytes y páginas", () => {
    const mutation = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        [
          'const { sqlite } = await import("@workspace/db");',
          'sqlite.prepare("UPDATE tickets SET nombre = ? WHERE id = 1").run("Eva");',
          'sqlite.pragma("wal_checkpoint(TRUNCATE)");',
          'sqlite.pragma("journal_mode = DELETE");',
          "sqlite.close();",
        ].join(" "),
      ],
      {
        cwd: packageDirectory,
        encoding: "utf8",
        env: { ...process.env, TICKETS_DB_PATH: copiedBackupPath },
        timeout: 30_000,
      },
    );
    assert.equal(mutation.status, 0, mutation.stderr);
    writeEvidence(backupEvidence);

    const verification = runCli("verify-db", [
      "--source",
      copiedBackupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(verification.status, 3, verification.stderr);
    const failure = parseSingleJsonLine<CliFailure>(verification.stderr);
    assert.equal(failure.error.code, "EVIDENCE_MISMATCH");
    assert.deepEqual(failure.error.fields, ["artifact.sha256"]);
  });

  it("rechaza evidencia ajena o argumentos inválidos sin filtrar secretos", () => {
    writeEvidence({
      contract: "ticketsadmin.sqlite-evidence",
      contractVersion: 99,
    });
    const invalidEvidence = runCli("verify-db", [
      "--source",
      backupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(invalidEvidence.status, 2);
    const evidenceFailure = parseSingleJsonLine<CliFailure>(
      invalidEvidence.stderr,
    );
    assert.equal(evidenceFailure.error.code, "INVALID_EVIDENCE");

    const malformedSentinel = "sentinel-malformed-evidence-must-not-leak";
    writeFileSync(evidencePath, `{"secret":"${malformedSentinel}"`, "utf8");
    const malformed = runCli("verify-db", [
      "--source",
      backupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(malformed.status, 2);
    assert.equal(
      parseSingleJsonLine<CliFailure>(malformed.stderr).error.code,
      "INVALID_EVIDENCE",
    );
    assert.doesNotMatch(malformed.stderr, new RegExp(malformedSentinel));

    const invalidArgument = runCli("verify-db", ["--json"]);
    assert.equal(invalidArgument.status, 2);
    const argumentFailure = parseSingleJsonLine<CliFailure>(
      invalidArgument.stderr,
    );
    assert.equal(argumentFailure.error.code, "INVALID_ARGUMENT");

    const invalidBackupArgument = runCli("backup-db", ["--output", "--json"]);
    assert.equal(invalidBackupArgument.status, 2);
    assert.equal(
      parseSingleJsonLine<CliFailure>(invalidBackupArgument.stderr).error.code,
      "INVALID_ARGUMENT",
    );

    for (const output of [
      invalidEvidence.stdout,
      invalidEvidence.stderr,
      invalidArgument.stdout,
      invalidArgument.stderr,
      invalidBackupArgument.stdout,
      invalidBackupArgument.stderr,
    ]) {
      assert.doesNotMatch(output, /sentinel-(?:admin|webhook)-must-not-leak/);
    }
  });

  it("no sobrescribe un destino y conserva el backup original", () => {
    const repeated = runCli("backup-db", [
      "--source",
      databasePath,
      "--output",
      backupPath,
      "--json",
    ]);
    assert.equal(repeated.status, 1);
    assert.equal(repeated.stdout, "");
    const failure = parseSingleJsonLine<CliFailure>(repeated.stderr);
    assert.equal(failure.error.code, "BACKUP_FAILED");

    writeEvidence(backupEvidence);
    const intact = runCli("verify-db", [
      "--source",
      backupPath,
      "--expect-evidence",
      evidencePath,
      "--json",
    ]);
    assert.equal(intact.status, 0, intact.stderr);
  });

  it("reporta corrupción sin crear sidecars junto al archivo", () => {
    writeFileSync(corruptBackupPath, "esto no es sqlite", {
      encoding: "utf8",
      mode: 0o600,
    });
    const verification = runCli("verify-db", [
      "--source",
      corruptBackupPath,
      "--json",
    ]);
    assert.equal(verification.status, 3);
    assert.equal(verification.stdout, "");
    const failure = parseSingleJsonLine<CliFailure>(verification.stderr);
    assert.equal(failure.error.code, "VERIFICATION_FAILED");
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      assert.equal(existsSync(`${corruptBackupPath}${suffix}`), false);
    }
  });

  it("rechaza un sidecar sin abrir ni modificar el snapshot", () => {
    copyFileSync(backupPath, sidecarBackupPath);
    writeFileSync(`${sidecarBackupPath}-wal`, "sidecar ajeno", "utf8");
    const verification = runCli("verify-db", [
      "--source",
      sidecarBackupPath,
      "--json",
    ]);
    assert.equal(verification.status, 3);
    const failure = parseSingleJsonLine<CliFailure>(verification.stderr);
    assert.equal(failure.error.code, "VERIFICATION_FAILED");
    assert.equal(existsSync(`${sidecarBackupPath}-wal`), true);
    assert.equal(existsSync(`${sidecarBackupPath}-shm`), false);
    assert.equal(existsSync(`${sidecarBackupPath}-journal`), false);
  });

  it("conserva ayuda humana para el operador", () => {
    const help = runCli("verify-db", ["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--expect-evidence/);
    assert.match(help.stdout, /--json/);
  });
});
