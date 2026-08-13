import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "backend-create-date-tests");
const databasePath = join(testDirectory, `tickets-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.WEBHOOK_API_KEY = "webhook-create-test-key";
process.env.NODE_ENV = "test";

const bootstrap = new Database(databasePath);
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
    autor_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    autor TEXT,
    fecha_limite_snapshot INTEGER,
    fecha_creacion INTEGER NOT NULL
  );
`);
bootstrap.close();

const [
  { default: webhooksRouter },
  { default: authRouter },
  { default: adminRouter },
  { ensureTicketQuarantineProjection, sqlite },
  { requirePasswordChangeCompleted, requireSession },
  { hashPassword },
] = await Promise.all([
  import("../src/modules/ingestion/index.ts"),
  import("../src/modules/auth/index.ts"),
  import("../src/modules/administracion/index.ts"),
  import("@workspace/db"),
  import("../src/modules/auth/application/session.ts"),
  import("../src/modules/auth/security/passwords.ts"),
]);
ensureTicketQuarantineProjection(sqlite);

const password = "Clave-Create-2026-segura";
const passwordHash = await hashPassword(password);
sqlite.prepare("INSERT INTO roles (id, nombre) VALUES (1, 'SysAdmin')").run();
sqlite
  .prepare(
    `
    INSERT INTO usuarios
      (id, nombre, username, email, password_hash, debe_cambiar_password, role_id)
    VALUES (1, 'Sistema', 'sysadmin', 'sysadmin@create.test', ?, 0, 1)
  `,
  )
  .run(passwordHash);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(webhooksRouter);
app.use(authRouter);
app.use(requireSession);
app.use(requirePasswordChangeCompleted);
app.use(adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

const login = await fetch(`${baseUrl}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ usuario: "sysadmin", password }),
});
assert.equal(login.status, 200);
const setCookie = login.headers.get("set-cookie");
assert.ok(setCookie, "el login debe devolver una cookie de sesión");
const adminCookie = setCookie.split(";", 1)[0];

function ticketBody(conversationId: string, fechaLimite: unknown) {
  return {
    conversation_id: conversationId,
    hora: "10:30",
    nombre: "Prueba",
    apellido: "Fecha",
    motivo: "Consulta general",
    fecha_limite: fechaLimite,
  };
}

function createRequest(
  path: "/webhooks/ticket" | "/admin/tickets",
  conversationId: string,
  fechaLimite: unknown,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (path === "/webhooks/ticket") {
    headers["x-api-key"] = "webhook-create-test-key";
  } else {
    headers.cookie = adminCookie;
    headers["x-admin-intent"] = "1";
  }

  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(ticketBody(conversationId, fechaLimite)),
  });
}

beforeEach(() => {
  sqlite.exec("DELETE FROM seguimientos; DELETE FROM tickets");
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  sqlite.close();
  rmSync(databasePath, { force: true });
});

describe("fecha límite en altas de tickets", () => {
  for (const path of ["/webhooks/ticket", "/admin/tickets"] as const) {
    it(`${path} rechaza coerciones y fechas imposibles`, async () => {
      const invalidValues: Array<[string, unknown]> = [
        ["null", null],
        ["false", false],
        ["cero", 0],
        ["sin zona", "2026-07-30T12:00:00"],
        ["imposible", "2026-02-30T12:00:00Z"],
      ];

      for (const [name, value] of invalidValues) {
        const response = await createRequest(
          path,
          `${path.replaceAll("/", "-")}-${name}`,
          value,
        );
        assert.equal(response.status, 400, `${path} debe rechazar ${name}`);
        const body = (await response.json()) as { error?: string };
        assert.match(body.error ?? "", /RFC3339/);
      }

      const { total } = sqlite
        .prepare("SELECT count(*) AS total FROM tickets")
        .get() as { total: number };
      assert.equal(total, 0);
    });

    it(`${path} acepta RFC3339 con zona y conserva el instante`, async () => {
      const deadline = "2026-07-30T09:45:30-03:00";
      const response = await createRequest(
        path,
        `valid-${path.slice(1)}`,
        deadline,
      );
      assert.equal(response.status, 201);

      const { fecha_limite } = sqlite
        .prepare("SELECT fecha_limite FROM tickets LIMIT 1")
        .get() as { fecha_limite: number };
      assert.equal(fecha_limite, Date.parse(deadline));
      const { total_cuarentena } = sqlite
        .prepare("SELECT count(*) AS total_cuarentena FROM tickets_cuarentena")
        .get() as { total_cuarentena: number };
      assert.equal(total_cuarentena, 0);
    });
  }
});

describe("ingesta integrada desde Serin", () => {
  it("persiste el estado laboral y crea un solo seguimiento idempotente", async () => {
    const body = {
      conversation_id: "serin-integrado",
      hora: "10:30",
      nombre: "Persona",
      apellido: "Prueba",
      dni: "12345678",
      empresa: "Empresa Serin",
      estado_empleado: "Activo",
      motivo: "Consulta general",
    };

    const create = () =>
      fetch(`${baseUrl}/webhooks/ticket`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "webhook-create-test-key",
        },
        body: JSON.stringify(body),
      });

    const first = await create();
    assert.equal(first.status, 201);
    const second = await create();
    assert.equal(second.status, 200);

    const ticket = sqlite
      .prepare(
        "SELECT id, estado_empleado FROM tickets WHERE conversation_id = ?",
      )
      .get(body.conversation_id) as {
      id: number;
      estado_empleado: string;
    };
    assert.equal(ticket.estado_empleado, "Activo");

    const seguimientos = sqlite
      .prepare(
        `SELECT autor_usuario_id, autor, nota
         FROM seguimientos WHERE ticket_id = ? ORDER BY id`,
      )
      .all(ticket.id) as Array<{
      autor_usuario_id: number | null;
      autor: string;
      nota: string;
    }>;
    assert.deepEqual(seguimientos, [
      {
        autor_usuario_id: null,
        autor: "Sistema",
        nota: "Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.",
      },
    ]);
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT count(*) AS total FROM tickets_cuarentena WHERE ticket_id = ?",
          )
          .get(ticket.id) as { total: number }
      ).total,
      0,
    );
  });
});
