import type { Request, Response } from "express";
import { db, rolesTable, sesionesTable, usuariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { DeleteAdminUserBody, DeleteAdminUserParams } from "@workspace/api-zod";
import { revokeEventClientsForUsers } from "../../../../lib/events";
import { isUsablePasswordHash } from "../../../../lib/passwords";
import { ROL_SYSADMIN } from "../../../../lib/rbac";
import type { SessionUser } from "../../../../lib/auth";
import { PUBLIC_ADMIN_USER_COLUMNS } from "../../data/public-user-columns";

const hasLoginIdentity = (value: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

/**
 * Borrado físico e irreversible de un usuario, con doble aprobación.
 *
 * La primera es `confirmar: true`; la segunda es repetir el nombre de usuario
 * exacto, para que un id equivocado no termine borrando a otra persona.
 *
 * El historial no se pierde: las referencias en tickets y seguimientos son
 * ON DELETE SET NULL y el nombre de quien hizo cada movimiento queda como
 * snapshot textual en la propia fila.
 */
export async function deleteAdminUser(
  req: Request,
  res: Response,
): Promise<void> {
  const params = DeleteAdminUserParams.safeParse({ id: req.params.id });
  if (!params.success || !Number.isInteger(params.data.id)) {
    res.status(400).json({ error: "Identificador de usuario inválido" });
    return;
  }

  const body = DeleteAdminUserBody.safeParse(req.body);
  if (!body.success || body.data.confirmar !== true) {
    res
      .status(400)
      .json({ error: "Falta la confirmación explícita (confirmar: true)" });
    return;
  }

  const autenticado = res.locals.authUser as SessionUser | undefined;
  if (autenticado?.id === params.data.id) {
    res.status(409).json({
      code: "SELF_DELETE_FORBIDDEN",
      error: "No podés eliminar tu propia cuenta",
    });
    return;
  }

  const resultado = db.transaction((tx) => {
    const actual = tx
      .select({
        id: usuariosTable.id,
        username: usuariosTable.username,
        activo: usuariosTable.activo,
        passwordHash: usuariosTable.password_hash,
        rol: rolesTable.nombre,
        rolActivo: rolesTable.activo,
      })
      .from(usuariosTable)
      .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
      .where(eq(usuariosTable.id, params.data.id))
      .get();
    if (!actual) return { kind: "not_found" } as const;

    // Segunda aprobación: el nombre tiene que coincidir con el de esta fila.
    if (
      !hasLoginIdentity(actual.username) ||
      normalizeUsername(actual.username) !==
        normalizeUsername(body.data.username)
    ) {
      return { kind: "username_mismatch" } as const;
    }

    // Nunca dejar el sistema sin un SysAdmin capaz de entrar.
    const esSysAdminAutenticable =
      actual.activo &&
      actual.rolActivo &&
      actual.rol === ROL_SYSADMIN &&
      isUsablePasswordHash(actual.passwordHash);
    if (esSysAdminAutenticable) {
      const reemplazos = tx
        .select({
          id: usuariosTable.id,
          username: usuariosTable.username,
          passwordHash: usuariosTable.password_hash,
        })
        .from(usuariosTable)
        .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
        .where(
          and(
            eq(usuariosTable.activo, true),
            eq(rolesTable.nombre, ROL_SYSADMIN),
            eq(rolesTable.activo, true),
          ),
        )
        .all()
        .filter((usuario) => usuario.id !== actual.id);
      const existeReemplazo = reemplazos.some(
        (usuario) =>
          hasLoginIdentity(usuario.username) &&
          isUsablePasswordHash(usuario.passwordHash),
      );
      if (!existeReemplazo) return { kind: "last_sysadmin" } as const;
    }

    tx.delete(sesionesTable)
      .where(eq(sesionesTable.usuario_id, actual.id))
      .run();
    const borrado = tx
      .delete(usuariosTable)
      .where(eq(usuariosTable.id, actual.id))
      .returning(PUBLIC_ADMIN_USER_COLUMNS)
      .get();
    if (!borrado) return { kind: "not_found" } as const;

    return { kind: "deleted", id: actual.id } as const;
  });

  switch (resultado.kind) {
    case "not_found":
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    case "username_mismatch":
      res.status(409).json({
        code: "USERNAME_MISMATCH",
        error: "El nombre de usuario no coincide con la cuenta a eliminar",
      });
      return;
    case "last_sysadmin":
      res.status(409).json({
        error: "Debe permanecer al menos un SysAdmin activo con credenciales",
      });
      return;
    case "deleted":
      // Corta el stream SSE de la persona eliminada, que ya no tiene sesión.
      revokeEventClientsForUsers([resultado.id]);
      res.status(204).send();
  }
}
