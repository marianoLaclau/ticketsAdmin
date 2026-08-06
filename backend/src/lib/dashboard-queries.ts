import { ticketsTable } from "@workspace/db/schema";
import { ticketVisibleCondition } from "@workspace/db/ticket-visibility";
import {
  MOTIVO_CATEGORIA_LABELS,
  type MotivoCategoria,
} from "@workspace/ingesta";
import {
  and,
  asc,
  count,
  desc,
  gte,
  inArray,
  lt,
  lte,
  min,
  not,
  sql,
  type SQL,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  businessDayWindow,
  type DashboardDateRange,
} from "./dashboard-date-range";

type DashboardDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type DashboardStatsResult = {
  total: number;
  por_estado: Array<{ estado: string; cantidad: number }>;
  por_prioridad: Array<{ prioridad: string; cantidad: number }>;
  vencidos: number;
  resueltos_hoy: number;
  nuevos_hoy: number;
  resueltos_periodo: number;
  nuevos_periodo: number;
  tiempo_promedio_resolucion: number | null;
};

export type DashboardMotivoResult = {
  categoria: MotivoCategoria;
  motivo: (typeof MOTIVO_CATEGORIA_LABELS)[MotivoCategoria];
  cantidad: number;
};

const numericDecoder = {
  mapFromDriverValue(value: unknown): number {
    return Number(value);
  },
};

const nullableNumericDecoder = {
  mapFromDriverValue(value: unknown): number | null {
    return value === null ? null : Number(value);
  },
};

function countWhen(condition: SQL): SQL<number> {
  return sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(
    numericDecoder,
  );
}

function createdInRange(range: DashboardDateRange): SQL[] {
  const conditions: SQL[] = [];
  if (range.fecha_desde) {
    conditions.push(gte(ticketsTable.fecha_creacion, range.fecha_desde));
  }
  if (range.fecha_hasta) {
    conditions.push(lte(ticketsTable.fecha_creacion, range.fecha_hasta));
  }
  return conditions;
}

/**
 * Calcula el snapshot completo de estadísticas sin materializar tickets en JS.
 * La transacción diferida hace que las lecturas compartan el mismo
 * snapshot aunque otro proceso confirme cambios mientras se construye la
 * respuesta.
 */
export function consultarDashboardStats<
  TSchema extends Record<string, unknown>,
>(
  database: DashboardDatabase<TSchema>,
  range: DashboardDateRange,
  now: Date,
): DashboardStatsResult {
  const today = businessDayWindow(now);
  const periodConditions = createdInRange(range);

  return database.transaction((tx): DashboardStatsResult => {
    const cohort = tx
      .select({
        total: count(),
        vencidos: countWhen(
          and(
            lt(ticketsTable.fecha_limite, now),
            not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])),
          )!,
        ),
        finalizados: countWhen(
          inArray(ticketsTable.estado, ["resuelto", "cerrado"]),
        ),
        tiempoPromedio: sql<
          number | null
        >`avg((${ticketsTable.fecha_resolucion} - ${ticketsTable.fecha_creacion}) / 3600000.0)`.mapWith(
          nullableNumericDecoder,
        ),
      })
      .from(ticketsTable)
      .where(and(ticketVisibleCondition, ...periodConditions))
      .get()!;

    const estadoCantidad = count();
    const estadoFirstId = min(ticketsTable.id);
    // El ID mínimo formaliza el orden histórico de primera aparición que antes
    // surgía incidentalmente al recorrer filas completas.
    const porEstado = tx
      .select({
        estado: ticketsTable.estado,
        cantidad: estadoCantidad,
        firstId: estadoFirstId,
      })
      .from(ticketsTable)
      .where(and(ticketVisibleCondition, ...periodConditions))
      .groupBy(ticketsTable.estado)
      .orderBy(asc(estadoFirstId))
      .all()
      .map(({ estado, cantidad }) => ({ estado, cantidad }));

    const prioridadCantidad = count();
    const prioridadFirstId = min(ticketsTable.id);
    const porPrioridad = tx
      .select({
        prioridad: ticketsTable.prioridad,
        cantidad: prioridadCantidad,
        firstId: prioridadFirstId,
      })
      .from(ticketsTable)
      .where(and(ticketVisibleCondition, ...periodConditions))
      .groupBy(ticketsTable.prioridad)
      .orderBy(asc(prioridadFirstId))
      .all()
      .map(({ prioridad, cantidad }) => ({ prioridad, cantidad }));

    const resueltosHoy = tx
      .select({ total: count() })
      .from(ticketsTable)
      .where(
        and(
          ticketVisibleCondition,
          gte(ticketsTable.fecha_resolucion, today.start),
          lt(ticketsTable.fecha_resolucion, today.end),
        ),
      )
      .get()!.total;
    const nuevosHoy = tx
      .select({ total: count() })
      .from(ticketsTable)
      .where(
        and(
          ticketVisibleCondition,
          gte(ticketsTable.fecha_creacion, today.start),
          lt(ticketsTable.fecha_creacion, today.end),
        ),
      )
      .get()!.total;

    return {
      total: cohort.total,
      por_estado: porEstado,
      por_prioridad: porPrioridad,
      vencidos: cohort.vencidos,
      resueltos_hoy: resueltosHoy,
      nuevos_hoy: nuevosHoy,
      resueltos_periodo: cohort.finalizados,
      nuevos_periodo: cohort.total,
      tiempo_promedio_resolucion: cohort.tiempoPromedio,
    };
  });
}

/** Agrupa únicamente categorías presentes; los empates conservan la primera aparición. */
export function consultarMotivosDashboard<
  TSchema extends Record<string, unknown>,
>(
  database: DashboardDatabase<TSchema>,
  range: DashboardDateRange,
): DashboardMotivoResult[] {
  const cantidad = count();
  const firstId = min(ticketsTable.id);
  return database
    .select({
      categoria: ticketsTable.motivo_categoria,
      cantidad,
      firstId,
    })
    .from(ticketsTable)
    .where(and(ticketVisibleCondition, ...createdInRange(range)))
    .groupBy(ticketsTable.motivo_categoria)
    .orderBy(desc(cantidad), asc(firstId))
    .all()
    .map(({ categoria, cantidad: total }) => ({
      categoria,
      motivo: MOTIVO_CATEGORIA_LABELS[categoria],
      cantidad: total,
    }));
}
