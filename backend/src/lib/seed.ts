import { db, rolesTable, usuariosTable } from "@workspace/db";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";
import { hashPassword } from "./passwords";
import { logger } from "./logger";
import { ROL_SYSADMIN, ROL_ADMINISTRADOR, ROL_OPERADOR } from "./auth";

// Roles base del sistema: se crean si faltan (idempotente, corre en cada
// arranque, así llegan solos a las bases ya desplegadas).
const ROLES_BASE: Array<{ nombre: string; descripcion: string }> = [
  { nombre: ROL_ADMINISTRADOR, descripcion: "Gestión completa de tickets (puede cerrarlos); sin acceso al panel de administración" },
  { nombre: ROL_OPERADOR, descripcion: "Gestión básica de tickets; no puede cerrar tickets" },
];

/**
 * Garantiza que exista el usuario "Dios" del sistema (SysAdmin).
 *
 * - Migra el seed viejo si existe: rol "Administrador" → "SysAdmin" y
 *   usuario "admin" → "sysadmin" (así el renombre llega solo a las bases
 *   ya desplegadas, local y servidor).
 * - Si NINGÚN usuario tiene contraseña asignada (primer arranque), crea el
 *   rol SysAdmin y el usuario "sysadmin" con clave "admin". Si ya hay algún
 *   usuario con contraseña, no crea nada — así no revive la cuenta si más
 *   adelante la reemplazan por cuentas propias, y evita el lockout total.
 */
export async function ensureAdminSeed(): Promise<void> {
  // --- Migración de nombres del seed anterior (idempotente) ---
  const [rolSysAdmin] = await db.select().from(rolesTable).where(eq(rolesTable.nombre, ROL_SYSADMIN));
  const [rolViejo] = await db.select().from(rolesTable).where(eq(rolesTable.nombre, "Administrador"));
  if (rolViejo && !rolSysAdmin) {
    await db
      .update(rolesTable)
      .set({ nombre: ROL_SYSADMIN, descripcion: "Usuario Dios: acceso total al sistema", fecha_actualizacion: new Date() })
      .where(eq(rolesTable.id, rolViejo.id));
    logger.info(`Rol "Administrador" renombrado a "${ROL_SYSADMIN}"`);
  }

  const [userSysadmin] = await db.select({ id: usuariosTable.id }).from(usuariosTable).where(eq(usuariosTable.email, "sysadmin"));
  const [userViejo] = await db.select({ id: usuariosTable.id }).from(usuariosTable).where(eq(usuariosTable.email, "admin"));
  if (userViejo && !userSysadmin) {
    await db
      .update(usuariosTable)
      .set({ email: "sysadmin", nombre: "SysAdmin", fecha_actualizacion: new Date() })
      .where(eq(usuariosTable.id, userViejo.id));
    logger.info('Usuario "admin" renombrado a "sysadmin"');
  }

  // --- Backfill de username (columna agregada después) ---
  // Cualquier usuario creado antes de este campo queda sin username; se le
  // asigna su email (ya único) para que el login no se corte. Corre en cada
  // arranque pero es un no-op una vez que todos los usuarios lo tienen.
  await db
    .update(usuariosTable)
    .set({ username: sql`${usuariosTable.email}` })
    .where(isNull(usuariosTable.username));

  // --- Roles base (siempre, idempotente) ---
  for (const base of ROLES_BASE) {
    const [existe] = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.nombre, base.nombre));
    if (!existe) {
      await db.insert(rolesTable).values(base);
      logger.info(`Rol base "${base.nombre}" creado`);
    }
  }

  // --- Alta inicial (solo si nadie puede loguearse todavía) ---
  const conPassword = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(isNotNull(usuariosTable.password_hash))
    .limit(1);
  if (conPassword.length > 0) return;

  let [rol] = await db.select().from(rolesTable).where(eq(rolesTable.nombre, ROL_SYSADMIN));
  if (!rol) {
    [rol] = await db
      .insert(rolesTable)
      .values({ nombre: ROL_SYSADMIN, descripcion: "Usuario Dios: acceso total al sistema" })
      .returning();
  }

  const passwordHash = hashPassword("admin");
  const [existente] = await db.select({ id: usuariosTable.id }).from(usuariosTable).where(eq(usuariosTable.email, "sysadmin"));
  if (existente) {
    await db
      .update(usuariosTable)
      .set({ username: "sysadmin", password_hash: passwordHash, activo: true, role_id: rol.id, fecha_actualizacion: new Date() })
      .where(eq(usuariosTable.id, existente.id));
  } else {
    await db.insert(usuariosTable).values({
      nombre: "SysAdmin",
      apellido: null,
      username: "sysadmin",
      email: "sysadmin",
      role_id: rol.id,
      password_hash: passwordHash,
    });
  }

  logger.warn('Usuario semilla "sysadmin" con clave "admin" disponible — cambiar la clave apenas se pueda');
}
