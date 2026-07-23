import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  ticketsTable,
  seguimientosTable,
  ticketVisibleCondition,
} from "@workspace/db";
import { eq, and, gte, lte, like, or, lt, not, inArray, asc, desc, count, sql, type SQL } from "drizzle-orm";
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
import { clasificarMotivo } from "@workspace/ingesta";
import {
  puedeCerrarTickets,
  requireAdminKey,
  requireSysAdmin,
  type SessionUser,
} from "../lib/auth";
import { broadcastEvent } from "../lib/events";

const router = Router();

// Estos campos modifican los datos administrativos/originales del ticket.
// Cuando alguno está presente, además de la sesión se exigen rol SysAdmin y
// ADMIN_API_KEY. Los campos operativos conservan el flujo normal por roles.
const ADMIN_TICKET_UPDATE_FIELDS = [
  "hora",
  "nombre",
  "apellido",
  "telefono",
  "dni",
  "empresa",
  "email",
  "motivo",
  "resumen",
  "notificado",
  "audio_url",
  "fecha_resolucion",
] as const;

const requireAdminTicketUpdate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const body = req.body;
  const hasAdminFields =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    ADMIN_TICKET_UPDATE_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(body, field),
    );

  if (!hasAdminFields) {
    next();
    return;
  }

  requireSysAdmin(req, res, () =>
    requireAdminKey(req, res, () => {
      res.locals.includeEmptyTickets = true;
      next();
    }),
  );
};

const parseBooleanQueryParam = (value: unknown): unknown => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

// Los registros sin ningún dato útil quedan en cuarentena administrativa.
// Incluirlos en el listado requiere tanto rol SysAdmin como ADMIN_API_KEY.
const requireAdminForEmptyTickets = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (parseBooleanQueryParam(req.query.incluir_vacios) !== true) {
    next();
    return;
  }

  requireSysAdmin(req, res, () => requireAdminKey(req, res, next));
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
router.get("/tickets", requireAdminForEmptyTickets, async (req, res) => {
  const parsed = ListTicketsQueryParams.safeParse({
    ...req.query,
    fecha_desde: parseLocalDateQueryParam(req.query.fecha_desde),
    fecha_hasta: parseLocalDateQueryParam(req.query.fecha_hasta, true),
    vencidos: parseBooleanQueryParam(req.query.vencidos),
    incluir_vacios: parseBooleanQueryParam(req.query.incluir_vacios),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { estado, prioridad, fecha_desde, fecha_hasta, hora_desde, hora_hasta, empresa, motivo, motivo_categoria, search, vencidos, incluir_vacios = false, order = "desc", page = 1, limit = 20 } = parsed.data;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: "Invalid pagination params" });
    return;
  }

  const conditions: SQL[] = [];

  if (!incluir_vacios) conditions.push(ticketVisibleCondition);

  if (estado) conditions.push(eq(ticketsTable.estado, estado as "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado"));
  if (prioridad) conditions.push(eq(ticketsTable.prioridad, prioridad as "baja" | "media" | "alta" | "urgente"));
  if (fecha_desde) conditions.push(gte(ticketsTable.fecha_creacion, fecha_desde));
  if (fecha_hasta) conditions.push(lte(ticketsTable.fecha_creacion, fecha_hasta));
  if (hora_desde) conditions.push(gte(ticketsTable.hora, hora_desde));
  if (hora_hasta) conditions.push(lte(ticketsTable.hora, hora_hasta));
  if (empresa) conditions.push(like(ticketsTable.empresa, `%${empresa}%`));
  if (motivo) conditions.push(like(ticketsTable.motivo, `%${motivo}%`));
  if (motivo_categoria) conditions.push(eq(ticketsTable.motivo_categoria, motivo_categoria));
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

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, parsed.data.id), ticketVisibleCondition));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const seguimientos = await db
    .select()
    .from(seguimientosTable)
    .where(eq(seguimientosTable.ticket_id, ticket.id))
    .orderBy(
      asc(seguimientosTable.fecha_creacion),
      asc(seguimientosTable.id),
    );

  res.json({ ...ticket, seguimientos });
});

