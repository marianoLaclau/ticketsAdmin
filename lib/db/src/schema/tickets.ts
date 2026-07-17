import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usuariosTable } from "./admin";

export const ESTADOS = ["nuevo", "en_proceso", "pendiente", "resuelto", "cerrado"] as const;
export const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;
export const MOTIVO_CATEGORIAS = [
  "haberes_pagos",
  "recibos_documentacion",
  "vacaciones_licencias",
  "bajas_liquidacion",
  "empleo_postulaciones",
  "contacto_general",
  "reclamos",
  "sin_clasificar",
] as const;

export type Estado = (typeof ESTADOS)[number];
export type Prioridad = (typeof PRIORIDADES)[number];
export type MotivoCategoria = (typeof MOTIVO_CATEGORIAS)[number];

export const ticketsTable = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversation_id: text("conversation_id").notNull().unique(),
  hora: text("hora").notNull(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  telefono: text("telefono"),
  dni: text("dni"),
  empresa: text("empresa"),
  email: text("email"),
  motivo: text("motivo").notNull(),
  motivo_categoria: text("motivo_categoria", { enum: MOTIVO_CATEGORIAS })
    .notNull()
    .default("sin_clasificar"),
  resumen: text("resumen"),
  notificado: integer("notificado", { mode: "boolean" }).notNull().default(false),
  estado: text("estado", { enum: ESTADOS }).notNull().default("nuevo"),
  prioridad: text("prioridad", { enum: PRIORIDADES }).notNull().default("media"),
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
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, fecha_creacion: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

export const seguimientosTable = sqliteTable("seguimientos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticket_id: integer("ticket_id").notNull().references(() => ticketsTable.id, { onDelete: "cascade" }),
  nota: text("nota").notNull(),
  estado_anterior: text("estado_anterior"),
  estado_nuevo: text("estado_nuevo"),
  autor: text("autor"),
  fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertSeguimientoSchema = createInsertSchema(seguimientosTable).omit({ id: true, fecha_creacion: true });
export type InsertSeguimiento = z.infer<typeof insertSeguimientoSchema>;
export type Seguimiento = typeof seguimientosTable.$inferSelect;
