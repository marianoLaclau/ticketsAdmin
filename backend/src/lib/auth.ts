import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

export function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Webhook (n8n): la clave es OBLIGATORIA — si no está configurada en el
// servidor, la ingesta queda cerrada (503) hasta que se configure.
export function requireWebhookKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.WEBHOOK_API_KEY;
  if (!configuredKey) {
    res.status(503).json({ error: "WEBHOOK_API_KEY no está configurada en el servidor" });
    return;
  }
  const providedKey = req.header("x-api-key");
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    res.status(401).json({ error: "API key inválida" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Sesiones de login (cookie httpOnly respaldada en la tabla `sesiones`)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "gsb_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface SessionUser {
  id: number;
  nombre: string;
  apellido: string | null;
  email: string;
  rol: string;
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const [row] = await db
    .select({
      expiracion: sesionesTable.fecha_expiracion,
      usuario_id: usuariosTable.id,
      nombre: usuariosTable.nombre,
      apellido: usuariosTable.apellido,
      email: usuariosTable.email,
      activo: usuariosTable.activo,
      rol: rolesTable.nombre,
    })
    .from(sesionesTable)
    .innerJoin(usuariosTable, eq(sesionesTable.usuario_id, usuariosTable.id))
    .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
    .where(eq(sesionesTable.token, token));

  if (!row) return null;
  if (row.expiracion < new Date()) {
    await db.delete(sesionesTable).where(eq(sesionesTable.token, token));
    return null;
  }
  // Un usuario desactivado pierde el acceso aunque su sesión siga viva
  if (!row.activo) return null;

  return {
    id: row.usuario_id,
    nombre: row.nombre,
    apellido: row.apellido,
    email: row.email,
    rol: row.rol,
  };
}

// Candado global: toda ruta montada después de este middleware exige sesión.
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Sesión requerida" });
    return;
  }
  res.locals.authUser = user;
  next();
}

// Limpieza perezosa de sesiones vencidas (se invoca en cada login)
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sesionesTable).where(lt(sesionesTable.fecha_expiracion, new Date()));
}

// Admin: la clave es OPCIONAL — si ADMIN_API_KEY no está seteada, el panel
// queda abierto (modo red local de confianza). Si está seteada, se exige
// el header x-admin-key en todas las operaciones de administración.
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    next();
    return;
  }
  const providedKey = req.header("x-admin-key");
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    res.status(401).json({ error: "Clave de administración inválida" });
    return;
  }
  next();
}
