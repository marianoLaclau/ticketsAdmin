import type { Request, Response } from "express";
import { db, ticketVisibleCondition, ticketsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { ListTicketsQueryParams } from "@workspace/api-zod";
import { buildTicketWhere } from "../lib/ticket-query";
import { buildTicketOrderBy, parseTicketSortQuery } from "../lib/ticket-sort";
import { normalizeTicketQuery } from "../lib/ticket-query-normalization";

export async function listTickets(req: Request, res: Response): Promise<void> {
  const parsed = ListTicketsQueryParams.safeParse(
    normalizeTicketQuery(req.query),
  );
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
}