// Update ticket
router.patch("/tickets/:id", requireAdminTicketUpdate, async (req, res) => {
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
  if (body.audio_url !== undefined) updates.audio_url = body.audio_url;
  if (body.notas !== undefined) updates.notas = body.notas;
  if (body.progreso !== undefined) updates.progreso = body.progreso;
  if (body.fecha_limite !== undefined) updates.fecha_limite = body.fecha_limite ? new Date(body.fecha_limite) : null;
  if (body.fecha_resolucion !== undefined) updates.fecha_resolucion = body.fecha_resolucion ? new Date(body.fecha_resolucion) : null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  // Una sola lectura alimenta la reclasificación, la detección de transición
  // de estado y la fecha automática de resolución.
  const ticketAccessCondition = res.locals.includeEmptyTickets
    ? eq(ticketsTable.id, paramsParsed.data.id)
    : and(eq(ticketsTable.id, paramsParsed.data.id), ticketVisibleCondition);

  const [current] = await db
    .select({
      estado: ticketsTable.estado,
      motivo: ticketsTable.motivo,
      resumen: ticketsTable.resumen,
      fecha_resolucion: ticketsTable.fecha_resolucion,
    })
    .from(ticketsTable)
    .where(ticketAccessCondition);
  if (!current) { res.status(404).json({ error: "Ticket not found" }); return; }

  // La categoría es siempre derivada. El motivo y el resumen originales se
  // conservan tal como llegaron y solo se usan como entrada del clasificador.
  if (body.motivo !== undefined || body.resumen !== undefined) {
    updates.motivo_categoria = clasificarMotivo(
      body.motivo ?? current.motivo,
      body.resumen !== undefined ? body.resumen : current.resumen,
    );
  }

  const authUser = res.locals.authUser as SessionUser | undefined;

  // Cerrar tickets es exclusivo de Administrador/SysAdmin — el Operador no puede
  if (updates.estado === "cerrado") {
    if (!puedeCerrarTickets(authUser?.rol)) {
      res.status(403).json({ error: "Solo un administrador puede cerrar tickets" });
      return;
    }
  }

  // Tomar un ticket ocurre al moverlo realmente de estado. Reenviar el mismo
  // estado (o editar cualquier otro campo) conserva la asignación existente.
  if (body.estado !== undefined && body.estado !== current.estado) {
    if (!authUser) {
      res.status(401).json({ error: "Sesión requerida" });
      return;
    }
    updates.asignado_usuario_id = authUser.id;
    updates.asignado_a = [authUser.nombre, authUser.apellido]
      .filter(Boolean)
      .join(" ");
  }

  // Al pasar a resuelto/cerrado se registra la fecha de resolución automáticamente
  // (si no vino explícita y el ticket aún no la tenía)
  if (
    (updates.estado === "resuelto" || updates.estado === "cerrado") &&
    body.fecha_resolucion === undefined
  ) {
    if (!current.fecha_resolucion) updates.fecha_resolucion = new Date();
  }

  const [updated] = await db
    .update(ticketsTable)
    .set(updates)
    .where(ticketAccessCondition)
    .returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }

  // Refresca en vivo las demás sesiones: si otro operador cambia el estado,
  // todos ven inmediatamente al nuevo responsable.
  broadcastEvent("ticket_actualizado", {
    ticket_id: updated.id,
    estado: updated.estado,
    asignado_usuario_id: updated.asignado_usuario_id,
    asignado_a: updated.asignado_a,
  });

  res.json(updated);
});

// Delete ticket
router.delete("/tickets/:id", requireSysAdmin, requireAdminKey, async (req, res) => {
  const parsed = DeleteTicketParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(ticketsTable).where(eq(ticketsTable.id, parsed.data.id));
  res.status(204).end();
});

// List seguimientos
router.get("/tickets/:id/seguimientos", async (req, res) => {
  const parsed = ListSeguimientosParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [ticket] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, parsed.data.id), ticketVisibleCondition));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const seguimientos = await db
    .select()
    .from(seguimientosTable)
    .where(eq(seguimientosTable.ticket_id, parsed.data.id))
    .orderBy(
      asc(seguimientosTable.fecha_creacion),
      asc(seguimientosTable.id),
    );
  res.json(seguimientos);
});

// Create seguimiento
router.post("/tickets/:id/seguimientos", async (req, res) => {
  const paramsParsed = CreateSeguimientoParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = CreateSeguimientoBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, paramsParsed.data.id), ticketVisibleCondition));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const body = bodyParsed.data;

  // El autor sale SIEMPRE de la sesión del usuario logueado — se ignora lo
  // que mande el cliente para que el historial no sea falsificable.
  const authUser = res.locals.authUser as { nombre: string; apellido: string | null } | undefined;
  const autor = authUser ? [authUser.nombre, authUser.apellido].filter(Boolean).join(" ") : null;

  const [seg] = await db.insert(seguimientosTable).values({
    ticket_id: paramsParsed.data.id,
    nota: body.nota,
    estado_anterior: body.estado_anterior ?? null,
    estado_nuevo: body.estado_nuevo ?? null,
    autor,
  }).returning();

  res.status(201).json(seg);
});

export default router;
