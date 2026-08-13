import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { after, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import express from "express";
import {
  GetDashboardStatsResponse,
  GetMotivoStatsResponse,
} from "@workspace/api-zod";
import { businessDayWindow } from "../src/modules/dashboard/application/date-range";

const testDirectory = join(process.cwd(), "tmp", "dashboard-route-tests");
const databasePath = join(testDirectory, `dashboard-${process.pid}.db`);
const indexMigrationSql = readFileSync(
  new URL(
    "../../lib/db/drizzle/0013_add_seguimientos_lookup_index.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
const quarantineMigrationSql = readFileSync(
  new URL(
    "../../lib/db/drizzle/0014_materialize_ticket_quarantine.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });
process.env.TICKETS_DB_PATH = databasePath;

const bootstrap = new Database(databasePath);
bootstrap.pragma("foreign_keys = ON");
bootstrap.exec(`
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
    fecha_creacion INTEGER NOT NULL
  );
`);
bootstrap.exec(indexMigrationSql);
bootstrap.exec(quarantineMigrationSql);
bootstrap.close();

const [{ crearDashboardStatsHandler, default: dashboardRouter }, { sqlite }] =
  await Promise.all([
    import("../src/modules/dashboard/index.ts"),
    import("@workspace/db"),
  ]);

const fixedNow = new Date("2026-08-06T14:00:00.000Z");
const app = express();
app.get(
  "/dashboard/stats",
  crearDashboardStatsHandler({ now: () => fixedNow }),
);
app.use(dashboardRouter);
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

function insertTicket(input: {
  conversationId: string;
  createdAt: Date;
  resolvedAt?: Date;
  name?: string;
  reason?: string;
  category?: string;
  status?: string;
  priority?: string;
}): void {
  sqlite
    .prepare(
      `
      INSERT INTO tickets (
        conversation_id, hora, nombre, apellido, motivo, motivo_categoria,
        estado, prioridad, fecha_creacion, fecha_resolucion
      ) VALUES (?, '10:00', ?, '', ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      input.conversationId,
      input.name ?? "Persona identificada",
      input.reason ?? "Consulta",
      input.category ?? "sin_clasificar",
      input.status ?? "nuevo",
      input.priority ?? "media",
      input.createdAt.getTime(),
      input.resolvedAt?.getTime() ?? null,
    );
}

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM seguimientos;
    DELETE FROM tickets;
    DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'seguimientos');
  `);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  sqlite.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("rutas agregadas del dashboard", () => {
  it("aplica el rango local, conserva el contrato y excluye cuarentena", async () => {
    const fixedStart = new Date("2020-04-10T03:00:00.000Z");
    insertTicket({
      conversationId: "periodo",
      createdAt: fixedStart,
      resolvedAt: new Date("2020-04-10T05:00:00.000Z"),
      category: "legales",
      status: "resuelto",
      priority: "alta",
    });
    insertTicket({
      conversationId: "dia-siguiente",
      createdAt: new Date("2020-04-11T03:00:00.000Z"),
      category: "reclamos",
    });
    insertTicket({
      conversationId: "vacio-en-periodo",
      createdAt: new Date("2020-04-10T04:00:00.000Z"),
      name: "Sin nombre proporcionado",
      reason: "Sin especificar",
    });

    const currentDay = businessDayWindow(fixedNow);
    insertTicket({
      conversationId: "hoy",
      createdAt: new Date(currentDay.start.getTime() + 60 * 60_000),
      resolvedAt: new Date(currentDay.start.getTime() + 2 * 60 * 60_000),
      category: "embargos",
      status: "cerrado",
      priority: "urgente",
    });

    const statsResponse = await fetch(
      `${baseUrl}/dashboard/stats?fecha_desde=2020-04-10&fecha_hasta=2020-04-10`,
    );
    assert.equal(statsResponse.status, 200);
    const stats = GetDashboardStatsResponse.parse(await statsResponse.json());
    assert.deepEqual(stats, {
      total: 1,
      por_estado: [{ estado: "resuelto", cantidad: 1 }],
      por_prioridad: [{ prioridad: "alta", cantidad: 1 }],
      vencidos: 0,
      resueltos_hoy: 1,
      nuevos_hoy: 1,
      resueltos_periodo: 1,
      nuevos_periodo: 1,
      tiempo_promedio_resolucion: 2,
    });

    const motivosResponse = await fetch(
      `${baseUrl}/dashboard/motivos?fecha_desde=2020-04-10&fecha_hasta=2020-04-10`,
    );
    assert.equal(motivosResponse.status, 200);
    assert.deepEqual(
      GetMotivoStatsResponse.parse(await motivosResponse.json()),
      [{ categoria: "legales", motivo: "Legales", cantidad: 1 }],
    );
  });

  it("rechaza periodos invertidos o fechas que no son calendario ISO", async () => {
    for (const query of [
      "fecha_desde=2020-04-11&fecha_hasta=2020-04-10",
      "fecha_desde=10-04-2020",
    ]) {
      const response = await fetch(`${baseUrl}/dashboard/stats?${query}`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error:
          "El periodo indicado no es valido. Revisá las fechas desde y hasta.",
      });
    }
  });
});
