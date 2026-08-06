import { Router } from "express";
import { db, rolesTable, sesionesTable, usuariosTable } from "@workspace/db";
import { and, asc, count, eq, inArray, like, or, type SQL } from "drizzle-orm";
import {
  CreateAdminRoleBody,
  DeleteAdminRoleParams,
  ListAdminRolesQueryParams,
  UpdateAdminRoleBody,
  UpdateAdminRoleParams,
} from "@workspace/api-zod";
import { revokeEventClientsForUsers } from "../lib/events";
import { esNombreRolReservado, esRolSistema } from "../lib/rbac";
import {
  hasOwn,
  hasSqliteConstraint,
  normalizeOptionalText,
  normalizeRequiredText,
} from "./admin-route-helpers";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListAdminRolesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { search, page = 1, limit = 20 } = parsed.data;
  if (!Number.isInteger(page) || !Number.isInteger(limit)) {
    res.status(400).json({ error: "Invalid pagination params" });
    return;
  }

  const conditions: SQL[] = [];
  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    conditions.push(
      or(
        like(rolesTable.nombre, `%${normalizedSearch}%`),
        like(rolesTable.descripcion, `%${normalizedSearch}%`),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;
  const [roles, [{ total }]] = await Promise.all([
    db
      .select()
      .from(rolesTable)
      .where(where)
      .orderBy(asc(rolesTable.nombre), asc(rolesTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(rolesTable).where(where),
  ]);

  res.json({ roles, total, page, limit });
});

router.post("/", async (req, res) => {
  const parsed = CreateAdminRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const nombre = normalizeRequiredText(parsed.data.nombre);
  if (!nombre) {
    res.status(400).json({ error: "El nombre del rol es obligatorio" });
    return;
  }
  if (esNombreRolReservado(nombre)) {
    res.status(409).json({
      error: "Ese nombre está reservado para un rol del sistema",
    });
    return;
  }

  try {
    const [role] = await db
      .insert(rolesTable)
      .values({
        nombre,
        descripcion: normalizeOptionalText(parsed.data.descripcion),
        activo: parsed.data.activo,
      })
      .returning();
    res.status(201).json(role);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({ error: "Ya existe un rol con ese nombre" });
      return;
    }
    throw error;
  }
});

router.patch("/:id", async (req, res) => {
  const params = UpdateAdminRoleParams.safeParse({ id: req.params.id });
  const body = UpdateAdminRoleBody.safeParse(req.body);
  if (
    !params.success ||
    !Number.isInteger(params.data.id) ||
    !body.success ||
    Object.keys(body.data).length === 0
  ) {
    res.status(400).json({ error: "Invalid id or body" });
    return;
  }

  const [existing] = await db
    .select({ id: rolesTable.id, nombre: rolesTable.nombre })
    .from(rolesTable)
    .where(eq(rolesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Rol no encontrado" });
    return;
  }
  const rolSistema = esRolSistema(existing.nombre);

  const updates: Partial<typeof rolesTable.$inferInsert> = {
    fecha_actualizacion: new Date(),
  };
  if (hasOwn(body.data, "nombre") && body.data.nombre !== undefined) {
    const nombre = normalizeRequiredText(body.data.nombre);
    if (!nombre) {
      res.status(400).json({ error: "El nombre del rol es obligatorio" });
      return;
    }
    if (rolSistema && nombre !== existing.nombre) {
      res
        .status(409)
        .json({ error: "Los roles del sistema no se pueden renombrar" });
      return;
    }
    if (!rolSistema && esNombreRolReservado(nombre)) {
      res.status(409).json({
        error: "Ese nombre está reservado para un rol del sistema",
      });
      return;
    }
    updates.nombre = nombre;
  }
  if (hasOwn(body.data, "descripcion")) {
    updates.descripcion = normalizeOptionalText(body.data.descripcion);
  }
  if (body.data.activo !== undefined) {
    if (rolSistema && !body.data.activo) {
      res.status(409).json({
        error: "Los roles del sistema deben permanecer activos",
      });
      return;
    }
    updates.activo = body.data.activo;
  }

  try {
    const result = db.transaction((tx) => {
      const role = tx
        .update(rolesTable)
        .set(updates)
        .where(eq(rolesTable.id, params.data.id))
        .returning()
        .get();
      if (!role) return { kind: "not_found" } as const;

      const revokedUserIds =
        updates.activo === false
          ? tx
              .select({ id: usuariosTable.id })
              .from(usuariosTable)
              .where(eq(usuariosTable.role_id, role.id))
              .all()
              .map(({ id }) => id)
          : [];
      if (revokedUserIds.length > 0) {
        tx.delete(sesionesTable)
          .where(inArray(sesionesTable.usuario_id, revokedUserIds))
          .run();
      }
      return { kind: "updated", role, revokedUserIds } as const;
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    revokeEventClientsForUsers(result.revokedUserIds);
    res.json(result.role);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({ error: "Ya existe un rol con ese nombre" });
      return;
    }
    throw error;
  }
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteAdminRoleParams.safeParse({ id: req.params.id });
  if (!parsed.success || !Number.isInteger(parsed.data.id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [role] = await db
    .select({ id: rolesTable.id, nombre: rolesTable.nombre })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.id));
  if (!role) {
    res.status(404).json({ error: "Rol no encontrado" });
    return;
  }
  if (esRolSistema(role.nombre)) {
    res
      .status(409)
      .json({ error: "Los roles del sistema no se pueden eliminar" });
    return;
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(usuariosTable)
    .where(eq(usuariosTable.role_id, parsed.data.id));
  if (total > 0) {
    res
      .status(409)
      .json({ error: "No se puede eliminar un rol con usuarios asignados" });
    return;
  }

  try {
    await db.delete(rolesTable).where(eq(rolesTable.id, parsed.data.id));
    res.status(204).send();
  } catch (error) {
    if (hasSqliteConstraint(error, "FOREIGNKEY")) {
      res
        .status(409)
        .json({ error: "No se puede eliminar un rol con usuarios asignados" });
      return;
    }
    throw error;
  }
});

export default router;
