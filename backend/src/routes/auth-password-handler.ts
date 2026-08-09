import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { db, rolesTable, sesionesTable, usuariosTable } from "@workspace/db";
import { ChangeOwnPasswordBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "../lib/auth";
import { closeEventClientsForUsers } from "../lib/events";
import { getNewPasswordPolicyError } from "../lib/new-password-policy";
import { hashPassword, verifyPasswordOrDummy } from "../lib/passwords";
import {
  SESSION_TTL_MS,
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  isSessionExpired,
  setSessionCookie,
} from "../lib/session-cookie";
import { AUTH_ACCOUNT_COLUMNS } from "./auth-account-selection";

export async function changeOwnPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getSessionToken(req);
  const sessionUser = await getSessionUser(req);
  if (!token || !sessionUser) {
    clearSessionCookie(res);
    res
      .status(401)
      .json({ code: "SESSION_INVALID", error: "Sin sesión válida" });
    return;
  }
  const tokenHash = hashSessionToken(token);

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
  const newTokenHash = hashSessionToken(newToken);
  const newPasswordHash = await hashPassword(parsed.data.password_nueva);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const result = db.transaction((tx) => {
    const current = tx
      .select({
        ...AUTH_ACCOUNT_COLUMNS,
        session_expires_at: sesionesTable.fecha_expiracion,
      })
      .from(sesionesTable)
      .innerJoin(usuariosTable, eq(sesionesTable.usuario_id, usuariosTable.id))
      .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
      .where(eq(sesionesTable.token_hash, tokenHash))
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
        token_hash: newTokenHash,
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
}
