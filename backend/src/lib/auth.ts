import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { eq, lte } from "drizzle-orm";
import {
  CAPACIDAD_GESTIONAR_TICKETS,
  CAPACIDAD_VER_RENDIMIENTO,
  ROL_SYSADMIN,
  tieneCapacidad,
  type Capacidad,
} from "./rbac";
import {
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  hasSessionCookie,
  isSessionExpired,
} from "./session-cookie";

export {
  ROL_SYSADMIN,
  ROL_CONTROLLER,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
  puedeCerrarTickets,
  puedeGestionarTickets,
  puedeVerRendimiento,
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
    res
      .status(401)
      .json({ code: "SESSION_INVALID", error: "Sesión requerida" });
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
    res
      .status(403)
      .json({ code: "SYSADMIN_REQUIRED", error: "Requiere rol SysAdmin" });
    return;
  }
  next();
}

type CapabilityError = {
  code: string;
  error: string;
};

function buildCapabilityMiddleware(
  capacidad: Capacidad,
  forbidden: CapabilityError,
) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.authUser as SessionUser | undefined;
    if (!user || !tieneCapacidad(user.rol, capacidad)) {
      res.status(403).json(forbidden);
      return;
    }
    next();
  };
}

/** Impide que perfiles de consulta, como Controller, muten tickets. */
export const requireTicketWriteAccess = buildCapabilityMiddleware(
  CAPACIDAD_GESTIONAR_TICKETS,
  {
    code: "TICKET_WRITE_FORBIDDEN",
    error: "El rol actual solo puede consultar tickets",
  },
);

/** Frontera reutilizable para el futuro módulo ejecutivo de Rendimiento. */
export const requirePerformanceAccess = buildCapabilityMiddleware(
  CAPACIDAD_VER_RENDIMIENTO,
  {
    code: "PERFORMANCE_ACCESS_REQUIRED",
    error: "Requiere rol SysAdmin o Controller",
  },
);
