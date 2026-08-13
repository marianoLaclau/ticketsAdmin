import { MOTIVO_CATEGORIA_CODIGOS } from "@workspace/ingesta";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { usuariosTable } from "./admin";

export const ESTADOS = [
  "nuevo",
  "en_proceso",
  "pendiente",
  "resuelto",
  "cerrado",
] as const;
export const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;
export const ESTADOS_EMPLEADO = ["Activo", "Inactivo"] as const;

export type Estado = (typeof ESTADOS)[number];
export type Prioridad = (typeof PRIORIDADES)[number];
export type { MotivoCategoria } from "@workspace/ingesta";

export const ticketsTable = sqliteTable(
  "tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Token monotónico de concurrencia. Toda modificación de datos del ticket
    // debe incrementarlo para que un editor abierto no pueda pisar otra gestión.
    version: integer("version").notNull().default(1),
    conversation_id: text("conversation_id").notNull().unique(),
    hora: text("hora").notNull(),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    telefono: text("telefono"),
    dni: text("dni"),
    empresa: text("empresa"),
    estado_empleado: text("estado_empleado", { enum: ESTADOS_EMPLEADO }),
    email: text("email"),
    motivo: text("motivo").notNull(),
    motivo_categoria: text("motivo_categoria", {
      enum: MOTIVO_CATEGORIA_CODIGOS,
    })
      .notNull()
      .default("sin_clasificar"),
    resumen: text("resumen"),
    notificado: integer("notificado", { mode: "boolean" })
      .notNull()
      .default(false),
    estado: text("estado", { enum: ESTADOS }).notNull().default("nuevo"),
    prioridad: text("prioridad", { enum: PRIORIDADES })
      .notNull()
      .default("media"),
    asignado_usuario_id: integer("asignado_usuario_id").references(
      () => usuariosTable.id,
      { onDelete: "set null" },
    ),
    // Snapshot legible y compatibilidad con asignaciones históricas/importadas.
    // La identidad real de una autoasignación está en asignado_usuario_id.
    asignado_a: text("asignado_a"),
    audio_url: text("audio_url"),
    notas: text("notas"),
    progreso: integer("progreso").notNull().default(0),
    fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    fecha_limite: integer("fecha_limite", { mode: "timestamp_ms" }),
    fecha_resolucion: integer("fecha_resolucion", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("tickets_version_positive", sql`${table.version} >= 1`),
    index("tickets_fecha_creacion_id_idx").on(table.fecha_creacion, table.id),
    index("tickets_fecha_limite_id_idx").on(table.fecha_limite, table.id),
    index("tickets_fecha_resolucion_id_idx").on(
      table.fecha_resolucion,
      table.id,
    ),
  ],
);

export type Ticket = typeof ticketsTable.$inferSelect;

/**
 * Proyección interna materializada. Una fila indica que el ticket permanece
 * en cuarentena; mantenerla corresponde a los triggers de la migración.
 */
export const ticketsCuarentenaTable = sqliteTable("tickets_cuarentena", {
  ticket_id: integer("ticket_id")
    .primaryKey()
    .references(() => ticketsTable.id, { onDelete: "cascade" }),
});

export const seguimientosTable = sqliteTable(
  "seguimientos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticket_id: integer("ticket_id")
      .notNull()
      .references(() => ticketsTable.id, { onDelete: "cascade" }),
    nota: text("nota").notNull(),
    estado_anterior: text("estado_anterior"),
    estado_nuevo: text("estado_nuevo"),
    prioridad_anterior: text("prioridad_anterior", { enum: PRIORIDADES }),
    prioridad_nueva: text("prioridad_nueva", { enum: PRIORIDADES }),
    asignado_anterior_usuario_id: integer(
      "asignado_anterior_usuario_id",
    ).references(() => usuariosTable.id, { onDelete: "set null" }),
    asignado_anterior: text("asignado_anterior"),
    asignado_nuevo_usuario_id: integer("asignado_nuevo_usuario_id").references(
      () => usuariosTable.id,
      { onDelete: "set null" },
    ),
    asignado_nuevo: text("asignado_nuevo"),
    // Lista de nombres de campos modificados. No replica valores sensibles.
    campos_editados: text("campos_editados", { mode: "json" }).$type<
      string[]
    >(),
    // Identidad estructurada del actor humano. Los eventos automáticos y el
    // historial previo a esta columna permanecen en null; `autor` conserva el
    // snapshot legible aunque luego cambie o se elimine la cuenta.
    autor_usuario_id: integer("autor_usuario_id").references(
      () => usuariosTable.id,
      { onDelete: "set null" },
    ),
    autor: text("autor"),
    fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("seguimientos_ticket_fecha_id_idx").on(
      table.ticket_id,
      table.fecha_creacion,
      table.id,
    ),
    index("seguimientos_fecha_creacion_id_idx").on(
      table.fecha_creacion,
      table.id,
    ),
    index("seguimientos_autor_fecha_id_idx").on(
      table.autor_usuario_id,
      table.fecha_creacion,
      table.id,
    ),
  ],
);
