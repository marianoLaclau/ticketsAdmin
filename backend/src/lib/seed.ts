import { db, rolesTable, usuariosTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { hashPassword } from "./passwords";
import { logger } from "./logger";

/**
 * Garantiza que exista al menos un usuario capaz de iniciar sesión.
 *
 * Solo actúa cuando NINGÚN usuario tiene contraseña asignada (primer arranque
 * o base recién creada): crea el rol "Administrador" si falta y el usuario
 * "admin" con clave "admin". Si ya hay algún usuario con contraseña, no toca
 * nada — así no revive al admin si más adelante lo reemplazan por cuentas
 * propias, y a la vez evita el bloqueo total del sistema.
 */
export async function ensureAdminSeed(): Promise<void> {
  const conPassword = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(isNotNull(usuariosTable.password_hash))
    .limit(1);
  if (conPassword.length > 0) return;

  let [rol] = await db.select().from(rolesTable).where(eq(rolesTable.nombre, "Administrador"));
  if (!rol) {
    [rol] = await db
      .insert(rolesTable)
      .values({ nombre: "Administrador", descripcion: "Acceso total al sistema" })
      .returning();
  }

  const passwordHash = hashPassword("admin");
  const [existente] = await db.select({ id: usuariosTable.id }).from(usuariosTable).where(eq(usuariosTable.email, "admin"));
  if (existente) {
    await db
      .update(usuariosTable)
      .set({ password_hash: passwordHash, activo: true, role_id: rol.id, fecha_actualizacion: new Date() })
      .where(eq(usuariosTable.id, existente.id));
  } else {
    await db.insert(usuariosTable).values({
      nombre: "Admin",
      apellido: null,
      email: "admin",
      role_id: rol.id,
      password_hash: passwordHash,
    });
  }

  logger.warn('Usuario semilla "admin" con clave "admin" disponible — cambiar la clave apenas se pueda');
}
