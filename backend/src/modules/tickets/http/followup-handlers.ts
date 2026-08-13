import type { Request, Response } from "express";
import { db, seguimientosTable, ticketsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  CreateSeguimientoBody,
  CreateSeguimientoParams,
  CreateSeguimientoQueryParams,
  ListSeguimientosParams,
  ListSeguimientosQueryParams,
} from "@workspace/api-zod";
import type { SessionUser } from "../../../lib/auth";
import { buildTicketAccessCondition } from "../data/access";
import { formatTicketAuditAuthor } from "../application/audit";
import { normalizeTicketQuery } from "./query-normalization";
import { broadcastEvent } from "../../../lib/events";

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

export async function listTicketFollowups(
  req: Request,
  res: Response,
): Promise<void> {
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
      buildTicketAccessCondition(params.data.id, query.data.incluir_vacios),
    );
  if (!ticket) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  const followups = await db
    .select()
    .from(seguimientosTable)
    .where(eq(seguimientosTable.ticket_id, ticket.id))
    .orderBy(asc(seguimientosTable.fecha_creacion), asc(seguimientosTable.id));
  res.json(followups);
}

export async function createTicketFollowup(
  req: Request,
  res: Response,
): Promise<void> {
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
  const accessCondition = buildTicketAccessCondition(
    params.data.id,
    query.data.incluir_vacios,
  );

  const followup = db.transaction((tx) => {
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
        autor_usuario_id: authUser.id,
        autor,
      })
      .returning()
      .get();
  });

  if (!followup) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  broadcastEvent("ticket_actualizado", {
    ticket_id: params.data.id,
  });
  res.status(201).json(followup);
}
