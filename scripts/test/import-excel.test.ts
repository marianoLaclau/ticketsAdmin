import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const packageDirectory = process.cwd();
const testDirectory = join(
  packageDirectory,
  "..",
  "tmp",
  "scripts-import-tests",
);
const databasePath = join(testDirectory, `import-${process.pid}.db`);
const csvPath = join(testDirectory, `import-${process.pid}.csv`);
mkdirSync(testDirectory, { recursive: true });
for (const path of [
  databasePath,
  `${databasePath}-shm`,
  `${databasePath}-wal`,
  csvPath,
]) {
  rmSync(path, { force: true });
}

process.env.TICKETS_DB_PATH = databasePath;
const { sqlite } = await import("@workspace/db");
sqlite.exec(`
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    conversation_id TEXT NOT NULL UNIQUE,
    hora TEXT NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    telefono TEXT,
    dni TEXT,
    empresa TEXT,
    estado_empleado TEXT,
    email TEXT,
    motivo TEXT NOT NULL,
    motivo_categoria TEXT NOT NULL DEFAULT 'sin_clasificar',
    resumen TEXT,
    notificado INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    prioridad TEXT NOT NULL DEFAULT 'media',
    asignado_usuario_id INTEGER,
    asignado_a TEXT,
    audio_url TEXT,
    notas TEXT,
    progreso INTEGER NOT NULL DEFAULT 0,
    fecha_creacion INTEGER NOT NULL,
    fecha_limite INTEGER,
    fecha_resolucion INTEGER
  );
`);

function runImporter() {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(packageDirectory, "src", "import-excel.ts"),
      csvPath,
    ],
    {
      cwd: packageDirectory,
      encoding: "utf8",
      env: { ...process.env, TICKETS_DB_PATH: databasePath },
      timeout: 30_000,
    },
  );
}

function ticketCount(): number {
  return (
    sqlite.prepare("SELECT count(*) AS total FROM tickets").get() as {
      total: number;
    }
  ).total;
}

beforeEach(() => {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS fail_import_row;
    DELETE FROM tickets;
    DELETE FROM sqlite_sequence WHERE name = 'tickets';
  `);
});

after(() => {
  sqlite.close();
  for (const path of [
    databasePath,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
    csvPath,
  ]) {
    rmSync(path, { force: true });
  }
});

describe("importador CLI", () => {
  it("revierte el archivo completo si falla una fila intermedia", () => {
    writeFileSync(
      csvPath,
      [
        "conversation_id;nombre;motivo",
        "primero;Ana;Consulta",
        "forzar-fallo;Bruno;Consulta",
      ].join("\n"),
      "utf8",
    );
    sqlite.exec(`
      CREATE TRIGGER fail_import_row
      BEFORE INSERT ON tickets
      WHEN NEW.conversation_id = 'forzar-fallo'
      BEGIN
        SELECT RAISE(ABORT, 'fallo de importacion forzado');
      END;
    `);

    const failed = runImporter();
    assert.equal(failed.status, 1, failed.stdout);
    assert.equal(ticketCount(), 0);

    sqlite.exec("DROP TRIGGER fail_import_row");
    const imported = runImporter();
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /Insertados:\s+2/);
    assert.equal(ticketCount(), 2);
  });
});
