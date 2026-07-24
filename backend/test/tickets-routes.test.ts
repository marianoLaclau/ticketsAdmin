import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import express from "express";

const testDirectory = join(process.cwd(), "tmp", "backend-route-tests");
const databasePath = join(testDirectory, `tickets-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });

process.env.TICKETS_DB_PATH = databasePath;
process.env.ADMIN_API_KEY = "admin-test-key";

const bootstrap = new Database(databasePath);
bootstrap.pragma("foreign_keys = ON");
bootstrap.exec(`
  CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL,
    fecha_actualizacion INTEGER NOT NULL
  );
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    apellido TEXT,
    username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion INTEGER NOT NULL,
    fecha_actualizacion INTEGER NOT NULL
  );
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL UNIQUE,
    hora TEXT NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    telefono TEXT,
    dni TEXT,
    empresa TEXT,
    email TEXT,
    motivo TEXT NOT NULL,
    motivo_categoria TEXT NOT NULL DEFAULT 'sin_clasificar',
    resumen TEXT,
    notificado INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    prioridad TEXT NOT NULL DEFAULT 'media',
    asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
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
    asignado_anterior_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    asignado_anterior TEXT,
    asignado_nuevo_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    asignado_nuevo TEXT,
    campos_editados TEXT,
    autor TEXT,
    fecha_creacion INTEGER NOT NULL
  );
`);
bootstrap.close();

const [{ default: ticketsRouter }, { sqlite }] = await Promise.all([
  import("../src/routes/tickets.ts"),
  import("@workspace/db"),
]);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const userId = Number(req.header("x-test-user") ?? "1");
  res.locals.authUser = {
    id: userId,
    nombre: userId === 2 ? "Sistema" : "Operadora",
    apellido: userId === 2 ? "Admin" : "Uno",
    email: userId === 2 ? "sys@example.test" : "operadora@example.test",
    rol: req.header("x-test-role") ?? "Operador",
  };
  next();
});
app.use(ticketsRouter);
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

interface RequestOptions extends RequestInit {
  role?: string;
  userId?: number;
  adminKey?: string;
}

function request(path: string, options: RequestOptions = {}) {
  const { role, userId, adminKey, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("x-test-role", role ?? "Operador");
  requestHeaders.set("x-test-user", String(userId ?? 1));
  if (adminKey !== undefined) requestHeaders.set("x-admin-key", adminKey);
  if (init.body !== undefined) requestHeaders.set("Content-Type", "application/json");

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: requestHeaders,
  });
}

function jsonRequest(
  path: string,
  method: "PATCH" | "POST",
  body: Record<string, unknown>,
  options: Omit<RequestOptions, "method" | "body"> = {},
) {
  return request(path, {
    ...options,
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS fail_ticket_audit;
    DELETE FROM seguimientos;
    DELETE FROM tickets;
    DELETE FROM usuarios;
    DELETE FROM roles;

    INSERT INTO roles (
      id, nombre, activo, fecha_creacion, fecha_actualizacion
    ) VALUES
      (1, 'Operador', 1, 1, 1),
      (2, 'SysAdmin', 1, 1, 1);
    INSERT INTO usuarios (
      id, nombre, apellido, username, email, role_id, activo,
      fecha_creacion, fecha_actualizacion
    ) VALUES
      (1, 'Operadora', 'Uno', 'operadora', 'operadora@example.test', 1, 1, 1, 1),
      (2, 'Sistema', 'Admin', 'sysadmin', 'sys@example.test', 2, 1, 1, 1);

    INSERT INTO tickets (
      id, conversation_id, hora, nombre, apellido, telefono, empresa, email,
      motivo, motivo_categoria, resumen, notificado, estado, prioridad,
      progreso, fecha_creacion, fecha_limite
    ) VALUES
      (1, 'conv-1', '09:15', 'Ana', 'Perez', '1111', 'Alfa',
       'ana@example.test', 'Consulta general', 'sin_clasificar', NULL, 0,
       'nuevo', 'media', 0, 1784721600000, 1784894400000),
      (2, 'conv-2', '10:30', 'Bruno', 'Diaz', '2222', 'Beta',
       'bruno@example.test', 'Reclamo', 'reclamos', NULL, 0,
       'pendiente', 'urgente', 50, 1784808000000, 1784894400000),
      (3, 'conv-empty', '00:00', 'Sin nombre proporcionado', '', NULL, NULL,
       NULL, 'Sin especificar', 'sin_clasificar', NULL, 0, 'nuevo', 'media',
       0, 1784808000000, 1784980800000);
  `);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  sqlite.close();
  rmSync(databasePath, { force: true });
});

