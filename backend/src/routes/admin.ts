import { Router } from "express";
import {
  db,
  esTicketVacio,
  ticketsTable,
  rolesTable,
  usuariosTable,
  sesionesTable,
} from "@workspace/db";
import { and, asc, count, eq, like, or, type SQL } from "drizzle-orm";
import {
  CreateAdminTicketBody,
  ListAdminUsersQueryParams,
  CreateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserBody,
  ResetAdminUserPasswordParams,
  ResetAdminUserPasswordBody,
} from "@workspace/api-zod";
import { calcularFechaLimiteSla, clasificarMotivo } from "@workspace/ingesta";
import { requireAdminKey, requireSysAdmin } from "../lib/auth";
import { hashPassword, isUsablePasswordHash } from "../lib/passwords";
import { broadcastEvent, revokeEventClientsForUsers } from "../lib/events";
import { findInvalidRfc3339DateTimeField } from "../lib/rfc3339";
import { ROL_SYSADMIN } from "../lib/rbac";
import { getNewPasswordPolicyError } from "../lib/new-password-policy";
import { loginAttemptLimiter } from "../lib/login-rate-limit";
import adminBulkRouter from "./admin-bulk";
import adminRolesRouter from "./admin-roles";
import {
  hasOwn,
  hasSqliteConstraint,
  normalizeOptionalText,
  normalizeRequiredText,
} from "./admin-route-helpers";

const router = Router();

// Doble llave sobre la sesión ya validada: primero el rol SysAdmin del
// usuario logueado, después la clave de administración (x-admin-key).
router.use("/admin", requireSysAdmin, requireAdminKey);

const parseBooleanQueryParam = (value: unknown): unknown => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const readPasswordFromBody = (body: unknown): unknown => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return (body as { password?: unknown }).password;
};

const hasLoginIdentity = (value: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

// Nunca devolver password_hash en una respuesta HTTP — ni siquiera hasheada,
// una contraseña no tiene por qué viajar de vuelta al cliente.
const PUBLIC_USER_COLUMNS = {
  id: usuariosTable.id,
  nombre: usuariosTable.nombre,
  apellido: usuariosTable.apellido,
  username: usuariosTable.username,
  email: usuariosTable.email,
  role_id: usuariosTable.role_id,
  activo: usuariosTable.activo,
  debe_cambiar_password: usuariosTable.debe_cambiar_password,
  fecha_creacion: usuariosTable.fecha_creacion,
  fecha_actualizacion: usuariosTable.fecha_actualizacion,
};

// Alta manual de un registro (el flujo normal sigue siendo el webhook)
router.post("/admin/tickets", async (req, res) => {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    const invalidDateField = findInvalidRfc3339DateTimeField(req.body, [
      "fecha_limite",
    ] as const);
    if (invalidDateField) {
      res.status(400).json({
        error: `${invalidDateField} debe ser una fecha RFC3339 válida con zona horaria`,
      });
      return;
    }
  }

  const parsed = CreateAdminTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const [existing] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(eq(ticketsTable.conversation_id, data.conversation_id));
  if (existing) {
    res.status(409).json({
      error: "Ya existe un ticket con ese conversation_id",
      ticket_id: existing.id,
    });
    return;
  }

  const fechaCreacion = new Date();
  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      conversation_id: data.conversation_id,
      hora: data.hora,
      nombre: data.nombre,
      apellido: data.apellido,
      telefono: data.telefono ?? null,
      dni: data.dni ?? null,
      empresa: data.empresa ?? null,
      estado_empleado: data.estado_empleado ?? null,
      email: data.email ?? null,
      motivo: data.motivo,
      motivo_categoria: clasificarMotivo(data.motivo, data.resumen),
      resumen: data.resumen ?? null,
      notificado: data.notificado ?? false,
      estado:
        (data.estado as
          "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado") ??
        "nuevo",
      prioridad:
        (data.prioridad as "baja" | "media" | "alta" | "urgente") ?? "media",
      asignado_a: data.asignado_a ?? null,
      audio_url: data.audio_url ?? null,
      notas: data.notas ?? null,
      fecha_creacion: fechaCreacion,
      fecha_limite: data.fecha_limite
        ? new Date(data.fecha_limite)
        : calcularFechaLimiteSla(fechaCreacion),
      progreso: data.progreso ?? 0,
    })
    .returning();

  if (esTicketVacio(ticket)) {
    broadcastEvent("datos_actualizados");
  } else {
    broadcastEvent("ticket_creado", {
      ticket_id: ticket.id,
      nombre: ticket.nombre,
      apellido: ticket.apellido,
      motivo: ticket.motivo,
    });
  }

  res.status(201).json(ticket);
});

// Gestión de roles y usuarios del catálogo administrativo
router.use("/admin/roles", adminRolesRouter);

router.get("/admin/users", async (req, res) => {
  const parsed = ListAdminUsersQueryParams.safeParse({
    ...req.query,
    activo: parseBooleanQueryParam(req.query.activo),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { search, role_id: roleId, activo, page = 1, limit = 20 } = parsed.data;
  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    (roleId !== undefined && !Number.isInteger(roleId))
  ) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const conditions: SQL[] = [];
  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    conditions.push(
      or(
        like(usuariosTable.nombre, `%${normalizedSearch}%`),
        like(usuariosTable.apellido, `%${normalizedSearch}%`),
        like(usuariosTable.email, `%${normalizedSearch}%`),
      )!,
    );
  }
  if (roleId !== undefined) conditions.push(eq(usuariosTable.role_id, roleId));
  if (activo !== undefined) conditions.push(eq(usuariosTable.activo, activo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;
  const [users, [{ total }]] = await Promise.all([
    db
      .select(PUBLIC_USER_COLUMNS)
      .from(usuariosTable)
      .where(where)
      .orderBy(
        asc(usuariosTable.nombre),
        asc(usuariosTable.apellido),
        asc(usuariosTable.id),
      )
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(usuariosTable).where(where),
  ]);

  res.json({ users, total, page, limit });
});

router.post("/admin/users", async (req, res) => {
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
        .returning(PUBLIC_USER_COLUMNS)
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

router.patch("/admin/users/:id", async (req, res) => {
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
        .returning(PUBLIC_USER_COLUMNS)
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
router.post("/admin/users/:id/password", async (req, res) => {
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
});

router.use(adminBulkRouter);

export default router;
