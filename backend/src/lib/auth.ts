import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { eq, lte } from "drizzle-orm";
import { ROL_SYSADMIN } from "./rbac";
import {
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  hasSessionCookie,
  isSessionExpired,
} from "./session-cookie";

export {
  ROL_SYSADMIN,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
  puedeCerrarTickets,
} from "./rbac";

export function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Webhook (n8n): la clave es OBLIGATORIA — si no está configurada en el
// servidor, la ingesta queda cerrada (503) hasta que se configure.
export function requireWebhookKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const configuredKey = process.env.WEBHOOK_API_KEY;
  if (!configuredKey) {
    res
      .status(503)
      .json({ error: "WEBHOOK_API_KEY no está configurada en el servidor" });
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

export interface SessionUser {
  id: number;
  nombre: string;
  apellido: string | null;
  email: string;
  rol: string;
  debe_cambiar_password: boolean;
}

export interface SessionContext {
  user: SessionUser;
  tokenHash: string;
  sessionExpiresAt: Date;
  adminElevationExpiresAt: Date | null;
  adminElevationKeyFingerprint: string | null;
}

export async function getSessionContext(
  req: Request,
): Promise<SessionContext | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);

  const [row] = await db
    .select({
      expiracion: sesionesTable.fecha_expiracion,
      admin_elevacion_hasta: sesionesTable.admin_elevacion_hasta,
      admin_elevacion_clave_hash: sesionesTable.admin_elevacion_clave_hash,
      usuario_id: usuariosTable.id,
      nombre: usuariosTable.nombre,
      apellido: usuariosTable.apellido,
      email: usuariosTable.email,
      activo: usuariosTable.activo,
      debe_cambiar_password: usuariosTable.debe_cambiar_password,
      rol: rolesTable.nombre,
      rol_activo: rolesTable.activo,
    })
    .from(sesionesTable)
    .innerJoin(usuariosTable, eq(sesionesTable.usuario_id, usuariosTable.id))
    .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
    .where(eq(sesionesTable.token_hash, tokenHash));

  if (!row) return null;
  if (isSessionExpired(row.expiracion)) {
    await db
      .delete(sesionesTable)
      .where(eq(sesionesTable.token_hash, tokenHash));
    return null;
  }
  // Desactivar al usuario o a su rol revoca la sesión en la primera consulta.
  if (!row.activo || !row.rol_activo) {
    await db
      .delete(sesionesTable)
      .where(eq(sesionesTable.token_hash, tokenHash));
    return null;
  }

  return {
    user: {
      id: row.usuario_id,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      rol: row.rol,
      debe_cambiar_password: row.debe_cambiar_password,
    },
    tokenHash,
    sessionExpiresAt: row.expiracion,
    adminElevationExpiresAt: row.admin_elevacion_hasta,
    adminElevationKeyFingerprint: row.admin_elevacion_clave_hash,
  };
}

export async function getSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  return (await getSessionContext(req))?.user ?? null;
}

// Candado global: toda ruta montada después de este middleware exige sesión.
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await getSessionContext(req);
  if (!session) {
    if (hasSessionCookie(req)) clearSessionCookie(res);
    res.status(401).json({ error: "Sesión requerida" });
    return;
  }
  res.locals.authUser = session.user;
  res.locals.authSession = session;
  next();
}

// Segundo candado global: una sesión creada con una clave temporal solo puede
// usar los endpoints de autenticación montados antes de este middleware.
// Comparar contra false hace que un valor ausente también falle cerrado.
export function requirePasswordChangeCompleted(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = res.locals.authUser as SessionUser | undefined;
  if (!user || user.debe_cambiar_password !== false) {
    res.status(403).json({
      code: "PASSWORD_CHANGE_REQUIRED",
      error: "Debés cambiar la contraseña temporal antes de continuar",
    });
    return;
  }
  next();
}

// Limpieza perezosa de sesiones vencidas (se invoca en cada login)
export async function purgeExpiredSessions(now = new Date()): Promise<void> {
  await db
    .delete(sesionesTable)
    .where(lte(sesionesTable.fecha_expiracion, now));
}

// Solo usuarios con el rol SysAdmin pueden operar el panel de administración.
// Corre después de requireSession, así que res.locals.authUser ya está.
export function requireSysAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = res.locals.authUser as SessionUser | undefined;
  if (!user || user.rol !== ROL_SYSADMIN) {
    res.status(403).json({ error: "Requiere rol SysAdmin" });
    return;
  }
  next();
}

// Admin: la clave es obligatoria y falla de forma cerrada. Una configuración
// ausente o vacía nunca debe convertir accidentalmente una ruta protegida en
// pública; el servidor devuelve 503 hasta que ADMIN_API_KEY sea configurada.
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey?.trim()) {
    res
      .status(503)
      .json({ error: "ADMIN_API_KEY no está configurada en el servidor" });
    return;
  }
  const providedKey = req.header("x-admin-key");
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    res.status(401).json({ error: "Clave de administración inválida" });
    return;
  }
  next();
}