describe("listado y exportación de tickets", () => {
  it("aplica sort_by antes de paginar y excluye la cuarentena", async () => {
    const response = await request(
      "/tickets?sort_by=prioridad&order=desc&page=1&limit=1",
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      tickets: Array<{ id: number }>;
      total: number;
    };
    assert.deepEqual(body.tickets.map(({ id }) => id), [2]);
    assert.equal(body.total, 2);
  });

  it("aplica el orden compuesto antes de paginar y prioriza sort sobre el contrato anterior", async () => {
    sqlite
      .prepare("UPDATE tickets SET prioridad = 'media' WHERE id IN (1, 2)")
      .run();

    const response = await request(
      "/tickets?sort=prioridad:asc,contacto:desc&sort_by=id&order=asc&page=1&limit=2",
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      tickets: Array<{ id: number }>;
      total: number;
    };
    assert.deepEqual(body.tickets.map(({ id }) => id), [2, 1]);
    assert.equal(body.total, 2);
  });

  it("rechaza un orden compuesto inválido", async () => {
    const duplicated = await request(
      "/tickets?sort=contacto:asc,contacto:desc",
    );
    assert.equal(duplicated.status, 400);

    const unknownColumn = await request("/tickets?sort=desconocida:asc");
    assert.equal(unknownColumn.status, 400);

    const invalidExport = await request(
      "/tickets/export.csv?sort=contacto:asc,contacto:desc",
    );
    assert.equal(invalidExport.status, 400);
  });

  it("exporta todos los resultados filtrados como CSV descargable", async () => {
    const response = await request(
      "/tickets/export.csv?prioridad=urgente&sort_by=id&order=asc",
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /^attachment; filename="tickets-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");

    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    assert.match(csv, /"conv-2"/);
    assert.doesNotMatch(csv, /"conv-1"/);
    assert.doesNotMatch(csv, /"conv-empty"/);
  });

  it("exporta el CSV con el mismo orden compuesto", async () => {
    sqlite
      .prepare("UPDATE tickets SET prioridad = 'media' WHERE id IN (1, 2)")
      .run();

    const response = await request(
      "/tickets/export.csv?sort=prioridad:asc,contacto:desc",
    );
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.ok(csv.indexOf('"conv-2"') < csv.indexOf('"conv-1"'));
    assert.doesNotMatch(csv, /"conv-empty"/);
  });
});

describe("acceso a registros en cuarentena", () => {
  it("exige SysAdmin y llave en detalle, PATCH y seguimientos", async () => {
    const detailAsOperator = await request("/tickets/3?incluir_vacios=true");
    assert.equal(detailAsOperator.status, 403);

    const detailWithoutKey = await request("/tickets/3?incluir_vacios=true", {
      role: "SysAdmin",
      userId: 2,
    });
    assert.equal(detailWithoutKey.status, 401);

    const detail = await request("/tickets/3?incluir_vacios=true", {
      role: "SysAdmin",
      userId: 2,
      adminKey: "admin-test-key",
    });
    assert.equal(detail.status, 200);

    const patchWithoutKey = await jsonRequest(
      "/tickets/3?incluir_vacios=true",
      "PATCH",
      { nombre: "Persona identificada" },
      { role: "SysAdmin", userId: 2 },
    );
    assert.equal(patchWithoutKey.status, 401);

    const historyWithoutKey = await request(
      "/tickets/3/seguimientos?incluir_vacios=true",
      { role: "SysAdmin", userId: 2 },
    );
    assert.equal(historyWithoutKey.status, 401);

    const followUpWithoutKey = await jsonRequest(
      "/tickets/3/seguimientos?incluir_vacios=true",
      "POST",
      { nota: "Revisado" },
      { role: "SysAdmin", userId: 2 },
    );
    assert.equal(followUpWithoutKey.status, 401);
  });
});

