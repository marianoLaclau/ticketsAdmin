import { Router, type NextFunction, type Request, type Response } from "express";
import {
  db,
  seguimientosTable,
  sqlite,
  ticketVisibleCondition,
  ticketsTable,
  type Ticket,
} from "@workspace/db";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import {
  CreateSeguimientoBody,
  CreateSeguimientoParams,
  CreateSeguimientoQueryParams,
  DeleteTicketParams,
  ExportTicketsCsvQueryParams,
  GetTicketParams,
  GetTicketQueryParams,
  ListSeguimientosParams,
  ListSeguimientosQueryParams,
  ListTicketsQueryParams,
  UpdateTicketBody,
  UpdateTicketParams,
  UpdateTicketQueryParams,
} from "@workspace/api-zod";
import { clasificarMotivo } from "@workspace/ingesta";
import {
  puedeCerrarTickets,
  requireAdminKey,
  requireSysAdmin,
  type SessionUser,
} from "../lib/auth";
import { createTicketCsvFilename } from "../lib/ticket-csv";
import {
  createTicketCsvExportDeadline,
  isTicketCsvClientDisconnect,
  pipeTicketCsvStream,
  prepareTicketCsvStream,
  readTicketCsvExportTimeoutMs,
  type TicketCsvExportDeadline,
  type PreparedTicketCsvStream,
} from "../lib/ticket-csv-stream";
import {
  buildTicketOrderBy,
  buildTicketWhere,
  parseTicketSortQuery,
} from "../lib/ticket-query";
import {
  buildTicketAuditNote,
  formatTicketAuditAuthor,
  getTicketAuditEditedFields,
} from "../lib/ticket-audit";
import { broadcastEvent } from "../lib/events";
import { findInvalidRfc3339DateTimeField } from "../lib/rfc3339";

const router = Router();
const ticketCsvExportTimeoutMs = readTicketCsvExportTimeoutMs();

const TECHNICAL_TICKET_UPDATE_FIELDS = [
  "hora",
  "notificado",
  "audio_url",
  "fecha_resolucion",
  "fecha_limite",
] as const;

const TICKET_UPDATE_FIELDS = [
  "expected_version",
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
  "estado",
  "prioridad",
  "audio_url",
  "notas",
  "fecha_limite",
  "fecha_resolucion",
  "progreso",
] as const;

const TICKET_UPDATE_DATE_FIELDS = [
  "fecha_limite",
  "fecha_resolucion",
] as const;

const OPTIONAL_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type TicketUpdates = Partial<typeof ticketsTable.$inferInsert>;

type PatchTransactionResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | {
      kind: "conflict";
      ticketId: number;
      expectedVersion: number;
      currentVersion: number;
    }
  | { kind: "unchanged"; ticket: Ticket }
  | { kind: "updated"; ticket: Ticket };

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyBodyFields(
  value: unknown,
  allowed: readonly string[],
): value is Record<string, unknown> {
  return (
    isObjectBody(value) &&
    Object.keys(value).every((field) => allowed.includes(field))
  );
}

function hasOwn(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function hasInvalidTicketUpdateEmail(body: Record<string, unknown>): boolean {
  if (!hasOwn(body, "email") || body.email === null) return false;
  if (typeof body.email !== "string") return true;

  const email = body.email.trim();
  return email.length > 254 || (email.length > 0 && !OPTIONAL_EMAIL_PATTERN.test(email));
}

function requireTechnicalTicketUpdate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const body = req.body;
  const hasTechnicalFields =
    isObjectBody(body) &&
    TECHNICAL_TICKET_UPDATE_FIELDS.some((field) => hasOwn(body, field));

  if (!hasTechnicalFields) {
    next();
    return;
  }

  requireSysAdmin(req, res, () => requireAdminKey(req, res, next));
}

