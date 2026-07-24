import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and } from "drizzle-orm";
import { ticketsTable } from "@workspace/db/schema";
import {
  buildTicketFilterConditions,
  buildTicketOrderBy,
  buildTicketWhere,
  MAX_TICKET_SORT_CRITERIA,
  normalizeTicketSort,
  parseTicketSortQuery,
  TICKET_SORT_BY_VALUES,
} from "../src/lib/ticket-query.ts";

interface Fixture {
  id: number;
  conversation_id: string;
  hora: string;
  nombre: string;
  apellido: string;
  empresa: string | null;
  motivo: string;
  motivo_categoria: string;
  estado: string;
  prioridad: string;
  asignado_a: string | null;
  progreso: number;
  fecha_creacion: number;
  fecha_limite: number | null;
}

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      telefono TEXT,
      dni TEXT,
      empresa TEXT,
      email TEXT,
      motivo TEXT NOT NULL,
      motivo_categoria TEXT NOT NULL,
      resumen TEXT,
      notificado INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL,
      prioridad TEXT NOT NULL,
      asignado_usuario_id INTEGER,
      asignado_a TEXT,
      audio_url TEXT,
      notas TEXT,
      progreso INTEGER NOT NULL,
      fecha_creacion INTEGER NOT NULL,
      fecha_limite INTEGER,
      fecha_resolucion INTEGER
    )
  `);

  const fixtures: Fixture[] = [
    {
      id: 1,
      conversation_id: "conv-z",
      hora: "09:30",
      nombre: "Zoe",
      apellido: "Alvarez",
      empresa: null,
      motivo: "Vacaciones",
      motivo_categoria: "vacaciones_licencias",
      estado: "nuevo",
      prioridad: "baja",
      asignado_a: null,
      progreso: 0,
      fecha_creacion: new Date("2026-07-21T12:00:00Z").getTime(),
      fecha_limite: null,
    },
    {
      id: 2,
      conversation_id: "conv-a",
      hora: "08:15",
      nombre: "ana",
      apellido: "Perez",
      empresa: "Beta",
      motivo: "Recibo",
      motivo_categoria: "recibos_documentacion",
      estado: "pendiente",
      prioridad: "urgente",
      asignado_a: "Bruno",
      progreso: 50,
      fecha_creacion: new Date("2026-07-22T12:00:00Z").getTime(),
      fecha_limite: new Date("2026-07-23T12:00:00Z").getTime(),
    },
    {
      id: 3,
      conversation_id: "conv-b",
      hora: "10:45",
      nombre: "Bruno",
      apellido: "Diaz",
      empresa: "Alfa",
      motivo: "Reclamo",
      motivo_categoria: "reclamos",
      estado: "en_proceso",
      prioridad: "media",
      asignado_a: "Ana",
      progreso: 25,
      fecha_creacion: new Date("2026-07-22T12:00:00Z").getTime(),
      fecha_limite: new Date("2026-07-22T11:00:00Z").getTime(),
    },
    {
      id: 4,
      conversation_id: "conv-c",
      hora: "10:45",
      nombre: "Bruno",
      apellido: "Diaz",
      empresa: "",
      motivo: "Consulta legal",
      motivo_categoria: "legales",
      estado: "cerrado",
      prioridad: "alta",
      asignado_a: "",
      progreso: 100,
      fecha_creacion: new Date("2026-07-22T12:00:00Z").getTime(),
      fecha_limite: new Date("2026-07-24T12:00:00Z").getTime(),
    },
  ];

  const insert = sqlite.prepare(`
    INSERT INTO tickets (
      id, conversation_id, hora, nombre, apellido, empresa, motivo,
      motivo_categoria, estado, prioridad, asignado_a, progreso,
      fecha_creacion, fecha_limite
    ) VALUES (
      @id, @conversation_id, @hora, @nombre, @apellido, @empresa, @motivo,
      @motivo_categoria, @estado, @prioridad, @asignado_a, @progreso,
      @fecha_creacion, @fecha_limite
    )
  `);
  for (const fixture of fixtures) insert.run(fixture);

  return { sqlite, db: drizzle(sqlite) };
}

function orderedIds(
  db: ReturnType<typeof drizzle>,
  sortBy: Parameters<typeof buildTicketOrderBy>[0],
  order: Parameters<typeof buildTicketOrderBy>[1],
): number[] {
  return db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .orderBy(...buildTicketOrderBy(sortBy, order))
    .all()
    .map(({ id }) => id);
}

describe("orden de tickets", () => {
  it("acepta solo la whitelist y aplica defaults seguros", () => {
    assert.ok(TICKET_SORT_BY_VALUES.includes("prioridad"));
    assert.deepEqual(normalizeTicketSort("desconocido", "lateral"), {
      sortBy: "fecha_creacion",
      order: "desc",
    });
    assert.deepEqual(normalizeTicketSort("empresa", "asc"), {
      sortBy: "empresa",
      order: "asc",
    });
  });

  it("interpreta orden compuesto y conserva el contrato anterior como fallback", () => {
    assert.deepEqual(
      parseTicketSortQuery(
        "fecha_creacion:desc, contacto:asc",
        "empresa",
        "asc",
      ),
      {
        ok: true,
        criteria: [
          { sortBy: "fecha_creacion", order: "desc" },
          { sortBy: "contacto", order: "asc" },
        ],
      },
    );
    assert.deepEqual(parseTicketSortQuery(undefined, "empresa", "asc"), {
      ok: true,
      criteria: [{ sortBy: "empresa", order: "asc" }],
    });
  });

  it("rechaza formatos, columnas, direcciones, duplicados y excesos inválidos", () => {
    const invalidValues: unknown[] = [
      "",
      ["contacto:asc"],
      "contacto",
      "desconocida:asc",
      "contacto:lateral",
      "contacto:asc,contacto:desc",
      Array.from(
        { length: MAX_TICKET_SORT_CRITERIA + 1 },
        () => "contacto:asc",
      ).join(","),
    ];

    for (const value of invalidValues) {
      assert.equal(parseTicketSortQuery(value, undefined, undefined).ok, false);
    }
  });

  it("mantiene dia, hora e id para fecha de creacion", () => {
    const { sqlite, db } = createDatabase();
    assert.deepEqual(orderedIds(db, "fecha_creacion", "asc"), [1, 2, 3, 4]);
    assert.deepEqual(orderedIds(db, "fecha_creacion", "desc"), [4, 3, 2, 1]);
    sqlite.close();
  });

  it("aplica criterios secundarios antes del desempate final por id", () => {
    const { sqlite, db } = createDatabase();
    assert.deepEqual(
      orderedIds(
        db,
        [
          { sortBy: "empresa", order: "asc" },
          { sortBy: "contacto", order: "asc" },
        ],
        "desc",
      ),
      [3, 2, 4, 1],
    );
    sqlite.close();
  });

  it("ordena estado y prioridad por su significado operativo", () => {
    const { sqlite, db } = createDatabase();
    assert.deepEqual(orderedIds(db, "estado", "asc"), [1, 3, 2, 4]);
    assert.deepEqual(orderedIds(db, "prioridad", "asc"), [1, 3, 4, 2]);
    assert.deepEqual(orderedIds(db, "prioridad", "desc"), [2, 4, 3, 1]);
    sqlite.close();
  });

  it("ordena contacto sin distinguir mayusculas y categoria por su etiqueta", () => {
    const { sqlite, db } = createDatabase();
    assert.deepEqual(orderedIds(db, "contacto", "asc"), [2, 3, 4, 1]);
    assert.deepEqual(orderedIds(db, "motivo_categoria", "asc"), [4, 2, 3, 1]);

    sqlite
      .prepare("UPDATE tickets SET motivo_categoria = 'reclamos', motivo = ? WHERE id = ?")
      .run("Zeta", 2);
    sqlite
      .prepare("UPDATE tickets SET motivo_categoria = 'reclamos', motivo = ? WHERE id = ?")
      .run("Alfa", 3);
    assert.deepEqual(orderedIds(db, "motivo_categoria", "asc"), [4, 3, 2, 1]);
    sqlite.close();
  });

  it("deja empresas, asignaciones y vencimientos vacios al final", () => {
    const { sqlite, db } = createDatabase();
    assert.deepEqual(orderedIds(db, "empresa", "asc"), [3, 2, 1, 4]);
    assert.deepEqual(orderedIds(db, "empresa", "desc"), [2, 3, 4, 1]);
    assert.deepEqual(orderedIds(db, "asignado_a", "asc"), [3, 2, 1, 4]);
    assert.deepEqual(orderedIds(db, "fecha_limite", "desc"), [4, 2, 3, 1]);
    sqlite.close();
  });
});

describe("filtros compartidos", () => {
  it("combina condiciones con AND y permite fijar el reloj de vencidos", () => {
    const { sqlite, db } = createDatabase();
    const conditions = buildTicketFilterConditions(
      {
        prioridad: "media",
        search: "Bruno",
        vencidos: true,
      },
      { now: new Date("2026-07-22T12:00:00Z") },
    );

    const rows = db
      .select({ id: ticketsTable.id })
      .from(ticketsTable)
      .where(and(...conditions))
      .all();
    assert.deepEqual(rows, [{ id: 3 }]);
    sqlite.close();
  });

  it("ignora filtros de texto compuestos solo por espacios", () => {
    assert.equal(
      buildTicketWhere({ search: "  ", empresa: "\t", motivo: "" }),
      undefined,
    );
  });
});