describe("edición y auditoría atómica", () => {
  it("permite enriquecer datos funcionales y registra snapshots reales", async () => {
    const response = await jsonRequest("/tickets/1", "PATCH", {
      nombre: "  Ana María  ",
      telefono: "  1133334444  ",
      motivo: "Embargo de sueldo",
      estado: "en_proceso",
      prioridad: "alta",
    });
    assert.equal(response.status, 200);
    const ticket = (await response.json()) as {
      nombre: string;
      telefono: string;
      motivo_categoria: string;
      asignado_usuario_id: number;
      asignado_a: string;
    };
    assert.equal(ticket.nombre, "Ana María");
    assert.equal(ticket.telefono, "1133334444");
    assert.equal(ticket.motivo_categoria, "embargos");
    assert.equal(ticket.asignado_usuario_id, 1);
    assert.equal(ticket.asignado_a, "Operadora Uno");

    const detailResponse = await request("/tickets/1");
    const detail = (await detailResponse.json()) as {
      seguimientos: Array<Record<string, unknown>>;
    };
    assert.equal(detail.seguimientos.length, 1);
    assert.deepEqual(
      {
        estado_anterior: detail.seguimientos[0]?.estado_anterior,
        estado_nuevo: detail.seguimientos[0]?.estado_nuevo,
        prioridad_anterior: detail.seguimientos[0]?.prioridad_anterior,
        prioridad_nueva: detail.seguimientos[0]?.prioridad_nueva,
        asignado_anterior_usuario_id:
          detail.seguimientos[0]?.asignado_anterior_usuario_id,
        asignado_nuevo_usuario_id:
          detail.seguimientos[0]?.asignado_nuevo_usuario_id,
        autor: detail.seguimientos[0]?.autor,
      },
      {
        estado_anterior: "nuevo",
        estado_nuevo: "en_proceso",
        prioridad_anterior: "media",
        prioridad_nueva: "alta",
        asignado_anterior_usuario_id: null,
        asignado_nuevo_usuario_id: 1,
        autor: "Operadora Uno",
      },
    );
    assert.deepEqual(detail.seguimientos[0]?.campos_editados, [
      "nombre",
      "telefono",
      "motivo",
    ]);

    const noOp = await jsonRequest("/tickets/1", "PATCH", {
      nombre: "Ana María",
    });
    assert.equal(noOp.status, 200);
    const [{ total }] = sqlite
      .prepare("SELECT count(*) AS total FROM seguimientos WHERE ticket_id = 1")
      .all() as Array<{ total: number }>;
    assert.equal(total, 1);
  });

  it("revierte el ticket si falla la inserción de su auditoría", async () => {
    sqlite.exec(`
      CREATE TRIGGER fail_ticket_audit
      BEFORE INSERT ON seguimientos
      BEGIN
        SELECT RAISE(ABORT, 'auditoria no disponible');
      END;
    `);

    const response = await jsonRequest("/tickets/1", "PATCH", {
      nombre: "Nombre que debe revertirse",
    });
    assert.equal(response.status, 500);

    const row = sqlite
      .prepare("SELECT nombre FROM tickets WHERE id = 1")
      .get() as { nombre: string };
    assert.equal(row.nombre, "Ana");
  });

  it("mantiene los campos técnicos detrás de SysAdmin y la llave", async () => {
    const deadline = "2026-07-30T12:00:00.000Z";
    const asOperator = await jsonRequest("/tickets/1", "PATCH", {
      fecha_limite: deadline,
    });
    assert.equal(asOperator.status, 403);

    const withoutKey = await jsonRequest(
      "/tickets/1",
      "PATCH",
      { fecha_limite: deadline },
      { role: "SysAdmin", userId: 2 },
    );
    assert.equal(withoutKey.status, 401);

    const asAdmin = await jsonRequest(
      "/tickets/1",
      "PATCH",
      { fecha_limite: deadline },
      { role: "SysAdmin", userId: 2, adminKey: "admin-test-key" },
    );
    assert.equal(asAdmin.status, 200);
  });
});

describe("validacion estricta de fechas en PATCH", () => {
  const adminOptions = {
    role: "SysAdmin",
    userId: 2,
    adminKey: "admin-test-key",
  } as const;

  it("rechaza null, false, 0, formatos locales y fechas imposibles", async () => {
    const invalidValues: Array<[string, unknown]> = [
      ["null", null],
      ["false", false],
      ["cero", 0],
      ["formato local", "30/07/2026 12:00"],
      ["sin zona", "2026-07-30T12:00:00"],
      ["fecha imposible", "2026-02-30T12:00:00Z"],
    ];

    for (const field of ["fecha_limite", "fecha_resolucion"] as const) {
      for (const [caseName, value] of invalidValues) {
        const response = await jsonRequest(
          "/tickets/1",
          "PATCH",
          { [field]: value },
          adminOptions,
        );
        assert.equal(
          response.status,
          400,
          `${field} debe rechazar el caso ${caseName}`,
        );
        const body = (await response.json()) as { error?: string };
        assert.match(body.error ?? "", /RFC3339/);
      }
    }

    const [{ total }] = sqlite
      .prepare("SELECT count(*) AS total FROM seguimientos WHERE ticket_id = 1")
      .all() as Array<{ total: number }>;
    assert.equal(total, 0);
  });

  it("acepta date-time RFC3339 valido con Z u offset", async () => {
    const deadline = "2026-07-30T12:00:00.000Z";
    const resolution = "2026-07-30T09:45:30-03:00";
    const response = await jsonRequest(
      "/tickets/1",
      "PATCH",
      {
        fecha_limite: deadline,
        fecha_resolucion: resolution,
      },
      adminOptions,
    );
    assert.equal(response.status, 200);

    const stored = sqlite
      .prepare(
        "SELECT fecha_limite, fecha_resolucion FROM tickets WHERE id = 1",
      )
      .get() as { fecha_limite: number; fecha_resolucion: number };
    assert.equal(stored.fecha_limite, Date.parse(deadline));
    assert.equal(stored.fecha_resolucion, Date.parse(resolution));
  });
});

