import { Router } from "express";
import { db, ticketsTable, seguimientosTable } from "@workspace/db";
import { eq, and, gte, lte, like, or, lt, not, inArray, asc, desc, count, sql } from "drizzle-orm";
import {
  ListTicketsQueryParams,
  GetTicketParams,
  UpdateTicketParams,
  UpdateTicketBody,
  DeleteTicketParams,
  ListSeguimientosParams,
  CreateSeguimientoParams,
  CreateSeguimientoBody,
} from "@workspace/api-zod";

const router = Router();

const parseBooleanQueryParam = (value: unknown): unknown => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

const parseLocalDateQueryParam = (value: unknown, endOfDay = false): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return new Date(Number.NaN);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  date.setFullYear(year, month, day);

  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return new Date(Number.NaN);
  }

  return date;
};

// List tickets with filters
router.get("/tickets", async (req, res) => {
  const parsed = ListTicketsQueryParams.safeParse({
    ...req.query,
    fecha_desde: parseLocalDateQueryParam(req.query.fecha_desde),
    fecha_hasta: parseLocalDateQueryParam(req.query.fecha_hasta, true),
    vencidos: parseBooleanQueryParam(req.query.vencidos),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { estado, prioridad, fecha_desde, fecha_hasta, hora_desde, hora_hasta, empresa, motivo, search, vencidos, order = "desc", page = 1, limit = 20 } = parsed.data;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: "Invalid pagination params" });
    return;
  }

  const conditions: ReturnType<typeof eq>[] = [];

  if (estado) conditions.push(eq(ticketsTable.estado, estado as "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado"));
  if (prioridad) conditions.push(eq(ticketsTable.prioridad, prioridad as "baja" | "media" | "alta" | "urgente"));
  if (fecha_desde) conditions.push(gte(ticketsTable.fecha_creacion, fecha_desde));
  if (fecha_hasta) conditions.push(lte(ticketsTable.fecha_creacion, fecha_hasta));
  if (hora_desde) conditions.push(gte(ticketsTable.hora, hora_desde));
  if (hora_hasta) conditions.push(lte(ticketsTable.hora, hora_hasta));
  if (empresa) conditions.push(like(ticketsTable.empresa, `%${empresa}%`));
  if (motivo) conditions.push(like(ticketsTable.motivo, `%${motivo}%`));
  if (search) {
    conditions.push(
      or(
        like(ticketsTable.nombre, `%${search}%`),
        like(ticketsTable.apellido, `%${search}%`),
        like(ticketsTable.telefono, `%${search}%`),
        like(ticketsTable.dni, `%${search}%`),
        like(ticketsTable.email, `%${search}%`),
        like(ticketsTable.empresa, `%${search}%`),
        like(ticketsTable.motivo, `%${search}%`),
        like(ticketsTable.conversation_id, `%${search}%`),
      )!
    );
  }
  if (vencidos) {
    const now = new Date();
    conditions.push(
      and(
        lt(ticketsTable.fecha_limite, now),
        not(inArray(ticketsTable.estado, ["resuelto", "cerrado"]))
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  const sort = order === "asc" ? asc : desc;
  const creationDay = sql<string>`date(${ticketsTable.fecha_creacion} / 1000, 'unixepoch', 'localtime')`;
  const [tickets, [{ total }]] = await Promise.all([
    db.select()
      .from(ticketsTable)
      .where(where)
      .orderBy(sort(creationDay), sort(ticketsTable.hora), sort(ticketsTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ticketsTable).where(where),
  ]);

  res.json({ tickets, total, page, limit });
});

// Get ticket detail with seguimientos
router.get("/tickets/:id", async (req, res) => {
  const parsed = GetTicketParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, parsed.data.id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const seguimientos = await db.select().from(seguimientosTable).where(eq(seguimientosTable.ticket_id, ticket.id)).orderBy(seguimientosTable.fecha_creacion);

  res.json({ ...ticket, seguimientos });
});

// Update ticket
router.patch("/tickets/:id", async (req, res) => {
  const paramsParsed = UpdateTicketParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = UpdateTicketBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updates: Record<string, unknown> = {};
  const body = bodyParsed.data;
  if (body.hora !== undefined) updates.hora = body.hora;
  if (body.nombre !== undefined) updates.nombre = body.nombre;
  if (body.apellido !== undefined) updates.apellido = body.apellido;
  if (body.telefono !== undefined) updates.telefono = body.telefono;
  if (body.dni !== undefined) updates.dni = body.dni;
  if (body.empresa !== undefined) updates.empresa = body.empresa;
  if (body.email !== undefined) updates.email = body.email;
  if (body.motivo !== undefined) updates.motivo = body.motivo;
  if (body.resumen !== undefined) updates.resumen = body.resumen;
  if (body.notificado !== undefined) updates.notificado = body.notificado;
  if (body.estado !== undefined) updates.estado = body.estado;
  if (body.prioridad !== undefined) updates.prioridad = body.prioridad;
  if (body.asignado_a !== undefined) updates.asignado_a = body.asignado_a;
  if (body.audio_url !== undefined) updates.audio_url = body.audio_url;
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.progreso !== undefined) updates.progreso = body.progreso;
  if (body.fecha_limite !== undefined) updates.fecha_limite = body.fecha_limite ? new Date(body.fecha_limite) : null;
  if (body.fecha_resolucion !== undefined) updates.fecha_resolucion = body.fecha_resolucion ? new Date(body.fecha_resolucion) : null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  // Al pasar a resuelto/cerrado se registra la fecha de resolución automáticamente
  // (si no vino explícita y el ticket aún no la tenía)
  if (
    (updates.estado === "resuelto" || updates.estado === "cerrado") &&
    body.fecha_resolucion === undefined
  ) {
    const [current] = await db.select({ fecha_resolucion: ticketsTable.fecha_resolucion }).from(ticketsTable).where(eq(ticketsTable.id, paramsParsed.data.id));
    if (!current) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (!current.fecha_resolucion) updates.fecha_resolucion = new Date();
  }

  const [updated] = await db.update(ticketsTable).set(updates).where(eq(ticketsTable.id, paramsParsed.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }

  res.json(updated);
});

// Delete ticket
router.delete("/tickets/:id", async (req, res) => {
  const parsed = DeleteTicketParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(ticketsTable).where(eq(ticketsTable.id, parsed.data.id));
  res.status(204).end();
});

// List seguimientos
router.get("/tickets/:id/seguimientos", async (req, res) => {
  const parsed = ListSeguimientosParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const seguimientos = await db.select().from(seguimientosTable).where(eq(seguimientosTable.ticket_id, parsed.data.id)).orderBy(seguimientosTable.fecha_creacion);
  res.json(seguimientos);
});

// Create seguimiento
router.post("/tickets/:id/seguimientos", async (req, res) => {
  const paramsParsed = CreateSeguimientoParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = CreateSeguimientoBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, paramsParsed.data.id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const body = bodyParsed.data;
  const [seg] = await db.insert(seguimientosTable).values({
    ticket_id: paramsParsed.data.id,
    nota: body.nota,
    estado_anterior: body.estado_anterior ?? null,
    estado_nuevo: body.estado_nuevo ?? null,
    autor: body.autor ?? null,
  }).returning();

  res.status(201).json(seg);
});

export default router;
