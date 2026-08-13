import type { Request, Response } from "express";
import { db, seguimientosTable, ticketsTable } from "@workspace/db";
import { GetTicketParams, GetTicketQueryParams } from "@workspace/api-zod";
import { asc, eq } from "drizzle-orm";
import { buildTicketAccessCondition } from "../data/access";
import { normalizeTicketQuery } from "./query-normalization";

export async function getTicketDetail(req: Request, res: Response) {
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
    .where(
      buildTicketAccessCondition(params.data.id, query.data.incluir_vacios),
    );
  if (!ticket) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  const seguimientos = await db
    .select()
    .from(seguimientosTable)
    .where(eq(seguimientosTable.ticket_id, ticket.id))
    .orderBy(asc(seguimientosTable.fecha_creacion), asc(seguimientosTable.id));

  res.json({ ...ticket, seguimientos });
}