describe("validación de email en PATCH", () => {
  it("rechaza emails inválidos y acepta un valor válido o vacío", async () => {
    for (const email of ["ana@", "ana example.com", 123, false]) {
      const response = await jsonRequest("/tickets/1", "PATCH", { email });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error?: string };
      assert.match(body.error ?? "", /email/i);
    }

    const valid = await jsonRequest("/tickets/1", "PATCH", {
      email: "  nueva@example.com  ",
    });
    assert.equal(valid.status, 200);

    const cleared = await jsonRequest("/tickets/1", "PATCH", { email: "   " });
    assert.equal(cleared.status, 200);

    const row = sqlite
      .prepare("SELECT email FROM tickets WHERE id = 1")
      .get() as { email: string | null };
    assert.equal(row.email, null);
  });
});

describe("fecha de resolución al reabrir", () => {
  it("la limpia al reabrir y genera una nueva al resolver otra vez", async () => {
    sqlite
      .prepare("UPDATE tickets SET estado = 'resuelto', fecha_resolucion = ? WHERE id = 1")
      .run(Date.parse("2026-07-21T12:00:00Z"));

    const reopened = await jsonRequest("/tickets/1", "PATCH", {
      estado: "en_proceso",
    });
    assert.equal(reopened.status, 200);
    let row = sqlite
      .prepare("SELECT estado, fecha_resolucion FROM tickets WHERE id = 1")
      .get() as { estado: string; fecha_resolucion: number | null };
    assert.deepEqual(row, { estado: "en_proceso", fecha_resolucion: null });

    const resolved = await jsonRequest("/tickets/1", "PATCH", {
      estado: "resuelto",
    });
    assert.equal(resolved.status, 200);
    row = sqlite
      .prepare("SELECT estado, fecha_resolucion FROM tickets WHERE id = 1")
      .get() as { estado: string; fecha_resolucion: number | null };
    assert.equal(row.estado, "resuelto");
    assert.ok((row.fecha_resolucion ?? 0) > Date.parse("2026-07-21T12:00:00Z"));
  });
});

describe("seguimientos manuales", () => {
  it("solo admite nota, deriva el autor y ordena por fecha e id", async () => {
    const forged = await jsonRequest("/tickets/1/seguimientos", "POST", {
      nota: "Intento",
      autor: "Falsificado",
      estado_nuevo: "cerrado",
    });
    assert.equal(forged.status, 400);

    const blank = await jsonRequest("/tickets/1/seguimientos", "POST", {
      nota: "   ",
    });
    assert.equal(blank.status, 400);

    const created = await jsonRequest("/tickets/1/seguimientos", "POST", {
      nota: "  Nota real  ",
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as { nota: string; autor: string };
    assert.equal(body.nota, "Nota real");
    assert.equal(body.autor, "Operadora Uno");

    sqlite
      .prepare(
        "INSERT INTO seguimientos (id, ticket_id, nota, fecha_creacion) VALUES (?, ?, ?, ?)",
      )
      .run(20, 1, "Segundo mismo instante", 100);
    sqlite
      .prepare(
        "INSERT INTO seguimientos (id, ticket_id, nota, fecha_creacion) VALUES (?, ?, ?, ?)",
      )
      .run(10, 1, "Primero mismo instante", 100);

    const historyResponse = await request("/tickets/1/seguimientos");
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()) as Array<{
      id: number;
      nota: string;
    }>;
    assert.deepEqual(
      history.slice(0, 2).map(({ id }) => id),
      [10, 20],
    );
  });
});
