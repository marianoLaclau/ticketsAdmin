import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  esTicketVacio,
  ticketVacioCondition,
  ticketVisibleCondition,
  type TicketVisibilityInput,
} from "../src/ticket-visibility";
import {
  ensureTicketQuarantineProjection,
  TICKET_QUARANTINE_TRIGGER_NAMES,
} from "../src/ticket-quarantine-projection";
import { ticketsTable } from "../src/schema/tickets";

const indexMigrationSql = readFileSync(
  new URL("../drizzle/0013_add_seguimientos_lookup_index.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
const quarantineMigrationSql = readFileSync(
  new URL("../drizzle/0014_materialize_ticket_quarantine.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

interface QueryPlanStep {
  detail: string;
}

interface VisibilityCase {
  label: string;
  patch?: TicketVisibilityInput;
  tieneSeguimientos?: boolean;
}

const emptyTicket: TicketVisibilityInput = {
  nombre: "\uFEFF  Sin nombre proporcionado  \u00a0",
  apellido: "\u2003",
  telefono: null,
  dni: "",
  empresa: null,
  email: "\t\r\n",
  motivo: "  Sin especificar  ",
  resumen: null,
  notas: "",
  estado: "nuevo",
  prioridad: "media",
  progreso: 0,
  notificado: false,
  asignado_usuario_id: null,
  asignado_a: "\ufeff",
};

const visibilityCases: VisibilityCase[] = [
  { label: "vacío" },
  {
    label: "marcadores históricos alternativos",
    patch: { nombre: "\u00a0SIN NOMBRE\ufeff", motivo: "\t" },
  },
  { label: "nombre", patch: { nombre: "Ana" } },
  { label: "apellido", patch: { apellido: "Pérez" } },
  { label: "teléfono", patch: { telefono: "1122334455" } },
  { label: "DNI", patch: { dni: "30111222" } },
  { label: "empresa", patch: { empresa: "GSB" } },
  { label: "email", patch: { email: "ana@example.test" } },
  { label: "motivo", patch: { motivo: "Consulta de haberes" } },
  { label: "resumen", patch: { resumen: "Solicita información" } },
  { label: "notas", patch: { notas: "Revisar" } },
  { label: "estado", patch: { estado: "en_proceso" } },
  { label: "prioridad", patch: { prioridad: "alta" } },
  { label: "progreso", patch: { progreso: 1 } },
  { label: "notificado", patch: { notificado: true } },
  {
    label: "asignado por identidad",
    patch: { asignado_usuario_id: 7 },
  },
  { label: "asignado histórico", patch: { asignado_a: "Operadora" } },
  { label: "seguimiento", tieneSeguimientos: true },
  {
    label: "solo metadatos ignorados",
    patch: {
      conversation_id: "conv-técnica",
      hora: "18:30",
      estado_empleado: "Activo",
      motivo_categoria: "legales",
      audio_url: "https://example.test/audio.mp3",
      fecha_creacion: new Date("2026-08-06T12:00:00.000Z"),
      fecha_limite: new Date("2026-08-10T12:00:00.000Z"),
      fecha_resolucion: new Date("2026-08-07T12:00:00.000Z"),
    },
  },
];

function createLegacyDatabase(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
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
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      nota TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
  `);
  return sqlite;
}

function storedTicket(
  id: number,
  patch: TicketVisibilityInput = {},
): Record<string, string | number | null> {
  const ticket = { ...emptyTicket, ...patch };
  return {
    id,
    version: 1,
    conversation_id: ticket.conversation_id ?? `conv-${id}`,
    hora: ticket.hora ?? "00:00",
    nombre: ticket.nombre ?? "",
    apellido: ticket.apellido ?? "",
    telefono: ticket.telefono ?? null,
    dni: ticket.dni ?? null,
    empresa: ticket.empresa ?? null,
    estado_empleado: ticket.estado_empleado ?? null,
    email: ticket.email ?? null,
    motivo: ticket.motivo ?? "",
    motivo_categoria: ticket.motivo_categoria ?? "sin_clasificar",
    resumen: ticket.resumen ?? null,
    notificado: ticket.notificado ? 1 : 0,
    estado: ticket.estado ?? "nuevo",
    prioridad: ticket.prioridad ?? "media",
    asignado_usuario_id: ticket.asignado_usuario_id ?? null,
    asignado_a: ticket.asignado_a ?? null,
    audio_url: ticket.audio_url ?? null,
    notas: ticket.notas ?? null,
    progreso: ticket.progreso ?? 0,
    fecha_creacion: ticket.fecha_creacion?.getTime() ?? 1_786_003_200_000,
    fecha_limite: ticket.fecha_limite?.getTime() ?? null,
    fecha_resolucion: ticket.fecha_resolucion?.getTime() ?? null,
  };
}

function insertTicket(
  sqlite: Database.Database,
  id: number,
  patch: TicketVisibilityInput = {},
): void {
  sqlite
    .prepare(
      `
      INSERT INTO tickets (
        id, version, conversation_id, hora, nombre, apellido, telefono, dni,
        empresa, estado_empleado, email, motivo, motivo_categoria, resumen,
        notificado, estado, prioridad, asignado_usuario_id, asignado_a,
        audio_url, notas, progreso, fecha_creacion, fecha_limite,
        fecha_resolucion
      ) VALUES (
        @id, @version, @conversation_id, @hora, @nombre, @apellido, @telefono,
        @dni, @empresa, @estado_empleado, @email, @motivo,
        @motivo_categoria, @resumen, @notificado, @estado, @prioridad,
        @asignado_usuario_id, @asignado_a, @audio_url, @notas, @progreso,
        @fecha_creacion, @fecha_limite, @fecha_resolucion
      )
    `,
    )
    .run(storedTicket(id, patch));
}

function quarantineIds(sqlite: Database.Database): number[] {
  return (
    sqlite
      .prepare("SELECT ticket_id FROM tickets_cuarentena ORDER BY ticket_id")
      .all() as Array<{ ticket_id: number }>
  ).map(({ ticket_id }) => ticket_id);
}

function isQuarantined(sqlite: Database.Database, ticketId: number): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM tickets_cuarentena WHERE ticket_id = ?")
      .get(ticketId) !== undefined
  );
}

describe("materialización de cuarentena", () => {
  it("hace un backfill en paridad con la regla pura y conserva los históricos", () => {
    const sqlite = createLegacyDatabase();
    for (const [index, visibilityCase] of visibilityCases.entries()) {
      insertTicket(sqlite, index + 1, visibilityCase.patch);
      if (visibilityCase.tieneSeguimientos) {
        sqlite
          .prepare(
            `
            INSERT INTO seguimientos (ticket_id, nota, fecha_creacion)
            VALUES (?, 'Gestión histórica', 1786003200000)
          `,
          )
          .run(index + 1);
      }
    }
    const ticketsBefore = sqlite
      .prepare("SELECT * FROM tickets ORDER BY id")
      .all();
    const followUpsBefore = sqlite
      .prepare("SELECT * FROM seguimientos ORDER BY id")
      .all();

    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);

    const expected = visibilityCases.flatMap(
      ({ patch = {}, tieneSeguimientos = false }, index) =>
        esTicketVacio({
          ...emptyTicket,
          ...patch,
          tiene_seguimientos: tieneSeguimientos,
        })
          ? [index + 1]
          : [],
    );
    assert.deepEqual(quarantineIds(sqlite), expected);
    assert.deepEqual(
      sqlite.prepare("SELECT * FROM tickets ORDER BY id").all(),
      ticketsBefore,
    );
    assert.deepEqual(
      sqlite.prepare("SELECT * FROM seguimientos ORDER BY id").all(),
      followUpsBefore,
    );

    const triggerNames = (
      sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'trigger' AND name LIKE 'tickets_cuarentena_%'
          ORDER BY name
        `,
        )
        .all() as Array<{ name: string }>
    ).map(({ name }) => name);
    assert.deepEqual(triggerNames, [
      "tickets_cuarentena_seguimiento_delete",
      "tickets_cuarentena_seguimiento_insert",
      "tickets_cuarentena_seguimiento_ticket_update",
      "tickets_cuarentena_ticket_insert",
      "tickets_cuarentena_ticket_update",
    ]);
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("sincroniza cada campo funcional y el ciclo completo de seguimientos", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);
    insertTicket(sqlite, 1);
    assert.equal(isQuarantined(sqlite, 1), true);
    insertTicket(sqlite, 3, { nombre: "Alta operativa" });
    assert.equal(isQuarantined(sqlite, 3), false);
    sqlite.exec("BEGIN");
    insertTicket(sqlite, 4);
    assert.equal(isQuarantined(sqlite, 4), true);
    sqlite.exec("ROLLBACK");
    assert.equal(isQuarantined(sqlite, 4), false);

    const insertFollowUp = sqlite.prepare(
      `
      INSERT INTO seguimientos (ticket_id, nota, fecha_creacion)
      VALUES (?, ?, ?)
    `,
    );
    const functionalTransitions = [
      ["nombre", "Ana", emptyTicket.nombre],
      ["apellido", "Pérez", emptyTicket.apellido],
      ["telefono", "1122334455", emptyTicket.telefono],
      ["dni", "30111222", emptyTicket.dni],
      ["empresa", "GSB", emptyTicket.empresa],
      ["email", "ana@example.test", emptyTicket.email],
      ["motivo", "Consulta", emptyTicket.motivo],
      ["resumen", "Información", emptyTicket.resumen],
      ["notas", "Revisar", emptyTicket.notas],
      ["estado", "en_proceso", emptyTicket.estado],
      ["prioridad", "alta", emptyTicket.prioridad],
      ["progreso", 1, emptyTicket.progreso],
      ["notificado", 1, 0],
      ["asignado_usuario_id", 7, emptyTicket.asignado_usuario_id],
      ["asignado_a", "Operadora", emptyTicket.asignado_a],
    ] as const;

    for (const [field, operationalValue, emptyValue] of functionalTransitions) {
      sqlite
        .prepare(`UPDATE tickets SET ${field} = ? WHERE id = 1`)
        .run(operationalValue);
      assert.equal(isQuarantined(sqlite, 1), false, field);
      const followUpId = insertFollowUp.run(
        1,
        `Gestión con ${field}`,
        500,
      ).lastInsertRowid;
      sqlite.prepare("DELETE FROM seguimientos WHERE id = ?").run(followUpId);
      assert.equal(isQuarantined(sqlite, 1), false, field);
      sqlite
        .prepare(`UPDATE tickets SET ${field} = ? WHERE id = 1`)
        .run(emptyValue);
      assert.equal(isQuarantined(sqlite, 1), true, field);
    }

    sqlite
      .prepare(
        `
        UPDATE tickets
        SET version = version + 1,
            estado_empleado = 'Activo',
            motivo_categoria = 'legales',
            audio_url = 'https://example.test/audio.mp3',
            fecha_limite = 1786200000000
        WHERE id = 1
      `,
      )
      .run();
    assert.equal(isQuarantined(sqlite, 1), true);

    const firstFollowUp = Number(
      insertFollowUp.run(1, "Primera gestión", 1000).lastInsertRowid,
    );
    const secondFollowUp = Number(
      insertFollowUp.run(1, "Segunda gestión", 2000).lastInsertRowid,
    );
    assert.equal(isQuarantined(sqlite, 1), false);
    sqlite.prepare("UPDATE tickets SET nombre = 'Ana' WHERE id = 1").run();
    sqlite
      .prepare("UPDATE tickets SET nombre = ? WHERE id = 1")
      .run(emptyTicket.nombre);
    assert.equal(isQuarantined(sqlite, 1), false);

    sqlite.prepare("DELETE FROM seguimientos WHERE id = ?").run(firstFollowUp);
    assert.equal(isQuarantined(sqlite, 1), false);
    sqlite.prepare("DELETE FROM seguimientos WHERE id = ?").run(secondFollowUp);
    assert.equal(isQuarantined(sqlite, 1), true);

    insertTicket(sqlite, 2);
    assert.equal(isQuarantined(sqlite, 2), true);
    const movableFollowUp = Number(
      insertFollowUp.run(1, "Gestión movible", 3000).lastInsertRowid,
    );
    assert.equal(isQuarantined(sqlite, 1), false);
    assert.equal(isQuarantined(sqlite, 2), true);

    sqlite
      .prepare("UPDATE seguimientos SET ticket_id = 2 WHERE id = ?")
      .run(movableFollowUp);
    assert.equal(isQuarantined(sqlite, 1), true);
    assert.equal(isQuarantined(sqlite, 2), false);
    sqlite
      .prepare(
        "UPDATE tickets SET email = 'identificada@example.test' WHERE id = 1",
      )
      .run();
    sqlite
      .prepare("UPDATE seguimientos SET ticket_id = 1 WHERE id = ?")
      .run(movableFollowUp);
    assert.equal(isQuarantined(sqlite, 1), false);
    assert.equal(isQuarantined(sqlite, 2), true);
    sqlite
      .prepare("UPDATE seguimientos SET ticket_id = 2 WHERE id = ?")
      .run(movableFollowUp);
    assert.equal(isQuarantined(sqlite, 1), false);
    assert.equal(isQuarantined(sqlite, 2), false);
    sqlite.prepare("UPDATE tickets SET email = NULL WHERE id = 1").run();
    assert.equal(isQuarantined(sqlite, 1), true);
    sqlite
      .prepare("UPDATE seguimientos SET ticket_id = 2 WHERE id = ?")
      .run(movableFollowUp);
    assert.equal(isQuarantined(sqlite, 2), false);

    sqlite
      .prepare("DELETE FROM seguimientos WHERE id = ?")
      .run(movableFollowUp);
    assert.equal(isQuarantined(sqlite, 2), true);
    sqlite.prepare("DELETE FROM tickets WHERE id = 2").run();
    assert.equal(isQuarantined(sqlite, 2), false);
    insertFollowUp.run(1, "Gestión antes del cascade", 4000);
    sqlite.prepare("DELETE FROM tickets WHERE id = 1").run();
    assert.equal(isQuarantined(sqlite, 1), false);
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT count(*) AS total FROM seguimientos WHERE ticket_id = 1",
          )
          .get() as { total: number }
      ).total,
      0,
    );
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.close();
  });

  it("usa la clave primaria del marcador en ambas condiciones públicas", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);
    const database = drizzle(sqlite);

    const queries = [ticketVacioCondition, ticketVisibleCondition].map(
      (condition) =>
        database
          .select({ id: ticketsTable.id })
          .from(ticketsTable)
          .where(condition)
          .toSQL(),
    );
    for (const query of queries) {
      const plan = sqlite
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...query.params) as QueryPlanStep[];
      assert.ok(
        plan.some(
          ({ detail }) =>
            detail.includes("tickets_cuarentena") && /SEARCH/i.test(detail),
        ),
        JSON.stringify(plan),
      );
      assert.equal(
        plan.some(({ detail }) => /SCAN seguimientos/i.test(detail)),
        false,
        JSON.stringify(plan),
      );
    }
    sqlite.close();
  });

  it("reconcilia una base legacy creada con push y luego queda idempotente", () => {
    const sqlite = createLegacyDatabase();
    insertTicket(sqlite, 1);
    insertTicket(sqlite, 2, { nombre: "Ticket operativo" });
    sqlite.exec(`
      CREATE TABLE tickets_cuarentena (
        ticket_id INTEGER PRIMARY KEY NOT NULL
          REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);

    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: true,
    });
    assert.deepEqual(quarantineIds(sqlite), [1]);
    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: false,
    });

    sqlite.prepare("UPDATE tickets SET nombre = 'Ana' WHERE id = 1").run();
    assert.equal(isQuarantined(sqlite, 1), false);
    sqlite.prepare("UPDATE tickets SET nombre = ? WHERE id = 1").run("");
    assert.equal(isQuarantined(sqlite, 1), true);
    sqlite.close();
  });

  it("considera completa la instalación realizada por la migración", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);

    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: false,
    });
    sqlite.close();
  });

  it("detecta cambios dentro de literales y marcadores desincronizados", () => {
    const sqlite = createLegacyDatabase();
    insertTicket(sqlite, 1);
    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);

    const triggerName = "tickets_cuarentena_ticket_update";
    const originalSql = (
      sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
        )
        .get(triggerName) as { sql: string }
    ).sql;
    const alteredSql = originalSql.replace("'nuevo'", "'NUEVO'");
    assert.notEqual(alteredSql, originalSql);
    sqlite.exec(`DROP TRIGGER \`${triggerName}\``);
    sqlite.exec(alteredSql);

    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: true,
    });
    const repairedSql = (
      sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
        )
        .get(triggerName) as { sql: string }
    ).sql;
    assert.match(repairedSql, /'nuevo'/);
    assert.doesNotMatch(repairedSql, /'NUEVO'/);

    sqlite.exec("DELETE FROM tickets_cuarentena");
    assert.deepEqual(quarantineIds(sqlite), []);
    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: true,
    });
    assert.deepEqual(quarantineIds(sqlite), [1]);
    sqlite.close();
  });

  it("falla cerrado ante un ledger incompleto o una tabla incompatible", () => {
    const versioned = createLegacyDatabase();
    versioned.exec(
      "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at INTEGER)",
    );
    assert.throws(
      () => ensureTicketQuarantineProjection(versioned),
      /migración 0014 no está registrada/i,
    );
    assert.equal(
      versioned
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tickets_cuarentena'",
        )
        .get(),
      undefined,
    );
    versioned.close();

    const incompatible = createLegacyDatabase();
    incompatible.exec(
      "CREATE TABLE tickets_cuarentena (ticket_id TEXT PRIMARY KEY)",
    );
    assert.throws(
      () => ensureTicketQuarantineProjection(incompatible),
      /contrato incompatible/i,
    );
    incompatible.close();
  });

  it("revierte por completo una reparación interrumpida", () => {
    const sqlite = createLegacyDatabase();
    insertTicket(sqlite, 1);
    sqlite.exec(indexMigrationSql);
    sqlite.exec(quarantineMigrationSql);
    sqlite.exec(`
      DROP TRIGGER tickets_cuarentena_ticket_insert;
      CREATE TRIGGER bloquear_reconstruccion_cuarentena
      BEFORE INSERT ON tickets_cuarentena
      BEGIN
        SELECT RAISE(ABORT, 'fallo inyectado');
      END;
    `);
    const triggerCountBefore = (
      sqlite
        .prepare(
          `
          SELECT count(*) AS total FROM sqlite_master
          WHERE type = 'trigger'
            AND name IN (${TICKET_QUARANTINE_TRIGGER_NAMES.map(() => "?").join(", ")})
        `,
        )
        .get(...TICKET_QUARANTINE_TRIGGER_NAMES) as { total: number }
    ).total;

    assert.throws(
      () => ensureTicketQuarantineProjection(sqlite),
      /fallo inyectado/i,
    );
    assert.deepEqual(quarantineIds(sqlite), [1]);
    const triggerCountAfter = (
      sqlite
        .prepare(
          `
          SELECT count(*) AS total FROM sqlite_master
          WHERE type = 'trigger'
            AND name IN (${TICKET_QUARANTINE_TRIGGER_NAMES.map(() => "?").join(", ")})
        `,
        )
        .get(...TICKET_QUARANTINE_TRIGGER_NAMES) as { total: number }
    ).total;
    assert.equal(triggerCountAfter, triggerCountBefore);

    sqlite.exec("DROP TRIGGER bloquear_reconstruccion_cuarentena");
    assert.deepEqual(ensureTicketQuarantineProjection(sqlite), {
      repaired: true,
    });
    sqlite.close();
  });

  it("exige claves foráneas activas antes de validar o reparar", () => {
    const sqlite = createLegacyDatabase();
    sqlite.pragma("foreign_keys = OFF");
    assert.throws(
      () => ensureTicketQuarantineProjection(sqlite),
      /foreign_keys habilitado/i,
    );
    sqlite.close();
  });
});
