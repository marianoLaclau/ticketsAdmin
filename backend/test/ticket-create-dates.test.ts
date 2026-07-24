import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "backend-create-date-tests");
const databasePath = join(testDirectory, `tickets-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.ADMIN_API_KEY = "admin-create-test-key";
process.env.WEBHOOK_API_KEY = "webhook-create-test-key";

const bootstrap = new Database(databasePath);
bootstrap.exec(`
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  { default: webhooksRouter },
  { default: adminRouter },
  { sqlite },
] = await Promise.all([
  import("../src/routes/webhooks.ts"),
  import("../src/routes/admin.ts"),
  import("@workspace/db"),
]);

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.locals.authUser = {
    id: 1,
    nombre: "Sistema",
    apellido: "Admin",
    email: "sys@example.test",
    rol: "SysAdmin",
  };
  next();
});
app.use(webhooksRouter);
app.use(adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

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
    headers["x-admin-key"] = "admin-create-test-key";
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
      const response = await createRequest(path, `valid-${path.slice(1)}`, deadline);
      assert.equal(response.status, 201);

      const { fecha_limite } = sqlite
        .prepare("SELECT fecha_limite FROM tickets LIMIT 1")
        .get() as { fecha_limite: number };
      assert.equal(fecha_limite, Date.parse(deadline));
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
        "SELECT autor, nota FROM seguimientos WHERE ticket_id = ? ORDER BY id",
      )
      .all(ticket.id) as Array<{ autor: string; nota: string }>;
    assert.deepEqual(seguimientos, [
      {
        autor: "Sistema",
        nota: "Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.",
      },
    ]);
  });
});
