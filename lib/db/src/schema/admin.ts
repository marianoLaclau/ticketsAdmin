import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rolesTable = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  descripcion: text("descripcion"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  fecha_actualizacion: integer("fecha_actualizacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const usuariosTable = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  apellido: text("apellido"),
  email: text("email").notNull().unique(),
  role_id: integer("role_id")
    .notNull()
    .references(() => rolesTable.id, { onDelete: "restrict" }),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  fecha_actualizacion: integer("fecha_actualizacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Role = typeof rolesTable.$inferSelect;
export type InsertRole = typeof rolesTable.$inferInsert;
export type Usuario = typeof usuariosTable.$inferSelect;
export type InsertUsuario = typeof usuariosTable.$inferInsert;
