import { Router } from "express";
import { db, ticketsTable, seguimientosTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or, lt, isNull, not, inArray } from "drizzle-orm";
import {
  ListTicketsQueryParams,
  CreateTicketBody,
  GetTicketParams,
  UpdateTicketParams,
  UpdateTicketBody,
  DeleteTicketParams,
  ListSeguimientosParams,
  CreateSeguimientoParams,
  CreateSeguimientoBody,
} from "@workspace/api-zod";

const router = Router();

// List tickets with filters
router.get("/tickets", async (req, res) => {
  const parsed = ListTicketsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { estado, prioridad, fecha_desde, fecha_hasta, hora_desde, hora_hasta, empresa, motivo, search, vencidos, page = 1, limit = 20 } = parsed.data;

  const conditions: ReturnType<typeof eq>[] = [];

  if (estado) conditions.push(eq(ticketsTable.estado, estado as "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado"));
  if (prioridad) conditions.push(eq(ticketsTable.prioridad, prioridad as "baja" | "media" | "alta" | "urgente"));
  if (fecha_desde) conditions.push(gte(ticketsTable.fecha_creacion, new Date(fecha_desde)));
  if (fecha_hasta) {
    const end = new Date(fecha_hasta);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(ticketsTable.fecha_creacion, end));
  }
  if (empresa) conditions.push(ilike(ticketsTable.empresa, `%${empresa}%`));
  if (motivo) conditions.push(ilike(ticketsTable.motivo, `%${motivo}%`));
  if (search) {
    conditions.push(
      or(
        ilike(ticketsTable.nombre, `%${search}%`),
        ilike(ticketsTable.apellido, `%${search}%`),
        ilike(ticketsTable.telefono, `%${search}%`),
        ilike(ticketsTable.dni, `%${search}%`),
        ilike(ticketsTable.email, `%${search}%`),
        ilike(ticketsTable.empresa, `%${search}%`),
        ilike(ticketsTable.motivo, `%${search}%`),
        ilike(ticketsTable.conversation_id, `%${search}%`),
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

  const [tickets, countResult] = await Promise.all([
    db.select().from(ticketsTable).where(where).orderBy(ticketsTable.fecha_creacion).limit(limit).offset(offset),
    db.select({ id: ticketsTable.id }).from(ticketsTable).where(where),
  ]);

  res.json({ tickets, total: countResult.length, page, limit });
});

// Create ticket
router.post("/tickets", async (req, res) => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [ticket] = await db.insert(ticketsTable).values({
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
    estado: (data.estado as "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado") ?? "nuevo",
    prioridad: (data.prioridad as "baja" | "media" | "alta" | "urgente") ?? "media",
    asignado_a: data.asignado_a ?? null,
    audio_url: data.audio_url ?? null,
    notas: data.notas ?? null,
    fecha_limite: data.fecha_limite ? new Date(data.fecha_limite) : null,
    progreso: data.progreso ?? 0,
  }).returning();
  res.status(201).json(ticket);
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
