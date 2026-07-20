import { Router } from "express";
import {
  db,
  ticketsTable,
  seguimientosTable,
  ticketVisibleCondition,
} from "@workspace/db";
import { eq, lt, not, inArray, gte, and, desc, asc } from "drizzle-orm";
import { GetActividadRecienteQueryParams } from "@workspace/api-zod";
import {
  MOTIVO_CATEGORIA_LABELS,
  type MotivoCategoria,
} from "@workspace/ingesta";

const router = Router();

// Dashboard statistics
router.get("/dashboard/stats", async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [allTickets, vencidosResult, resueltosHoy, nuevosHoy] = await Promise.all([
    db.select().from(ticketsTable).where(ticketVisibleCondition),
    db.select({ id: ticketsTable.id }).from(ticketsTable).where(
      and(ticketVisibleCondition, lt(ticketsTable.fecha_limite, now), not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])))
    ),
    db.select({ id: ticketsTable.id }).from(ticketsTable).where(
      and(ticketVisibleCondition, gte(ticketsTable.fecha_resolucion, todayStart), lt(ticketsTable.fecha_resolucion, todayEnd))
    ),
    db.select({ id: ticketsTable.id }).from(ticketsTable).where(
      and(ticketVisibleCondition, gte(ticketsTable.fecha_creacion, todayStart), lt(ticketsTable.fecha_creacion, todayEnd))
    ),
  ]);

  const estadoCounts: Record<string, number> = {};
  const prioridadCounts: Record<string, number> = {};
  let totalResolutionMs = 0;
  let resolvedCount = 0;

  for (const t of allTickets) {
    estadoCounts[t.estado] = (estadoCounts[t.estado] || 0) + 1;
    prioridadCounts[t.prioridad] = (prioridadCounts[t.prioridad] || 0) + 1;
    if (t.fecha_resolucion && t.fecha_creacion) {
      totalResolutionMs += t.fecha_resolucion.getTime() - t.fecha_creacion.getTime();
      resolvedCount++;
    }
  }

  const por_estado = Object.entries(estadoCounts).map(([estado, cantidad]) => ({ estado, cantidad }));
  const por_prioridad = Object.entries(prioridadCounts).map(([prioridad, cantidad]) => ({ prioridad, cantidad }));
  const tiempoPromedio = resolvedCount > 0 ? totalResolutionMs / resolvedCount / 3600000 : null; // in hours

  res.json({
    total: allTickets.length,
    por_estado,
    por_prioridad,
    vencidos: vencidosResult.length,
    resueltos_hoy: resueltosHoy.length,
    nuevos_hoy: nuevosHoy.length,
    tiempo_promedio_resolucion: tiempoPromedio,
  });
});

// Recent activity
router.get("/dashboard/actividad-reciente", async (req, res) => {
  const parsed = GetActividadRecienteQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const recentTickets = await db
    .select()
    .from(ticketsTable)
    .where(ticketVisibleCondition)
    .orderBy(desc(ticketsTable.fecha_creacion))
    .limit(limit);
  const recentSeguimientos = await db.select({ seg: seguimientosTable, ticket: { nombre: ticketsTable.nombre, apellido: ticketsTable.apellido } })
    .from(seguimientosTable)
    .innerJoin(
      ticketsTable,
      and(eq(seguimientosTable.ticket_id, ticketsTable.id), ticketVisibleCondition),
    )
    .orderBy(desc(seguimientosTable.fecha_creacion))
    .limit(limit);

  const activity = [
    ...recentTickets.map(t => ({
      tipo: "ticket_creado",
      ticket_id: t.id,
      nombre_contacto: `${t.nombre} ${t.apellido}`,
      descripcion: `Nuevo ticket: ${t.motivo}`,
      fecha: t.fecha_creacion.toISOString(),
    })),
    ...recentSeguimientos.map(r => ({
      tipo: "seguimiento_agregado",
      ticket_id: r.seg.ticket_id,
      nombre_contacto: r.ticket ? `${r.ticket.nombre} ${r.ticket.apellido}` : "Desconocido",
      descripcion: r.seg.nota.substring(0, 100),
      fecha: r.seg.fecha_creacion.toISOString(),
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, limit);

  res.json(activity);
});

// Overdue tickets
router.get("/dashboard/tickets-vencidos", async (req, res) => {
  const now = new Date();
  const tickets = await db.select().from(ticketsTable).where(
    and(ticketVisibleCondition, lt(ticketsTable.fecha_limite, now), not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])))
  ).orderBy(asc(ticketsTable.fecha_limite)).limit(20);
  res.json(tickets);
});

// Estadísticas por categoría derivada. El motivo original nunca se modifica.
router.get("/dashboard/motivos", async (req, res) => {
  const tickets = await db.select().from(ticketsTable).where(ticketVisibleCondition);
  const motivoCounts = new Map<MotivoCategoria, number>();
  for (const t of tickets) {
    motivoCounts.set(
      t.motivo_categoria,
      (motivoCounts.get(t.motivo_categoria) ?? 0) + 1,
    );
  }
  const result = [...motivoCounts.entries()]
    .map(([categoria, cantidad]) => ({
      categoria,
      motivo: MOTIVO_CATEGORIA_LABELS[categoria],
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  res.json(result);
});

export default router;
