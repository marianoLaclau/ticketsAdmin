import type { NextFunction, Request, Response } from "express";
import { db, sesionesTable } from "@workspace/db";
import { CreateAdminElevationBody } from "@workspace/api-zod";
import { and, eq, gt, lte } from "drizzle-orm";
import {
  createAdminElevationGrant,
  isAdminElevationActive,
} from "../lib/admin-elevation";
import { adminElevationRateLimiter } from "../lib/admin-elevation-rate-limit";
import { safeEquals, type SessionContext } from "../lib/auth";
import { clearSessionCookie } from "../lib/session-cookie";

const INACTIVE_STATUS = Object.freeze({
  active: false,
  expires_at: null,
});
const INVALID_BODY_RESPONSE = Object.freeze({
  code: "ADMIN_ELEVATION_INVALID_BODY",
  error: "Solicitud de elevación inválida",
});

function getSessionContext(res: Response): SessionContext | null {
  return (res.locals.authSession as SessionContext | undefined) ?? null;
}

function getConfiguredAdminKey(): string | null {
  const configuredKey = process.env.ADMIN_API_KEY;
  return configuredKey?.trim() ? configuredKey : null;
}

function sendSessionInvalid(res: Response): void {
  clearSessionCookie(res);
  res.status(401).json({ code: "SESSION_INVALID", error: "Sesión requerida" });
}

function sendUnavailable(res: Response): void {
  res.status(503).json({
    code: "ADMIN_ELEVATION_UNAVAILABLE",
    error: "La elevación administrativa no está disponible",
  });
}

function isMalformedJsonError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const parserError = error as { status?: unknown; type?: unknown };
  return (
    parserError.status === 400 && parserError.type === "entity.parse.failed"
  );
}

export function adminElevationInvalidJsonErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const targetsAdminElevation =
    req.method === "POST" && /\/auth\/admin-elevation\/?$/.test(req.path);
  if (!targetsAdminElevation || !isMalformedJsonError(error)) {
    next(error);
    return;
  }

  res.status(400).json(INVALID_BODY_RESPONSE);
}

async function removeExpiredSession(
  session: SessionContext,
  now: Date,
): Promise<void> {
  await db
    .delete(sesionesTable)
    .where(
      and(
        eq(sesionesTable.token_hash, session.tokenHash),
        lte(sesionesTable.fecha_expiracion, now),
      ),
    );
}

function currentSessionCondition(session: SessionContext, now: Date) {
  return and(
    eq(sesionesTable.token_hash, session.tokenHash),
    eq(sesionesTable.usuario_id, session.user.id),
    eq(sesionesTable.fecha_expiracion, session.sessionExpiresAt),
    gt(sesionesTable.fecha_expiracion, now),
  );
}

export async function getAdminElevation(
  _req: Request,
  res: Response,
): Promise<void> {
  const session = getSessionContext(res);
  if (!session) {
    sendSessionInvalid(res);
    return;
  }

  const configuredAdminApiKey = getConfiguredAdminKey();
  if (!configuredAdminApiKey) {
    sendUnavailable(res);
    return;
  }

  const elevationExpiresAt = session.adminElevationExpiresAt;
  const active = isAdminElevationActive({
    now: new Date(),
    sessionExpiresAt: session.sessionExpiresAt,
    elevationExpiresAt,
    storedKeyFingerprint: session.adminElevationKeyFingerprint,
    configuredAdminApiKey,
  });
  res.json({
    active,
    expires_at:
      active && elevationExpiresAt ? elevationExpiresAt.toISOString() : null,
  });
}

export async function createAdminElevation(
  req: Request,
  res: Response,
): Promise<void> {
  const session = getSessionContext(res);
  if (!session) {
    sendSessionInvalid(res);
    return;
  }

  const decision = adminElevationRateLimiter.reserve(session.tokenHash);
  if (!decision.allowed) {
    res.set("Retry-After", String(decision.retryAfterSeconds));
    res.status(429).json({
      code: "ADMIN_ELEVATION_RATE_LIMITED",
      error: "Demasiados intentos de elevación. Intentá nuevamente más tarde",
      retry_after_seconds: decision.retryAfterSeconds,
    });
    return;
  }

  const { reservation } = decision;
  let reservationSettled = false;
  const refundReservation = () => {
    if (reservationSettled) return;
    adminElevationRateLimiter.refund(reservation);
    reservationSettled = true;
  };

  try {
    const parsed = CreateAdminElevationBody.strict().safeParse(req.body);
    if (!parsed.success) {
      refundReservation();
      res.status(400).json(INVALID_BODY_RESPONSE);
      return;
    }

    const configuredAdminApiKey = getConfiguredAdminKey();
    if (!configuredAdminApiKey) {
      refundReservation();
      sendUnavailable(res);
      return;
    }

    if (!safeEquals(parsed.data.admin_key, configuredAdminApiKey)) {
      adminElevationRateLimiter.confirmFailure(reservation);
      reservationSettled = true;
      res.status(401).json({
        code: "ADMIN_KEY_INVALID",
        error: "Clave de administración inválida",
      });
      return;
    }

    const now = new Date();
    const grant = createAdminElevationGrant({
      now,
      sessionExpiresAt: session.sessionExpiresAt,
      configuredAdminApiKey,
    });
    if (!grant) {
      refundReservation();
      await removeExpiredSession(session, now);
      sendSessionInvalid(res);
      return;
    }

    const [updated] = await db
      .update(sesionesTable)
      .set({
        admin_elevacion_hasta: grant.expiresAt,
        admin_elevacion_clave_hash: grant.keyFingerprint,
      })
      .where(currentSessionCondition(session, now))
      .returning({ tokenHash: sesionesTable.token_hash });
    if (!updated) {
      refundReservation();
      await removeExpiredSession(session, now);
      sendSessionInvalid(res);
      return;
    }

    adminElevationRateLimiter.resetSession(session.tokenHash);
    reservationSettled = true;
    res.json({ active: true, expires_at: grant.expiresAt.toISOString() });
  } catch (error) {
    refundReservation();
    throw error;
  }
}

export async function deleteAdminElevation(
  _req: Request,
  res: Response,
): Promise<void> {
  const session = getSessionContext(res);
  if (!session) {
    sendSessionInvalid(res);
    return;
  }

  const hadPersistedElevation =
    session.adminElevationExpiresAt !== null ||
    session.adminElevationKeyFingerprint !== null;
  const now = new Date();
  const [updated] = await db
    .update(sesionesTable)
    .set({
      admin_elevacion_hasta: null,
      admin_elevacion_clave_hash: null,
    })
    .where(currentSessionCondition(session, now))
    .returning({ tokenHash: sesionesTable.token_hash });

  if (!updated) {
    await removeExpiredSession(session, now);
    sendSessionInvalid(res);
    return;
  }

  if (hadPersistedElevation) {
    adminElevationRateLimiter.resetSession(session.tokenHash);
  }
  res.json(INACTIVE_STATUS);
}
