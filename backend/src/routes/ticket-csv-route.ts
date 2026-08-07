import type { NextFunction, Request, Response } from "express";
import {
  db,
  sqlite,
  ticketVisibleCondition,
  ticketsTable,
} from "@workspace/db";
import { ExportTicketsCsvQueryParams } from "@workspace/api-zod";
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
import { normalizeTicketQuery } from "../lib/ticket-query-normalization";

const ticketCsvExportTimeoutMs = readTicketCsvExportTimeoutMs();

export async function exportTicketsCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
}
