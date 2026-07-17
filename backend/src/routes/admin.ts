import { Router } from "express";
import {
  db,
  sqlite,
  ticketsTable,
  seguimientosTable,
  rolesTable,
  usuariosTable,
} from "@workspace/db";
import { and, asc, count, eq, like, or, type SQL } from "drizzle-orm";
import {
  CreateAdminTicketBody,
  ImportCsvBody,
  TruncateTicketsBody,
  ListAdminRolesQueryParams,
  CreateAdminRoleBody,
  UpdateAdminRoleParams,
  UpdateAdminRoleBody,
  DeleteAdminRoleParams,
  ListAdminUsersQueryParams,
  CreateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserBody,
} from "@workspace/api-zod";
import {
  parseCsv,
  detectarColumnas,
  filaATicket,
  SLA_MS,
} from "@workspace/ingesta";
import { requireAdminKey } from "../lib/auth";
import { broadcastEvent } from "../lib/events";

const router = Router();

router.use("/admin", requireAdminKey);

const parseBooleanQueryParam = (value: unknown): unknown => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

const normalizeRequiredText = (value: string): string => value.trim();

const normalizeOptionalText = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasSqliteConstraint = (error: unknown, constraint: string): boolean => {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.includes(constraint)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

// Alta manual de un registro (el flujo normal sigue siendo el webhook)
router.post("/admin/tickets", async (req, res) => {
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
      email: data.email ?? null,
      motivo: data.motivo,
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
      fecha_limite: data.fecha_limite
        ? new Date(data.fecha_limite)
        : new Date(Date.now() + SLA_MS),
      progreso: data.progreso ?? 0,
    })
    .returning();

  broadcastEvent("ticket_creado", {
    ticket_id: ticket.id,
    nombre: ticket.nombre,
    apellido: ticket.apellido,
    motivo: ticket.motivo,
  });

  res.status(201).json(ticket);
});

