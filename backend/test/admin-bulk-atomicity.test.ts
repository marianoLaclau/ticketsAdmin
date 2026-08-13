import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { after, beforeEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "backend-admin-bulk-tests");
const databasePath = join(testDirectory, `bulk-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) {
  rmSync(`${databasePath}${suffix}`, { force: true });
}

process.env.TICKETS_DB_PATH = databasePath;
process.env.NODE_ENV = "test";

const bootstrap = new Database(databasePath);
bootstrap.pragma("foreign_keys = ON");
bootstrap.exec(`
  CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT,
    username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    debe_cambiar_password INTEGER NOT NULL DEFAULT 1 CHECK (debe_cambiar_password IN (0, 1)),
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_expiracion INTEGER NOT NULL,
    fecha_creacion INTEGER NOT NULL DEFAULT 0
  );
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
  CREATE TABLE seguimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    nota TEXT NOT NULL,
    estado_anterior TEXT,
    estado_nuevo TEXT,
    prioridad_anterior TEXT,
    prioridad_nueva TEXT,
    asignado_anterior_usuario_id INTEGER,
    asignado_anterior TEXT,
    asignado_nuevo_usuario_id INTEGER,
    asignado_nuevo TEXT,
    campos_editados TEXT,
    autor TEXT,
    fecha_creacion INTEGER NOT NULL
  );
`);
bootstrap.close();

const [
  { default: authRouter },
  { default: adminRouter },
  { ensureTicketQuarantineProjection, sqlite },
  { requirePasswordChangeCompleted, requireSession },
  { hashPassword },
] = await Promise.all([
  import("../src/modules/auth/index.ts"),
  import("../src/modules/administracion/index.ts"),
  import("@workspace/db"),
  import("../src/modules/auth/application/session.ts"),
  import("../src/modules/auth/security/passwords.ts"),
]);
ensureTicketQuarantineProjection(sqlite);

const password = "Clave-Bulk-2026-segura";
const passwordHash = await hashPassword(password);
sqlite
  .prepare(
    "INSERT INTO roles (id, nombre) VALUES (1, 'SysAdmin'), (2, 'Operador')",
  )
  .run();
const insertUser = sqlite.prepare(`
  INSERT INTO usuarios
    (id, nombre, username, email, password_hash, debe_cambiar_password, role_id)
  VALUES (?, ?, ?, ?, ?, 0, ?)
