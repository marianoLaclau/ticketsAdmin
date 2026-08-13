import type { Request, Response } from "express";
import { db, rolesTable } from "@workspace/db";
import { ListAdminRolesQueryParams } from "@workspace/api-zod";
import { and, asc, count, like, or, type SQL } from "drizzle-orm";

export async function listAdminRoles(
  req: Request,
  res: Response,
): Promise<void> {
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
}
