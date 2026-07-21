import { Router, type Response } from "express";
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
import {
  MOTIVO_CATEGORIA_LABELS,
  type MotivoCategoria,
} from "@workspace/ingesta";
import {
  isDashboardDateRangeValid,
  normalizeDashboardDateQuery,
  type DashboardDateRange,
} from "../lib/dashboard-date-range";

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

// Dashboard statistics. The main cohort is filtered by ticket creation date.
router.get("/dashboard/stats", async (req, res) => {
  const parsed = GetDashboardStatsQueryParams.safeParse(
    normalizeDashboardDateQuery(req.query),
  );
  if (!parsed.success || !isDashboardDateRangeValid(parsed.data)) {
    invalidPeriod(res);
    return;
  }

  const range = parsed.data;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const createdInPeriod = dateRangeConditions(ticketsTable.fecha_creacion, range);

  const [allTickets, vencidosResult, resueltosHoy, nuevosHoy] =
    await Promise.all([
      db
        .select()
        .from(ticketsTable)
        .where(and(ticketVisibleCondition, ...createdInPeriod)),
      db
        .select({ id: ticketsTable.id })
        .from(ticketsTable)
        .where(
          and(
            ticketVisibleCondition,
            ...createdInPeriod,
            lt(ticketsTable.fecha_limite, now),
            not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])),
          ),
        ),
      db
        .select({ id: ticketsTable.id })
        .from(ticketsTable)
        .where(
          and(
            ticketVisibleCondition,
            gte(ticketsTable.fecha_resolucion, todayStart),
            lt(ticketsTable.fecha_resolucion, todayEnd),
          ),
        ),
      db
        .select({ id: ticketsTable.id })
        .from(ticketsTable)
        .where(
          and(
            ticketVisibleCondition,
            gte(ticketsTable.fecha_creacion, todayStart),
            lt(ticketsTable.fecha_creacion, todayEnd),
          ),
        ),
    ]);

  const estadoCounts: Record<string, number> = {};
  const prioridadCounts: Record<string, number> = {};
  let totalResolutionMs = 0;
  let resolvedCount = 0;
  let finalizadosPeriodo = 0;

  for (const ticket of allTickets) {
    estadoCounts[ticket.estado] = (estadoCounts[ticket.estado] || 0) + 1;
    prioridadCounts[ticket.prioridad] =
      (prioridadCounts[ticket.prioridad] || 0) + 1;
    if (ticket.estado === "resuelto" || ticket.estado === "cerrado") {
      finalizadosPeriodo++;
    }
    if (ticket.fecha_resolucion && ticket.fecha_creacion) {
      totalResolutionMs +=
        ticket.fecha_resolucion.getTime() - ticket.fecha_creacion.getTime();
      resolvedCount++;
    }
  }

  const por_estado = Object.entries(estadoCounts).map(([estado, cantidad]) => ({
    estado,
    cantidad,
  }));
  const por_prioridad = Object.entries(prioridadCounts).map(
    ([prioridad, cantidad]) => ({ prioridad, cantidad }),
  );
  const tiempoPromedio =
    resolvedCount > 0
      ? totalResolutionMs / resolvedCount / 3_600_000
      : null;

  res.json({
    total: allTickets.length,
    por_estado,
    por_prioridad,
    vencidos: vencidosResult.length,
    resueltos_hoy: resueltosHoy.length,
    nuevos_hoy: nuevosHoy.length,
    resueltos_periodo: finalizadosPeriodo,
    nuevos_periodo: allTickets.length,
    tiempo_promedio_resolucion: tiempoPromedio,
  });
});

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

  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        ticketVisibleCondition,
        ...dateRangeConditions(ticketsTable.fecha_creacion, parsed.data),
      ),
    );
  const motivoCounts = new Map<MotivoCategoria, number>();
  for (const ticket of tickets) {
    motivoCounts.set(
      ticket.motivo_categoria,
      (motivoCounts.get(ticket.motivo_categoria) ?? 0) + 1,
    );
  }
  const result = [...motivoCounts.entries()]
    .map(([categoria, cantidad]) => ({
      categoria,
      motivo: MOTIVO_CATEGORIA_LABELS[categoria],
      cantidad,
    }))
    .sort((left, right) => right.cantidad - left.cantidad);
  res.json(result);
});

export default router;
