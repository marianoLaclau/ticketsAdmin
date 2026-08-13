import { Router } from "express";
import { db, rolesTable, sesionesTable, usuariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  CreateAdminUserBody,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
} from "@workspace/api-zod";
import { revokeEventClientsForUsers } from "../../../shared/realtime/events";
import {
  getNewPasswordPolicyError,
  hashPassword,
  isUsablePasswordHash,
  loginAttemptLimiter,
  ROL_SYSADMIN,
} from "../../auth";
import {
  hasOwn,
  hasSqliteConstraint,
  normalizeOptionalText,
  normalizeRequiredText,
  readPasswordFromBody,
} from "./route-helpers";
import { deleteAdminUser } from "./handlers/delete-user";
import { resetAdminUserPassword } from "./handlers/reset-user-password";
import { listAdminUsers } from "./handlers/list-users";
import { PUBLIC_ADMIN_USER_COLUMNS } from "../data/public-user-columns";

const router = Router();

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const hasLoginIdentity = (value: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

router.get("/", listAdminUsers);

router.post("/", async (req, res) => {
  const passwordPolicyError = getNewPasswordPolicyError(
    readPasswordFromBody(req.body),
  );
  if (passwordPolicyError) {
    res.status(400).json({ error: passwordPolicyError });
    return;
  }
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const nombre = normalizeRequiredText(parsed.data.nombre);
  const email = normalizeEmail(parsed.data.email);
  const username = normalizeUsername(parsed.data.username);
  if (!nombre || !email || !username) {
    res
      .status(400)
      .json({ error: "Nombre, nombre de usuario y email son obligatorios" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const result = db.transaction((tx) => {
      const role = tx
        .select({ activo: rolesTable.activo })
        .from(rolesTable)
        .where(eq(rolesTable.id, parsed.data.role_id))
        .get();
      if (!role) return { kind: "role_not_found" } as const;
      if (!role.activo) return { kind: "role_inactive" } as const;

      // Estos chequeos distinguen las dos restricciones UNIQUE; la base sigue
      // siendo la última defensa si dos procesos intentan el alta a la vez.
      const emailEnUso = tx
        .select({ id: usuariosTable.id })
        .from(usuariosTable)
        .where(eq(usuariosTable.email, email))
        .get();
      if (emailEnUso) return { kind: "email_exists" } as const;
      const usernameEnUso = tx
        .select({ id: usuariosTable.id })
        .from(usuariosTable)
        .where(eq(usuariosTable.username, username))
        .get();
      if (usernameEnUso) return { kind: "username_exists" } as const;

      const user = tx
        .insert(usuariosTable)
        .values({
          nombre,
          apellido: normalizeOptionalText(parsed.data.apellido),
          username,
          password_hash: passwordHash,
          debe_cambiar_password: true,
          email,
          role_id: parsed.data.role_id,
          activo: parsed.data.activo,
        })
        .returning(PUBLIC_ADMIN_USER_COLUMNS)
        .get();
      return { kind: "created", user } as const;
    });
    if (result.kind === "role_not_found") {
      res.status(400).json({ error: "El rol indicado no existe" });
      return;
    }
    if (result.kind === "role_inactive") {
      res.status(409).json({ error: "No se puede asignar un rol inactivo" });
      return;
    }
    if (result.kind === "email_exists") {
      res.status(409).json({ error: "Ya existe un usuario con ese email" });
      return;
    }
    if (result.kind === "username_exists") {
      res
        .status(409)
        .json({ error: "Ya existe un usuario con ese nombre de usuario" });
      return;
    }
    loginAttemptLimiter.reset(username);
    res.status(201).json(result.user);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({
        error: "Ya existe un usuario con ese email o nombre de usuario",
      });
      return;
    }
    if (hasSqliteConstraint(error, "FOREIGNKEY")) {
      res.status(400).json({ error: "El rol indicado no existe" });
      return;
    }
    throw error;
  }
});

router.patch("/:id", async (req, res) => {
  const params = UpdateAdminUserParams.safeParse({ id: req.params.id });
  const body = UpdateAdminUserBody.safeParse(req.body);
  if (
    !params.success ||
    !Number.isInteger(params.data.id) ||
    !body.success ||
    Object.keys(body.data).length === 0
  ) {
    res.status(400).json({ error: "Invalid id or body" });
    return;
  }

  const updates: Partial<typeof usuariosTable.$inferInsert> = {
    fecha_actualizacion: new Date(),
  };
  if (hasOwn(body.data, "nombre") && body.data.nombre !== undefined) {
    const nombre = normalizeRequiredText(body.data.nombre);
    if (!nombre) {
      res.status(400).json({ error: "El nombre del usuario es obligatorio" });
      return;
    }
    updates.nombre = nombre;
  }
  if (hasOwn(body.data, "apellido")) {
    updates.apellido = normalizeOptionalText(body.data.apellido);
  }
  if (body.data.email !== undefined)
    updates.email = normalizeEmail(body.data.email);
  if (body.data.username !== undefined) {
    const username = normalizeUsername(body.data.username);
    if (!username) {
      res.status(400).json({ error: "El nombre de usuario es obligatorio" });
      return;
    }
    updates.username = username;
  }
  if (body.data.role_id !== undefined) updates.role_id = body.data.role_id;
  if (body.data.activo !== undefined) updates.activo = body.data.activo;

  try {
    const result = db.transaction((tx) => {
      const current = tx
        .select({
          id: usuariosTable.id,
          activo: usuariosTable.activo,
          roleId: usuariosTable.role_id,
          username: usuariosTable.username,
          passwordHash: usuariosTable.password_hash,
          rol: rolesTable.nombre,
          rolActivo: rolesTable.activo,
        })
        .from(usuariosTable)
        .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
        .where(eq(usuariosTable.id, params.data.id))
        .get();
      if (!current) return { kind: "not_found" } as const;

      let rolDestino = { nombre: current.rol, activo: current.rolActivo };
      if (body.data.role_id !== undefined) {
        const role = tx
          .select({ nombre: rolesTable.nombre, activo: rolesTable.activo })
          .from(rolesTable)
          .where(eq(rolesTable.id, body.data.role_id))
          .get();
        if (!role) return { kind: "role_not_found" } as const;
        if (!role.activo) return { kind: "role_inactive" } as const;
        rolDestino = role;
      }

      const eraSysAdminAutenticable =
        current.activo &&
        current.rolActivo &&
        current.rol === ROL_SYSADMIN &&
        hasLoginIdentity(current.username) &&
        isUsablePasswordHash(current.passwordHash);
      const seguiraSiendoSysAdminAutenticable =
        (updates.activo ?? current.activo) &&
        rolDestino.activo &&
        rolDestino.nombre === ROL_SYSADMIN &&
        hasLoginIdentity(
          (updates.username as string | null | undefined) ?? current.username,
        ) &&
        isUsablePasswordHash(current.passwordHash);

      if (eraSysAdminAutenticable && !seguiraSiendoSysAdminAutenticable) {
        const otros = tx
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
          .filter((usuario) => usuario.id !== current.id);
        const existeReemplazo = otros.some(
          (usuario) =>
            hasLoginIdentity(usuario.username) &&
            isUsablePasswordHash(usuario.passwordHash),
        );
        if (!existeReemplazo) {
          return { kind: "last_sysadmin" } as const;
        }
      }

      const user = tx
        .update(usuariosTable)
        .set(updates)
        .where(eq(usuariosTable.id, current.id))
        .returning(PUBLIC_ADMIN_USER_COLUMNS)
        .get();
      const roleChanged =
        body.data.role_id !== undefined && body.data.role_id !== current.roleId;
      const sessionsRevoked = updates.activo === false || roleChanged;
      if (sessionsRevoked) {
        tx.delete(sesionesTable)
          .where(eq(sesionesTable.usuario_id, current.id))
          .run();
      }
      return {
        kind: "updated",
        user,
        previousUsername: current.username,
        sessionsRevoked,
      } as const;
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    if (result.kind === "role_not_found") {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    if (result.kind === "role_inactive") {
      res.status(409).json({ error: "No se puede asignar un rol inactivo" });
      return;
    }
    if (result.kind === "last_sysadmin") {
      res.status(409).json({
        error: "Debe permanecer al menos un SysAdmin activo con credenciales",
      });
      return;
    }
    if (result.sessionsRevoked) {
      revokeEventClientsForUsers([params.data.id]);
    }
    if (updates.username !== undefined) {
      if (result.previousUsername) {
        loginAttemptLimiter.reset(result.previousUsername);
      }
      if (result.user.username) loginAttemptLimiter.reset(result.user.username);
    }
    res.json(result.user);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({
        error: "Ya existe un usuario con ese email o nombre de usuario",
      });
      return;
    }
    if (hasSqliteConstraint(error, "FOREIGNKEY")) {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    throw error;
  }
});

// Establecer/reestablecer la contraseña de un usuario. Revoca todas sus
// sesiones activas: si estaba logueado, queda afuera hasta usar la clave nueva.
router.post("/:id/password", resetAdminUserPassword);

// Borrado físico con doble aprobación. La desactivación (PATCH activo:false)
// sigue siendo el camino recomendado: conserva la identidad en el historial.
router.delete("/:id", deleteAdminUser);

export default router;