function parseBooleanQueryParam(value: unknown): unknown {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

// `incluir_vacios` nunca amplía alcance por sí solo. El acceso administrativo
// requiere simultáneamente sesión SysAdmin y la segunda llave del panel.
function requireAdminForEmptyTickets(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (parseBooleanQueryParam(req.query.incluir_vacios) !== true) {
    next();
    return;
  }

  requireSysAdmin(req, res, () => requireAdminKey(req, res, next));
}

function parseLocalDateQueryParam(value: unknown, endOfDay = false): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return new Date(Number.NaN);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  date.setFullYear(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

function normalizeTicketQuery(query: Request["query"]): Record<string, unknown> {
  return {
    ...query,
    fecha_desde: parseLocalDateQueryParam(query.fecha_desde),
    fecha_hasta: parseLocalDateQueryParam(query.fecha_hasta, true),
    vencidos: parseBooleanQueryParam(query.vencidos),
    incluir_vacios: parseBooleanQueryParam(query.incluir_vacios),
  };
}

function ticketAccessCondition(id: number, includeEmpty: boolean): SQL {
  return includeEmpty
    ? eq(ticketsTable.id, id)
    : and(eq(ticketsTable.id, id), ticketVisibleCondition)!;
}

function normalizeRequiredText(value: string): string {
  return value.trim();
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) return null;
  return value.trim() || null;
}

function sameStoredValue(current: unknown, next: unknown): boolean {
  if (current instanceof Date && next instanceof Date) {
    return current.getTime() === next.getTime();
  }
  return current === next;
}

// Listado operativo/administrativo: los filtros y el orden se aplican antes
// de la paginación y comparten exactamente la misma semántica con el CSV.
router.get("/tickets", requireAdminForEmptyTickets, async (req, res) => {
  const parsed = ListTicketsQueryParams.safeParse(normalizeTicketQuery(req.query));
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros de consulta inválidos" });
    return;
  }

  const {
    incluir_vacios: includeEmpty = false,
    sort_by: requestedSortBy,
    order: requestedOrder,
    sort: requestedSort,
    page = 1,
    limit = 20,
  } = parsed.data;
  if (!Number.isInteger(page) || !Number.isInteger(limit)) {
    res.status(400).json({ error: "La paginación debe usar números enteros" });
    return;
  }

  const where = buildTicketWhere(
    parsed.data,
    includeEmpty ? [] : [ticketVisibleCondition],
    { now: new Date() },
  );
  const sortResult = parseTicketSortQuery(
    requestedSort,
    requestedSortBy,
    requestedOrder,
  );
  if (!sortResult.ok) {
    res.status(400).json({ error: "Parámetros de ordenamiento inválidos" });
    return;
  }
  const offset = (page - 1) * limit;

  const [tickets, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ticketsTable)
      .where(where)
      .orderBy(...buildTicketOrderBy(sortResult.criteria))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ticketsTable).where(where),
  ]);

  res.json({ tickets, total, page, limit });
});

// Debe declararse antes de `/:id` para que Express no interprete export.csv
// como un identificador de ticket.
router.get("/tickets/export.csv", async (req, res, next) => {
  let prepared: PreparedTicketCsvStream | undefined;
  let deadline: TicketCsvExportDeadline | undefined;

  const parsed = ExportTicketsCsvQueryParams.safeParse(
    normalizeTicketQuery(req.query),
  );
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros de exportación inválidos" });
    return;
  }

  const {
    sort_by: requestedSortBy,
    order: requestedOrder,
    sort: requestedSort,
  } = parsed.data;
  const sortResult = parseTicketSortQuery(
    requestedSort,
    requestedSortBy,
    requestedOrder,
  );
  if (!sortResult.ok) {
    res.status(400).json({ error: "Parámetros de ordenamiento inválidos" });
    return;
  }
  const where = buildTicketWhere(parsed.data, [ticketVisibleCondition], {
    now: new Date(),
  });
  const query = db
    .select()
    .from(ticketsTable)
    .where(where)
    .orderBy(...buildTicketOrderBy(sortResult.criteria));

  try {
    deadline = createTicketCsvExportDeadline({
      timeoutMs: ticketCsvExportTimeoutMs,
    });
    // `toSQL()` conserva exactamente el WHERE y ORDER BY compartidos con el
    // listado. Better-sqlite3 aporta el cursor incremental que Drizzle no
    // expone para su driver sincronico.
    prepared = prepareTicketCsvStream(sqlite, query.toSQL());
    const filename = createTicketCsvFilename();
    res.status(200).set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    await pipeTicketCsvStream(prepared, res, { signal: deadline.signal });
  } catch (error) {
    if (req.aborted || isTicketCsvClientDisconnect(error)) return;

    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    next(error);
  } finally {
    try {
      deadline?.dispose();
    } finally {
      prepared?.close();
    }
  }
});

