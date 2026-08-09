import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const usuariosTable = sqliteTable(
  "usuarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nombre: text("nombre").notNull(),
    apellido: text("apellido"),
    // Identificador de login (distinto del email). Nullable solo para no
    // romper filas creadas antes de este campo — el seed las backfillea con
    // el email al arrancar, así que en la práctica siempre queda seteado.
    username: text("username").unique(),
    email: text("email").notNull().unique(),
    // Hash scrypt versionado; el lector conserva compatibilidad con el formato
    // legado. Nullable: un usuario sin contraseña aún no puede iniciar sesión.
    password_hash: text("password_hash"),
    // Las claves emitidas por un administrador o por el bootstrap son
    // temporales. La migración preserva usuarios históricos en false, pero el
    // default true hace fallar cerrado cualquier alta futura que omita el dato.
    debe_cambiar_password: integer("debe_cambiar_password", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    role_id: integer("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "restrict" }),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    fecha_actualizacion: integer("fecha_actualizacion", {
      mode: "timestamp_ms",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check(
      "usuarios_debe_cambiar_password_bool",
      sql`${table.debe_cambiar_password} in (0, 1)`,
    ),
  ],
);

// Sesiones de login respaldadas en la base para poder revocarlas y para que
// sobrevivan a reinicios. La cookie conserva el token aleatorio; SQLite guarda
// únicamente su hash versionado con separación de dominio, nunca el bearer
// reutilizable. La columna física conserva el nombre histórico `token` para
// permitir rollback estructural; el prefijo impide confundir el digest con una
// cookie válida incluso si se ejecuta temporalmente el binario anterior.
export const sesionesTable = sqliteTable("sesiones", {
  token_hash: text("token").primaryKey(),
  usuario_id: integer("usuario_id")
    .notNull()
    .references(() => usuariosTable.id, { onDelete: "cascade" }),
  fecha_expiracion: integer("fecha_expiracion", {
    mode: "timestamp_ms",
  }).notNull(),
  // La elevación administrativa pertenece a una sesión concreta y expira de
  // forma independiente. Sólo se persiste una huella de la clave configurada,
  // nunca la credencial reutilizable que presentó el navegador.
  admin_elevacion_hasta: integer("admin_elevacion_hasta", {
    mode: "timestamp_ms",
  }),
  admin_elevacion_clave_hash: text("admin_elevacion_clave_hash"),
  fecha_creacion: integer("fecha_creacion", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