// Gestión de roles y usuarios del catálogo administrativo
router.get("/admin/roles", async (req, res) => {
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

router.post("/admin/roles", async (req, res) => {
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

router.patch("/admin/roles/:id", async (req, res) => {
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
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Rol no encontrado" });
    return;
  }

  const updates: Partial<typeof rolesTable.$inferInsert> = {
    fecha_actualizacion: new Date(),
  };
  if (hasOwn(body.data, "nombre") && body.data.nombre !== undefined) {
    const nombre = normalizeRequiredText(body.data.nombre);
    if (!nombre) {
      res.status(400).json({ error: "El nombre del rol es obligatorio" });
      return;
    }
    updates.nombre = nombre;
  }
  if (hasOwn(body.data, "descripcion")) {
    updates.descripcion = normalizeOptionalText(body.data.descripcion);
  }
  if (body.data.activo !== undefined) updates.activo = body.data.activo;

  try {
    const [role] = await db
      .update(rolesTable)
      .set(updates)
      .where(eq(rolesTable.id, params.data.id))
      .returning();
    res.json(role);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({ error: "Ya existe un rol con ese nombre" });
      return;
    }
    throw error;
  }
});

router.delete("/admin/roles/:id", async (req, res) => {
  const parsed = DeleteAdminRoleParams.safeParse({ id: req.params.id });
  if (!parsed.success || !Number.isInteger(parsed.data.id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.id));
  if (!role) {
    res.status(404).json({ error: "Rol no encontrado" });
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
      .select()
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
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const nombre = normalizeRequiredText(parsed.data.nombre);
  const email = normalizeEmail(parsed.data.email);
  if (!nombre || !email) {
    res.status(400).json({ error: "Nombre y email son obligatorios" });
    return;
  }

  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.role_id));
  if (!role) {
    res.status(400).json({ error: "El rol indicado no existe" });
    return;
  }

  try {
    const [user] = await db
      .insert(usuariosTable)
      .values({
        nombre,
        apellido: normalizeOptionalText(parsed.data.apellido),
        email,
        role_id: parsed.data.role_id,
        activo: parsed.data.activo,
      })
      .returning();
    res.status(201).json(user);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({ error: "Ya existe un usuario con ese email" });
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

  const [existing] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  if (body.data.role_id !== undefined) {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.id, body.data.role_id));
    if (!role) {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
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
  if (body.data.role_id !== undefined) updates.role_id = body.data.role_id;
  if (body.data.activo !== undefined) updates.activo = body.data.activo;

  try {
    const [user] = await db
      .update(usuariosTable)
      .set(updates)
      .where(eq(usuariosTable.id, params.data.id))
      .returning();
    res.json(user);
  } catch (error) {
    if (hasSqliteConstraint(error, "UNIQUE")) {
      res.status(409).json({ error: "Ya existe un usuario con ese email" });
      return;
    }
    if (hasSqliteConstraint(error, "FOREIGNKEY")) {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    throw error;
  }
});

// Importación masiva desde CSV (misma lógica que el importador CLI)
router.post("/admin/import", async (req, res) => {
  const parsed = ImportCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { csv, dry_run: dryRun = false } = parsed.data;

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    res.status(400).json({
      error:
        "El CSV no tiene filas de datos (se espera encabezado + registros)",
    });
    return;
  }
  const [headerCells, ...dataRows] = rows;
  const { columnas, sinMapear } = detectarColumnas(headerCells);

  if (![...columnas.values()].includes("conversation_id")) {
    res.status(400).json({
      error: "No se encontró ninguna columna que mapee a conversation_id",
      sin_mapear: sinMapear,
    });
    return;
  }

  const existing = new Set(
    (
      await db.select({ cid: ticketsTable.conversation_id }).from(ticketsTable)
    ).map((r) => r.cid),
  );

  let insertados = 0;
  let yaExistentes = 0;
  let invalidos = 0;
  const advertencias: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const record: Record<string, string> = {};
    for (const [idx, field] of columnas) {
      record[field] = dataRows[i][idx] ?? "";
    }

    const values = filaATicket(record);
    if (!values) {
      advertencias.push(`Fila ${i + 2}: sin conversation_id, salteada`);
      invalidos++;
      continue;
    }
    if (existing.has(values.conversation_id)) {
      yaExistentes++;
      continue;
    }
    existing.add(values.conversation_id);

    if (!dryRun) {
      await db.insert(ticketsTable).values(values);
    }
    insertados++;
  }

  if (!dryRun && insertados > 0) {
    broadcastEvent("tickets_importados", { cantidad: insertados });
  }

  res.json({
    dry_run: dryRun,
    filas: dataRows.length,
    insertados,
    ya_existentes: yaExistentes,
    invalidos,
    columnas: [...columnas.entries()].map(([idx, campo]) => ({
      columna: headerCells[idx] ?? `col ${idx + 1}`,
      campo,
    })),
    sin_mapear: sinMapear,
    advertencias: advertencias.slice(0, 50),
  });
});

// Truncate: borra TODOS los registros y reinicia los ids. El schema queda.
router.post("/admin/truncate", async (req, res) => {
  const parsed = TruncateTicketsBody.safeParse(req.body);
  if (!parsed.success || parsed.data.confirmar !== true) {
    res
      .status(400)
      .json({ error: "Falta la confirmación explícita (confirmar: true)" });
    return;
  }

  const seguimientosEliminados = (
    await db.delete(seguimientosTable).returning({ id: seguimientosTable.id })
  ).length;
  const ticketsEliminados = (
    await db.delete(ticketsTable).returning({ id: ticketsTable.id })
  ).length;

  // Reiniciar los contadores AUTOINCREMENT (la tabla sqlite_sequence puede
  // no existir si nunca hubo inserts — en ese caso no hay nada que reiniciar)
  try {
    sqlite.exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'seguimientos')",
    );
  } catch {
    // sin sqlite_sequence no hay contadores que reiniciar
  }

  broadcastEvent("datos_actualizados", {});

  res.json({
    tickets_eliminados: ticketsEliminados,
    seguimientos_eliminados: seguimientosEliminados,
  });
});

export default router;