router.get("/tickets/:id", requireAdminForEmptyTickets, async (req, res) => {
  const params = GetTicketParams.safeParse({ id: req.params.id });
  const query = GetTicketQueryParams.safeParse(normalizeTicketQuery(req.query));
  if (!params.success || !Number.isInteger(params.data.id)) {
    res.status(400).json({ error: "Identificador de ticket inválido" });
    return;
  }
  if (!query.success) {
    res.status(400).json({ error: "Parámetros de consulta inválidos" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(ticketAccessCondition(params.data.id, query.data.incluir_vacios));
  if (!ticket) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

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

router.patch(
  "/tickets/:id",
  requireAdminForEmptyTickets,
  requireTechnicalTicketUpdate,
  async (req, res) => {
    const params = UpdateTicketParams.safeParse({ id: req.params.id });
    const query = UpdateTicketQueryParams.safeParse(normalizeTicketQuery(req.query));
    if (!params.success || !Number.isInteger(params.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: "Parámetros de consulta inválidos" });
      return;
    }
    if (!hasOnlyBodyFields(req.body, TICKET_UPDATE_FIELDS)) {
      res.status(400).json({ error: "El cuerpo contiene campos no permitidos" });
      return;
    }

    const invalidDateField = findInvalidRfc3339DateTimeField(
      req.body,
      TICKET_UPDATE_DATE_FIELDS,
    );
    if (invalidDateField) {
      res.status(400).json({
        error: `El campo ${invalidDateField} debe ser una fecha RFC3339 válida con zona horaria`,
      });
      return;
    }

    if (hasInvalidTicketUpdateEmail(req.body)) {
      res.status(400).json({ error: "El email no tiene un formato válido" });
      return;
    }

    const bodyForParsing = typeof req.body.email === "string"
      ? { ...req.body, email: req.body.email.trim() || null }
      : req.body;
    const bodyParsed = UpdateTicketBody.safeParse(bodyForParsing);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Datos de actualización inválidos" });
      return;
    }
    if (
      Object.keys(req.body).every((field) => field === "expected_version")
    ) {
      res.status(400).json({ error: "Indicá al menos un campo para actualizar" });
      return;
    }
    if (!Number.isSafeInteger(bodyParsed.data.expected_version)) {
      res
        .status(400)
        .json({ error: "La versión esperada debe ser un entero válido" });
      return;
    }
    if (
      bodyParsed.data.progreso !== undefined &&
      !Number.isInteger(bodyParsed.data.progreso)
    ) {
      res.status(400).json({ error: "El progreso debe ser un número entero" });
      return;
    }

    const authUser = res.locals.authUser as SessionUser;
    const autor = formatTicketAuditAuthor(authUser);
    const now = new Date();
    const accessCondition = ticketAccessCondition(
      params.data.id,
      query.data.incluir_vacios,
    );

    const result = db.transaction((tx): PatchTransactionResult => {
      const current = tx
        .select()
        .from(ticketsTable)
        .where(accessCondition)
        .get();
      if (!current) return { kind: "not_found" };

      const body = bodyParsed.data;
      if (
        body.estado === "cerrado" &&
        body.estado !== current.estado &&
        !puedeCerrarTickets(authUser.rol)
      ) {
        return { kind: "forbidden" };
      }
      if (body.expected_version !== current.version) {
        return {
          kind: "conflict",
          ticketId: current.id,
          expectedVersion: body.expected_version,
          currentVersion: current.version,
        };
      }

      const requested: TicketUpdates = {};
      if (body.hora !== undefined) requested.hora = normalizeRequiredText(body.hora);
      if (body.nombre !== undefined) requested.nombre = normalizeRequiredText(body.nombre);
      if (body.apellido !== undefined) requested.apellido = normalizeRequiredText(body.apellido);
      if (body.telefono !== undefined) requested.telefono = normalizeNullableText(body.telefono);
      if (body.dni !== undefined) requested.dni = normalizeNullableText(body.dni);
      if (body.empresa !== undefined) requested.empresa = normalizeNullableText(body.empresa);
      if (body.email !== undefined) requested.email = normalizeNullableText(body.email);
      if (body.motivo !== undefined) requested.motivo = normalizeRequiredText(body.motivo);
      if (body.resumen !== undefined) requested.resumen = normalizeNullableText(body.resumen);
      if (body.notificado !== undefined) requested.notificado = body.notificado;
      if (body.estado !== undefined) requested.estado = body.estado;
      if (body.prioridad !== undefined) requested.prioridad = body.prioridad;
      if (body.audio_url !== undefined) requested.audio_url = normalizeNullableText(body.audio_url);
      if (body.notas !== undefined) {
        requested.notas = normalizeNullableText(body.notas);
      }
      if (body.progreso !== undefined) requested.progreso = body.progreso;
      if (body.fecha_limite !== undefined) {
        requested.fecha_limite = new Date(body.fecha_limite.getTime());
      }
      if (body.fecha_resolucion !== undefined) {
        requested.fecha_resolucion = new Date(body.fecha_resolucion.getTime());
      }

      // El estado laboral proviene de la consulta a Serin para un DNI y una
      // empresa concretos. Si una persona corrige cualquiera de esos datos,
      // el valor anterior deja de ser confiable y debe volver a obtenerse.
      const cambiaIdentidadSerin =
        (body.dni !== undefined &&
          !sameStoredValue(current.dni, requested.dni)) ||
        (body.empresa !== undefined &&
          !sameStoredValue(current.empresa, requested.empresa));
      if (cambiaIdentidadSerin) {
        requested.estado_empleado = null;
      }

      if (body.motivo !== undefined || body.resumen !== undefined) {
        requested.motivo_categoria = clasificarMotivo(
          requested.motivo ?? current.motivo,
          body.resumen !== undefined ? requested.resumen : current.resumen,
        );
      }

      // Una transición real toma o reasigna el ticket al usuario autenticado.
      if (body.estado !== undefined && body.estado !== current.estado) {
        requested.asignado_usuario_id = authUser.id;
        requested.asignado_a = autor;
      }

      if (body.estado !== undefined && body.estado !== current.estado && body.fecha_resolucion === undefined) {
        const estadoAnteriorFinalizado = current.estado === "resuelto" || current.estado === "cerrado";
        const estadoNuevoFinalizado = body.estado === "resuelto" || body.estado === "cerrado";

        if (estadoNuevoFinalizado && !estadoAnteriorFinalizado) {
          // Cada resolución real debe reflejar su propio instante, incluso si
          // una fila histórica conservaba una fecha de una resolución previa.
          requested.fecha_resolucion = now;
        } else if (!estadoNuevoFinalizado && estadoAnteriorFinalizado) {
          // Al reabrir el caso deja de estar resuelto; la próxima resolución
          // establecerá una fecha nueva.
          requested.fecha_resolucion = null;
        }
      }

      const actualUpdates: TicketUpdates = {};
      const changedFields: string[] = [];
      const currentRecord = current as unknown as Record<string, unknown>;
      for (const [field, value] of Object.entries(requested)) {
        if (sameStoredValue(currentRecord[field], value)) continue;
        (actualUpdates as Record<string, unknown>)[field] = value;
        changedFields.push(field);
      }

      if (changedFields.length === 0) {
        return { kind: "unchanged", ticket: current };
      }

      const updated = tx
        .update(ticketsTable)
        .set({ ...actualUpdates, version: current.version + 1 })
        .where(
          and(
            accessCondition,
            eq(ticketsTable.version, body.expected_version),
          ),
        )
        .returning()
        .get();
      if (!updated) {
        return {
          kind: "conflict",
          ticketId: current.id,
          expectedVersion: body.expected_version,
          currentVersion: current.version,
        };
      }

      const stateChanged = current.estado !== updated.estado;
      const priorityChanged = current.prioridad !== updated.prioridad;
      const assignmentChanged =
        current.asignado_usuario_id !== updated.asignado_usuario_id ||
        current.asignado_a !== updated.asignado_a;
      const editedFields = getTicketAuditEditedFields(changedFields);

      tx.insert(seguimientosTable)
        .values({
          ticket_id: current.id,
          nota: buildTicketAuditNote(current, updated, changedFields),
          estado_anterior: stateChanged ? current.estado : null,
          estado_nuevo: stateChanged ? updated.estado : null,
          prioridad_anterior: priorityChanged ? current.prioridad : null,
          prioridad_nueva: priorityChanged ? updated.prioridad : null,
          asignado_anterior_usuario_id: assignmentChanged
            ? current.asignado_usuario_id
            : null,
          asignado_anterior: assignmentChanged ? current.asignado_a : null,
          asignado_nuevo_usuario_id: assignmentChanged
            ? updated.asignado_usuario_id
            : null,
          asignado_nuevo: assignmentChanged ? updated.asignado_a : null,
          campos_editados: editedFields.length > 0 ? editedFields : null,
          autor,
          fecha_creacion: now,
        })
        .run();

      return { kind: "updated", ticket: updated };
    }, { behavior: "immediate" });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }
    if (result.kind === "forbidden") {
      res.status(403).json({ error: "Solo un administrador puede cerrar tickets" });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({
        code: "TICKET_VERSION_CONFLICT",
        error: "El ticket cambió desde que fue consultado",
        ticket_id: result.ticketId,
        expected_version: result.expectedVersion,
        current_version: result.currentVersion,
      });
      return;
    }
    if (result.kind === "unchanged") {
      res.json(result.ticket);
      return;
    }

    // El evento se emite una vez confirmada la transacción. Las demás sesiones
    // refrescan ticket, tabla, dashboard e historial sin observar estados parciales.
    broadcastEvent("ticket_actualizado", {
      ticket_id: result.ticket.id,
      estado: result.ticket.estado,
      prioridad: result.ticket.prioridad,
      version: result.ticket.version,
      asignado_usuario_id: result.ticket.asignado_usuario_id,
      asignado_a: result.ticket.asignado_a,
    });

    res.json(result.ticket);
  },
);

router.delete(
  "/tickets/:id",
  requireSysAdmin,
  requireAdminKey,
  async (req, res) => {
    const parsed = DeleteTicketParams.safeParse({ id: req.params.id });
    if (!parsed.success || !Number.isInteger(parsed.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }

    await db.delete(ticketsTable).where(eq(ticketsTable.id, parsed.data.id));
    res.status(204).end();
  },
);

router.get(
  "/tickets/:id/seguimientos",
  requireAdminForEmptyTickets,
  async (req, res) => {
    const params = ListSeguimientosParams.safeParse({ id: req.params.id });
    const query = ListSeguimientosQueryParams.safeParse(
      normalizeTicketQuery(req.query),
    );
    if (!params.success || !Number.isInteger(params.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: "Parámetros de consulta inválidos" });
      return;
    }

    const [ticket] = await db
      .select({ id: ticketsTable.id })
      .from(ticketsTable)
      .where(
        ticketAccessCondition(params.data.id, query.data.incluir_vacios),
      );
    if (!ticket) {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }

    const seguimientos = await db
      .select()
      .from(seguimientosTable)
      .where(eq(seguimientosTable.ticket_id, ticket.id))
      .orderBy(
        asc(seguimientosTable.fecha_creacion),
        asc(seguimientosTable.id),
      );
    res.json(seguimientos);
  },
);

router.post(
  "/tickets/:id/seguimientos",
  requireAdminForEmptyTickets,
  async (req, res) => {
    const params = CreateSeguimientoParams.safeParse({ id: req.params.id });
    const query = CreateSeguimientoQueryParams.safeParse(
      normalizeTicketQuery(req.query),
    );
    if (!params.success || !Number.isInteger(params.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: "Parámetros de consulta inválidos" });
      return;
    }
    if (!hasOnlyBodyFields(req.body, ["nota"])) {
      res.status(400).json({ error: "El seguimiento solo admite el campo nota" });
      return;
    }

    const body = CreateSeguimientoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Datos del seguimiento inválidos" });
      return;
    }
    const nota = body.data.nota.trim();
    if (!nota) {
      res.status(400).json({ error: "La nota del seguimiento es obligatoria" });
      return;
    }

    const authUser = res.locals.authUser as SessionUser;
    const autor = formatTicketAuditAuthor(authUser);
    const accessCondition = ticketAccessCondition(
      params.data.id,
      query.data.incluir_vacios,
    );

    const seguimiento = db.transaction((tx) => {
      const ticket = tx
        .select({ id: ticketsTable.id })
        .from(ticketsTable)
        .where(accessCondition)
        .get();
      if (!ticket) return null;

      return tx
        .insert(seguimientosTable)
        .values({
          ticket_id: ticket.id,
          nota,
          autor,
        })
        .returning()
        .get();
    });

    if (!seguimiento) {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }

    broadcastEvent("ticket_actualizado", {
      ticket_id: params.data.id,
    });
    res.status(201).json(seguimiento);
  },
);

export default router;
