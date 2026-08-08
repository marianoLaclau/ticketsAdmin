import type { Request, Response } from "express";
import { db, usuariosTable } from "@workspace/db";
import { ListAdminUsersQueryParams } from "@workspace/api-zod";
import { and, asc, count, eq, like, or, type SQL } from "drizzle-orm";
import { PUBLIC_ADMIN_USER_COLUMNS } from "./admin-user-public-columns";

const parseBooleanQueryParam = (value: unknown): unknown => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

export async function listAdminUsers(
  req: Request,
  res: Response,
): Promise<void> {
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
      .select(PUBLIC_ADMIN_USER_COLUMNS)
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
}
