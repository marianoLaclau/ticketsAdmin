import { pgTable, serial, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const estadoEnum = pgEnum("estado", ["nuevo", "en_proceso", "pendiente", "resuelto", "cerrado"]);
export const prioridadEnum = pgEnum("prioridad", ["baja", "media", "alta", "urgente"]);

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  conversation_id: text("conversation_id").notNull().unique(),
  hora: text("hora").notNull(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  telefono: text("telefono"),
  dni: text("dni"),
  empresa: text("empresa"),
  email: text("email"),
  motivo: text("motivo").notNull(),
  resumen: text("resumen"),
  notificado: boolean("notificado").notNull().default(false),
  estado: estadoEnum("estado").notNull().default("nuevo"),
  prioridad: prioridadEnum("prioridad").notNull().default("media"),
  asignado_a: text("asignado_a"),
  audio_url: text("audio_url"),
  notas: text("notas"),
  progreso: integer("progreso").notNull().default(0),
  fecha_creacion: timestamp("fecha_creacion", { withTimezone: true }).notNull().defaultNow(),
  fecha_limite: timestamp("fecha_limite", { withTimezone: true }),
  fecha_resolucion: timestamp("fecha_resolucion", { withTimezone: true }),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, fecha_creacion: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

export const seguimientosTable = pgTable("seguimientos", {
  id: serial("id").primaryKey(),
  ticket_id: integer("ticket_id").notNull().references(() => ticketsTable.id, { onDelete: "cascade" }),
  nota: text("nota").notNull(),
  estado_anterior: text("estado_anterior"),
  estado_nuevo: text("estado_nuevo"),
  autor: text("autor"),
  fecha_creacion: timestamp("fecha_creacion", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSeguimientoSchema = createInsertSchema(seguimientosTable).omit({ id: true, fecha_creacion: true });
export type InsertSeguimiento = z.infer<typeof insertSeguimientoSchema>;
export type Seguimiento = typeof seguimientosTable.$inferSelect;
