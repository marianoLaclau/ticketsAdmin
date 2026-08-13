import type { Request, Response } from "express";
import { db, sesionesTable, usuariosTable } from "@workspace/db";
import {
  ResetAdminUserPasswordBody,
  ResetAdminUserPasswordParams,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { revokeEventClientsForUsers } from "../../../../shared/realtime/events";
import {
  getNewPasswordPolicyError,
  hashPassword,
  loginAttemptLimiter,
} from "../../../auth";
import { readPasswordFromBody } from "../route-helpers";

export async function resetAdminUserPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const params = ResetAdminUserPasswordParams.safeParse({ id: req.params.id });
  if (!params.success || !Number.isInteger(params.data.id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const passwordPolicyError = getNewPasswordPolicyError(
    readPasswordFromBody(req.body),
  );
  if (passwordPolicyError) {
    res.status(400).json({ error: passwordPolicyError });
    return;
  }
  const body = ResetAdminUserPasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const passwordHash = await hashPassword(body.data.password);
  const updated = db.transaction((tx) => {
    const current = tx
      .select({ username: usuariosTable.username })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, params.data.id))
      .get();
    if (!current) return { kind: "not_found" } as const;

    const result = tx
      .update(usuariosTable)
      .set({
        password_hash: passwordHash,
        debe_cambiar_password: true,
        fecha_actualizacion: new Date(),
      })
      .where(eq(usuariosTable.id, params.data.id))
      .run();
    if (result.changes !== 1) return { kind: "not_found" } as const;
    tx.delete(sesionesTable)
      .where(eq(sesionesTable.usuario_id, params.data.id))
      .run();
    return { kind: "updated", username: current.username } as const;
  });
  if (updated.kind === "not_found") {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  revokeEventClientsForUsers([params.data.id]);
  if (updated.username) loginAttemptLimiter.reset(updated.username);

  res.status(204).end();
}
