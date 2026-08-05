import { Router, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { ChangeOwnPasswordBody, LoginBody } from "@workspace/api-zod";
import {
  hashPassword,
  needsPasswordRehash,
  verifyPasswordOrDummy,
} from "../lib/passwords";
import {
  getSessionUser,
  purgeExpiredSessions,
} from "../lib/auth";
import {
  SESSION_TTL_MS,
  clearSessionCookie,
  getSessionToken,
  hasSessionCookie,
  isSessionExpired,
  setSessionCookie,
} from "../lib/session-cookie";
import {
  closeEventClientsForSession,
  closeEventClientsForUsers,
} from "../lib/events";
import { getNewPasswordPolicyError } from "../lib/new-password-policy";
import { executeLoginKdf, loginAttemptLimiter } from "../lib/login-rate-limit";
import { logger } from "../lib/logger";

const router = Router();

interface LoginUserRecord {
  id: number;
  username: string | null;
  nombre: string;
  apellido: string | null;
  email: string;
  password_hash: string;
  activo: boolean;
  rol: string;
  rol_activo: boolean;
  debe_cambiar_password: boolean;
}

const LOGIN_USER_COLUMNS = {
  id: usuariosTable.id,
  username: usuariosTable.username,
  nombre: usuariosTable.nombre,
  apellido: usuariosTable.apellido,
  email: usuariosTable.email,
  password_hash: usuariosTable.password_hash,
  activo: usuariosTable.activo,
  rol: rolesTable.nombre,
  rol_activo: rolesTable.activo,
  debe_cambiar_password: usuariosTable.debe_cambiar_password,
};

type LoginTransactionResult =
  | { kind: "authenticated"; user: LoginUserRecord }
  | { kind: "hash_changed"; user: LoginUserRecord }
  | { kind: "invalid" };

const LOGIN_RATE_LIMIT_ERROR = {
  code: "LOGIN_RATE_LIMITED",
  error:
    "Demasiados intentos de inicio de sesi\u00f3n. Esper\u00e1 unos minutos e intent\u00e1 nuevamente.",
} as const;

function sendLoginRateLimited(res: Response, retryAfterSeconds: number): void {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set("Retry-After", String(retryAfter));
  res.set("Cache-Control", "no-store");
  res.status(429).json({
    ...LOGIN_RATE_LIMIT_ERROR,
    retry_after_seconds: retryAfter,
  });
}

router.use("/auth", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const usuarioNormalizado = parsed.data.usuario.trim().toLowerCase();
  const loginAttempt = loginAttemptLimiter.reserve(usuarioNormalizado);
  if (!loginAttempt.allowed) {
    if (loginAttempt.newlyBlocked) {
      logger.warn(
        {
          retryAfterSeconds: loginAttempt.retryAfterSeconds,
        },
        "Login temporalmente limitado por intentos repetidos",
      );
    }
    sendLoginRateLimited(res, loginAttempt.retryAfterSeconds);
    return;
  }

  let reservationSettled = false;
  const refundReservation = () => {
    if (reservationSettled) return;
    reservationSettled = true;
    loginAttemptLimiter.refund(loginAttempt.reservation);
  };
  const confirmFailedCredentials = () => {
    if (reservationSettled) return;
    reservationSettled = true;
    loginAttemptLimiter.confirmFailure(loginAttempt.reservation);
  };
  const resetSuccessfulIdentity = () => {
    if (reservationSettled) return;
    reservationSettled = true;
    loginAttemptLimiter.reset(usuarioNormalizado);
  };
  // Express 5 deriva las excepciones async al error handler. Un 5xx no debe
  // convertirse en fallo de clave. Una desconexión, en cambio, no liquida la
  // reserva: el resultado real de la verificación debe cerrar el intento para
  // que abortar el cliente no permita eludir el límite.
  res.once("finish", () => {
    if (res.statusCode >= 500) refundReservation();
  });

  const [user] = await db
    .select(LOGIN_USER_COLUMNS)
    .from(usuariosTable)
    .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
    .where(eq(usuariosTable.username, usuarioNormalizado));

  // Se ejecuta un scrypt también para usuarios inexistentes o hashes rotos.
  // Además del mensaje genérico, esto evita enumeración por tiempo de respuesta.
  const passwordVerification = await executeLoginKdf(() =>
    verifyPasswordOrDummy(parsed.data.password, user?.password_hash ?? null),
  );
  if (!passwordVerification.admitted) {
    refundReservation();
    sendLoginRateLimited(res, passwordVerification.retryAfterSeconds);
    return;
  }
  const passwordValida = passwordVerification.value;
  if (
    !user ||
    !user.password_hash ||
    !user.activo ||
    !user.rol_activo ||
    !passwordValida
  ) {
    confirmFailedCredentials();
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  await purgeExpiredSessions();

  const token = randomBytes(32).toString("hex");
  let candidate: LoginUserRecord = {
    ...user,
    password_hash: user.password_hash,
  };
  let authenticatedUser: LoginUserRecord | null = null;

  // Dos logins pueden verificar a la vez el mismo hash legado. El primero lo
  // migra; el segundo vuelve a verificar una sola vez el hash nuevo en lugar
  // de rechazar una contraseña que sigue siendo válida. El límite evita un
  // bucle si un administrador está rotando la credencial en paralelo.
  for (let rehashAttempt = 0; rehashAttempt < 2; rehashAttempt += 1) {
    let passwordRehasheada: string | null = null;
    if (needsPasswordRehash(candidate.password_hash)) {
      const hash = await executeLoginKdf(() =>
        hashPassword(parsed.data.password),
      );
      if (!hash.admitted) {
        refundReservation();
        sendLoginRateLimited(res, hash.retryAfterSeconds);
        return;
      }
      passwordRehasheada = hash.value;
    }
    const result = db.transaction((tx): LoginTransactionResult => {
      // El KDF ocurre fuera de la transacción. Antes de emitir la sesión se
      // relee el estado y se exige el mismo hash, evitando que un reset
      // concurrente termine autenticando la contraseña anterior.
      const current = tx
        .select(LOGIN_USER_COLUMNS)
        .from(usuariosTable)
        .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
        .where(eq(usuariosTable.id, candidate.id))
        .get();
      if (
        !current ||
        !current.password_hash ||
        current.username !== usuarioNormalizado ||
        !current.activo ||
        !current.rol_activo
      ) {
        return { kind: "invalid" };
      }

      const stableCurrent: LoginUserRecord = {
        ...current,
        password_hash: current.password_hash,
      };
      if (stableCurrent.password_hash !== candidate.password_hash) {
        return { kind: "hash_changed", user: stableCurrent };
      }

      if (passwordRehasheada) {
        const update = tx
          .update(usuariosTable)
          .set({
            password_hash: passwordRehasheada,
            fecha_actualizacion: new Date(),
          })
          .where(
            and(
              eq(usuariosTable.id, stableCurrent.id),
              eq(usuariosTable.password_hash, candidate.password_hash),
            ),
          )
          .run();
        if (update.changes !== 1) {
          return { kind: "invalid" };
        }
      }
      tx.insert(sesionesTable)
        .values({
          token,
          usuario_id: stableCurrent.id,
          fecha_expiracion: new Date(Date.now() + SESSION_TTL_MS),
        })
        .run();
      return { kind: "authenticated", user: stableCurrent };
    });

    if (result.kind === "authenticated") {
      authenticatedUser = result.user;
      break;
    }
    if (result.kind === "invalid" || rehashAttempt > 0) break;

    const nextVerification = await executeLoginKdf(() =>
      verifyPasswordOrDummy(parsed.data.password, result.user.password_hash),
    );
    if (!nextVerification.admitted) {
      refundReservation();
      sendLoginRateLimited(res, nextVerification.retryAfterSeconds);
      return;
    }
    const passwordSigueSiendoValida = nextVerification.value;
    if (!passwordSigueSiendoValida) break;
    candidate = result.user;
  }

  if (!authenticatedUser) {
    refundReservation();
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  resetSuccessfulIdentity();
  setSessionCookie(res, token);
  res.json({
    id: authenticatedUser.id,
    nombre: authenticatedUser.nombre,
    apellido: authenticatedUser.apellido,
    email: authenticatedUser.email,
    rol: authenticatedUser.rol,
    debe_cambiar_password: authenticatedUser.debe_cambiar_password,
  });
});

router.post("/auth/password", async (req, res) => {
  const token = getSessionToken(req);
  const sessionUser = await getSessionUser(req);
  if (!token || !sessionUser) {
    clearSessionCookie(res);
    res
      .status(401)
      .json({ code: "SESSION_INVALID", error: "Sin sesión válida" });
    return;
  }

  const rawNewPassword =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as { password_nueva?: unknown }).password_nueva
      : undefined;
  const passwordPolicyError = getNewPasswordPolicyError(rawNewPassword);
  if (passwordPolicyError) {
    res.status(400).json({
      code: "NEW_PASSWORD_POLICY_VIOLATION",
      error: passwordPolicyError,
    });
    return;
  }

  const parsed = ChangeOwnPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: "INVALID_BODY", error: "Invalid body" });
    return;
  }

  const [account] = await db
    .select({ password_hash: usuariosTable.password_hash })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, sessionUser.id));
  const currentPasswordValid = await verifyPasswordOrDummy(
    parsed.data.password_actual,
    account?.password_hash ?? null,
  );
  if (!account?.password_hash || !currentPasswordValid) {
    // Si un reset revocó la sesión mientras se verificaba el hash observado,
    // no presentar esa carrera como una contraseña simplemente incorrecta.
    if (!(await getSessionUser(req))) {
      clearSessionCookie(res);
      res.status(401).json({
        code: "SESSION_CHANGED",
        error: "La sesión cambió mientras se verificaba la contraseña",
      });
      return;
    }
    res.status(400).json({
      code: "CURRENT_PASSWORD_INVALID",
      error: "La contraseña actual es incorrecta",
    });
    return;
  }
  if (parsed.data.password_nueva === parsed.data.password_actual) {
    res.status(409).json({
      code: "PASSWORD_REUSE_NOT_ALLOWED",
      error: "La contraseña nueva debe ser diferente de la actual",
    });
    return;
  }

  const observedHash = account.password_hash;
  const newToken = randomBytes(32).toString("hex");
  const newPasswordHash = await hashPassword(parsed.data.password_nueva);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const result = db.transaction((tx) => {
    const current = tx
      .select({
        ...LOGIN_USER_COLUMNS,
        session_expires_at: sesionesTable.fecha_expiracion,
      })
      .from(sesionesTable)
      .innerJoin(usuariosTable, eq(sesionesTable.usuario_id, usuariosTable.id))
      .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
      .where(eq(sesionesTable.token, token))
      .get();
    if (
      !current ||
      !current.password_hash ||
      !current.activo ||
      !current.rol_activo ||
      isSessionExpired(current.session_expires_at, now) ||
      current.password_hash !== observedHash
    ) {
      return { kind: "stale" } as const;
    }

    const updated = tx
      .update(usuariosTable)
      .set({
        password_hash: newPasswordHash,
        debe_cambiar_password: false,
        fecha_actualizacion: now,
      })
      .where(
        and(
          eq(usuariosTable.id, current.id),
          eq(usuariosTable.password_hash, observedHash),
        ),
      )
      .run();
    if (updated.changes !== 1) return { kind: "stale" } as const;

    tx.delete(sesionesTable)
      .where(eq(sesionesTable.usuario_id, current.id))
      .run();
    tx.insert(sesionesTable)
      .values({
        token: newToken,
        usuario_id: current.id,
        fecha_expiracion: expiresAt,
      })
      .run();

    return {
      kind: "changed",
      user: {
        id: current.id,
        nombre: current.nombre,
        apellido: current.apellido,
        email: current.email,
        rol: current.rol,
        debe_cambiar_password: false,
      },
    } as const;
  });

  if (result.kind === "stale") {
    clearSessionCookie(res);
    res.status(401).json({
      code: "SESSION_CHANGED",
      error: "La sesión cambió mientras se actualizaba la contraseña",
    });
    return;
  }

  closeEventClientsForUsers([result.user.id]);
  setSessionCookie(res, newToken);
  res.json(result.user);
});

router.post("/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    await db.delete(sesionesTable).where(eq(sesionesTable.token, token));
    closeEventClientsForSession(token);
  }
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    if (hasSessionCookie(req)) clearSessionCookie(res);
    res.status(401).json({ error: "Sin sesión válida" });
    return;
  }
  res.json(user);
});

export default router;