`);
insertUser.run(1, "Sistema", "sysadmin", "sysadmin@bulk.test", passwordHash, 1);
insertUser.run(
  2,
  "Operador",
  "operador",
  "operador@bulk.test",
  passwordHash,
  2,
);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
app.use(requireSession);
app.use(requirePasswordChangeCompleted);
app.use(adminRouter);
app.use(
  (
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(500).json({ error: "Error de prueba" });
  },
);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "el login debe devolver una cookie de sesión");
  return header.split(";", 1)[0];
}

async function loginAs(username: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: username, password }),
  });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

const adminCookie = await loginAs("sysadmin");
const operatorCookie = await loginAs("operador");

function adminPost(path: "/admin/import" | "/admin/truncate", body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify(body),
  });
}

function tableCount(
  table: "tickets" | "seguimientos" | "tickets_cuarentena",
): number {
  const row = sqlite
    .prepare(`SELECT count(*) AS total FROM ${table}`)
    .get() as { total: number };
  return row.total;
}

beforeEach(() => {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS fail_import_row;
    DROP TRIGGER IF EXISTS fail_ticket_delete;
    DELETE FROM seguimientos;
    DELETE FROM tickets;
    DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'seguimientos');
  `);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  sqlite.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe("operaciones administrativas masivas", () => {
  it("conserva el guard de rol del router administrativo padre", async () => {
    const withoutSysAdminRole = await fetch(`${baseUrl}/admin/truncate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie,
      },
      body: JSON.stringify({ confirmar: true }),
    });
    assert.equal(withoutSysAdminRole.status, 403);
    assert.equal(tableCount("tickets"), 0);
  });

  it("revierte toda la importacion si falla el insert de una fila", async () => {
    sqlite.exec(`
      CREATE TRIGGER fail_import_row
      BEFORE INSERT ON tickets
      WHEN NEW.conversation_id = 'forzar-fallo'
      BEGIN
        SELECT RAISE(ABORT, 'fallo de importacion forzado');
      END;
    `);

    const csv = [
      "conversation_id;nombre;motivo",
      "primero;Sin nombre proporcionado;Sin especificar",
      "forzar-fallo;Bruno;Consulta",
    ].join("\n");
    const failed = await adminPost("/admin/import", { csv });

    assert.equal(failed.status, 500);
    assert.equal(tableCount("tickets"), 0);
    assert.equal(tableCount("tickets_cuarentena"), 0);

    sqlite.exec("DROP TRIGGER fail_import_row");
    const imported = await adminPost("/admin/import", { csv });
    assert.equal(imported.status, 200);
    assert.deepEqual(await imported.json(), {
      dry_run: false,
      filas: 2,
      insertados: 2,
      ya_existentes: 0,
      invalidos: 0,
      columnas: [
        { columna: "conversation_id", campo: "conversation_id" },
        { columna: "nombre", campo: "nombre" },
        { columna: "motivo", campo: "motivo" },
      ],
      sin_mapear: [],
      advertencias: [],
    });
    assert.equal(tableCount("tickets"), 2);
    assert.equal(tableCount("tickets_cuarentena"), 1);
  });

  it("serializa importaciones simultaneas del mismo ticket", async () => {
    const csv = "conversation_id;nombre\nconcurrente;Ana";
    const responses = await Promise.all([
      adminPost("/admin/import", { csv }),
      adminPost("/admin/import", { csv }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
    );
    const results = (await Promise.all(
      responses.map((response) => response.json()),
    )) as Array<{ insertados: number; ya_existentes: number }>;
    assert.deepEqual(
      results
        .map(({ insertados, ya_existentes }) => ({
          insertados,
          ya_existentes,
        }))
        .sort((left, right) => right.insertados - left.insertados),
      [
        { insertados: 1, ya_existentes: 0 },
        { insertados: 0, ya_existentes: 1 },
      ],
    );
    assert.equal(tableCount("tickets"), 1);
  });

  it("simula y deduplica sin escribir filas ni secuencias", async () => {
    const csv = [
      "conversation_id;nombre",
      "simulado;Ana",
      "simulado;Ana repetida",
    ].join("\n");
    const response = await adminPost("/admin/import", {
      csv,
      dry_run: true,
    });

    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      dry_run: boolean;
      insertados: number;
      ya_existentes: number;
    };
    assert.deepEqual(
      {
        dry_run: result.dry_run,
        insertados: result.insertados,
        ya_existentes: result.ya_existentes,
      },
      { dry_run: true, insertados: 1, ya_existentes: 1 },
    );
    assert.equal(tableCount("tickets"), 0);
    const sequence = sqlite
      .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'tickets'")
      .get();
    assert.equal(sequence, undefined);
  });

  it("revierte tickets, seguimientos y secuencias si falla el truncate", async () => {
    const ticket = sqlite
      .prepare(
        `INSERT INTO tickets
         (conversation_id, hora, nombre, apellido, motivo, fecha_creacion)
         VALUES ('con-seguimiento', '09:00', 'Ana', '', 'Consulta', 1)
         RETURNING id`,
      )
      .get() as { id: number };
    sqlite
      .prepare(
        `INSERT INTO seguimientos (ticket_id, nota, fecha_creacion)
         VALUES (?, 'Seguimiento', 1)`,
      )
      .run(ticket.id);
    sqlite
      .prepare(
        `INSERT INTO tickets
         (conversation_id, hora, nombre, apellido, motivo, fecha_creacion)
         VALUES ('vacio', '09:00', 'Sin nombre proporcionado', '', 'Sin especificar', 1)`,
      )
      .run();
    assert.equal(tableCount("tickets_cuarentena"), 1);
    sqlite.exec(`
      CREATE TRIGGER fail_ticket_delete
      BEFORE DELETE ON tickets
      BEGIN
        SELECT RAISE(ABORT, 'fallo de truncate forzado');
      END;
    `);

    const failed = await adminPost("/admin/truncate", { confirmar: true });
    assert.equal(failed.status, 500);
    assert.equal(tableCount("tickets"), 2);
    assert.equal(tableCount("seguimientos"), 1);
    assert.equal(tableCount("tickets_cuarentena"), 1);

    sqlite.exec("DROP TRIGGER fail_ticket_delete");
    const truncated = await adminPost("/admin/truncate", { confirmar: true });
    assert.equal(truncated.status, 200);
    assert.deepEqual(await truncated.json(), {
      tickets_eliminados: 2,
      seguimientos_eliminados: 1,
    });
    assert.equal(tableCount("tickets"), 0);
    assert.equal(tableCount("seguimientos"), 0);
    assert.equal(tableCount("tickets_cuarentena"), 0);

    const next = sqlite
      .prepare(
        `INSERT INTO tickets
         (conversation_id, hora, nombre, apellido, motivo, fecha_creacion)
         VALUES ('nuevo', '09:00', 'Bruno', '', 'Consulta', 1)
         RETURNING id`,
      )
      .get() as { id: number };
    assert.equal(next.id, 1);

    const nextFollowUp = sqlite
      .prepare(
        `INSERT INTO seguimientos (ticket_id, nota, fecha_creacion)
         VALUES (?, 'Nuevo seguimiento', 1)
         RETURNING id`,
      )
      .get(next.id) as { id: number };
    assert.equal(nextFollowUp.id, 1);
  });
});
