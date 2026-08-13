import { Router, type RequestHandler, type Response } from "express";
import {
  db,
  ticketsTable,
  seguimientosTable,
  ticketVisibleCondition,
} from "@workspace/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  not,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import {
  GetActividadRecienteQueryParams,
  GetDashboardStatsQueryParams,
  GetMotivoStatsQueryParams,
  GetTicketsVencidosQueryParams,
} from "@workspace/api-zod";
import { SERIN_SEGUIMIENTO_NOTA } from "@workspace/ingesta";
import {
  isDashboardDateRangeValid,
  normalizeDashboardDateQuery,
  type DashboardDateRange,
} from "../application/date-range";
import {
  consultarDashboardStats,
  consultarMotivosDashboard,
} from "../data/queries";

const router = Router();

const invalidPeriod = (res: Response) => {
  res.status(400).json({
    error: "El periodo indicado no es valido. Revisá las fechas desde y hasta.",
  });
};

function dateRangeConditions(
  column: AnyColumn,
  range: DashboardDateRange,
): SQL[] {
  const conditions: SQL[] = [];
  if (range.fecha_desde) conditions.push(gte(column, range.fecha_desde));
  if (range.fecha_hasta) conditions.push(lte(column, range.fecha_hasta));
  return conditions;
}

type DashboardStatsHandlerOptions = {
  now?: () => Date;
};

/** Permite fijar el reloj en pruebas sin alterar el reloj global del proceso. */
export function crearDashboardStatsHandler({
  now = () => new Date(),
}: DashboardStatsHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    const parsed = GetDashboardStatsQueryParams.safeParse(
      normalizeDashboardDateQuery(req.query),
    );
    if (!parsed.success || !isDashboardDateRangeValid(parsed.data)) {
      invalidPeriod(res);
      return;
    }

    res.json(consultarDashboardStats(db, parsed.data, now()));
  };
}

// Dashboard statistics. The main cohort is filtered by ticket creation date.
router.get("/dashboard/stats", crearDashboardStatsHandler());

// Recent activity is filtered by the actual date of each event.
router.get("/dashboard/actividad-reciente", async (req, res) => {
  const parsed = GetActividadRecienteQueryParams.safeParse(
    normalizeDashboardDateQuery(req.query),
  );
  if (!parsed.success || !isDashboardDateRangeValid(parsed.data)) {
    invalidPeriod(res);
    return;
  }

  const { limit = 10, ...range } = parsed.data;
  const recentTickets = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        ticketVisibleCondition,
        ...dateRangeConditions(ticketsTable.fecha_creacion, range),
      ),
    )
    .orderBy(desc(ticketsTable.fecha_creacion))
    .limit(limit);
  const recentSeguimientos = await db
    .select({
      seg: seguimientosTable,
      ticket: { nombre: ticketsTable.nombre, apellido: ticketsTable.apellido },
    })
    .from(seguimientosTable)
    .innerJoin(
      ticketsTable,
      and(
        eq(seguimientosTable.ticket_id, ticketsTable.id),
        ticketVisibleCondition,
      ),
    )
    .where(
      and(
        not(eq(seguimientosTable.nota, SERIN_SEGUIMIENTO_NOTA)),
        ...dateRangeConditions(seguimientosTable.fecha_creacion, range),
      ),
    )
    .orderBy(desc(seguimientosTable.fecha_creacion))
    .limit(limit);

  const activity = [
    ...recentTickets.map((ticket) => ({
      tipo: "ticket_creado",
      ticket_id: ticket.id,
      nombre_contacto: `${ticket.nombre} ${ticket.apellido}`,
      descripcion: `Nuevo ticket: ${ticket.motivo}`,
      fecha: ticket.fecha_creacion.toISOString(),
    })),
    ...recentSeguimientos.map((row) => ({
      tipo: "seguimiento_agregado",
      ticket_id: row.seg.ticket_id,
      nombre_contacto: row.ticket
        ? `${row.ticket.nombre} ${row.ticket.apellido}`
        : "Desconocido",
      descripcion: row.seg.nota.substring(0, 100),
      fecha: row.seg.fecha_creacion.toISOString(),
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.fecha).getTime() - new Date(left.fecha).getTime(),
    )
    .slice(0, limit);

  res.json(activity);
});

// Overdue tickets in the selected creation cohort.
router.get("/dashboard/tickets-vencidos", async (req, res) => {
  const parsed = GetTicketsVencidosQueryParams.safeParse(
    normalizeDashboardDateQuery(req.query),
  );
  if (!parsed.success || !isDashboardDateRangeValid(parsed.data)) {
    invalidPeriod(res);
    return;
  }

  const now = new Date();
  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        ticketVisibleCondition,
        ...dateRangeConditions(ticketsTable.fecha_creacion, parsed.data),
        lt(ticketsTable.fecha_limite, now),
        not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])),
      ),
    )
    .orderBy(asc(ticketsTable.fecha_limite))
    .limit(20);
  res.json(tickets);
});

// Statistics by derived category. The original reason is never modified.
router.get("/dashboard/motivos", async (req, res) => {
  const parsed = GetMotivoStatsQueryParams.safeParse(
    normalizeDashboardDateQuery(req.query),
  );
  if (!parsed.success || !isDashboardDateRangeValid(parsed.data)) {
    invalidPeriod(res);
    return;
  }

  res.json(consultarMotivosDashboard(db, parsed.data));
});

export default router;
