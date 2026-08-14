import {
  ESTADOS,
  PRIORIDADES,
  seguimientosTable,
  ticketsTable,
  type Estado,
  type Prioridad,
} from "@workspace/db/schema";
import { calcularHorasHabilesEntre } from "@workspace/ingesta";
import { and, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  buildPerformanceCohortConditions,
  type PerformanceFilters,
} from "./cohort";

type PerformanceDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type PerformanceTeamSummaryResult = {
  tickets_ingresados: number;
  estado_actual: {
    total: number;
    abiertos: number;
    finalizados: number;
    vencidos_abiertos: number;
  };
  resolucion_con_fecha: {
    muestra: number;
    promedio_horas: number | null;
    mediana_horas: number | null;
  };
  cumplimiento_plazo_auditable: {
    muestra: number;
    cumplidos: number;
    porcentaje: number | null;
  };
  backlog_vencido: {
    abiertos: number;
    con_plazo: number;
    vencidos: number;
    porcentaje: number | null;
  };
  antiguedad_backlog: {
    muestra: number;
    mediana_horas_habiles: number | null;
  };
  cobertura_asignacion: {
    abiertos: number;
    asignados: number;
    sin_asignar: number;
    porcentaje: number | null;
  };
  distribucion_estado: Record<Estado, number>;
  distribucion_prioridad: Record<Prioridad, number>;
};

export type PerformanceTeamSummaryFilters = PerformanceFilters;

type RawTeamSummary = {
  total: number;
  abiertos: number;
  finalizados: number;
  vencidos_abiertos: number;
  abiertos_con_plazo: number;
  abiertos_asignados: number;
  antiguedad_muestra: number;
  estado_nuevo: number;
  estado_en_proceso: number;
  estado_pendiente: number;
  estado_resuelto: number;
  estado_cerrado: number;
  prioridad_baja: number;
  prioridad_media: number;
  prioridad_alta: number;
  prioridad_urgente: number;
  resolucion_muestra: number;
  resolucion_promedio_ms: number | null;
  resolucion_mediana_ms: number | null;
  plazo_muestra: number;
  plazo_cumplidos: number;
};

type RawBacklogCreation = {
  fecha_creacion: number;
};

const MILLISECONDS_PER_HOUR = 3_600_000;

/** Las horas se redondean a centésimas después de calcular en milisegundos. */
function millisecondsToRoundedHours(
  milliseconds: number | null,
): number | null {
  return milliseconds === null
    ? null
    : Math.round((milliseconds / MILLISECONDS_PER_HOUR) * 100) / 100;
}

/** Los porcentajes siguen la precisión del módulo: una cifra decimal. */
function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 1_000) / 10;
}

function numberOf(value: number): number {
  return Number(value);
}

function medianBusinessHours(
  centralRows: readonly RawBacklogCreation[],
  now: Date,
): number | null {
  if (centralRows.length === 0) return null;

  const total = centralRows.reduce(
    (sum, row) =>
      sum + calcularHorasHabilesEntre(new Date(row.fecha_creacion), now),
    0,
  );
  return Math.round((total / centralRows.length) * 100) / 100;
}

/**
 * Calcula el resumen dentro de un único snapshot transaccional: una sentencia
 * agregada resuelve los conteos y las duraciones, y una segunda lectura obtiene
 * como máximo las dos fechas centrales del backlog. Ambas medianas son
 * poblacionales exactas; solo su representación final se redondea a centésimas.
 */
export function consultarResumenEquipo<TSchema extends Record<string, unknown>>(
  database: PerformanceDatabase<TSchema>,
  filters: PerformanceTeamSummaryFilters,
  now: Date,
): PerformanceTeamSummaryResult {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("El instante del resumen de rendimiento no es válido");
  }

  const cohortCondition = and(...buildPerformanceCohortConditions(filters))!;
  const nowMs = now.getTime();

  return database.transaction((transaction) => {
    const row = transaction.get<RawTeamSummary>(sql`
    with cohort as (
      select
        ${ticketsTable.id} as ticket_id,
        ${ticketsTable.estado} as estado,
        ${ticketsTable.prioridad} as prioridad,
        ${ticketsTable.fecha_creacion} as fecha_creacion,
        ${ticketsTable.fecha_limite} as fecha_limite,
        ${ticketsTable.fecha_resolucion} as fecha_resolucion,
        ${ticketsTable.asignado_usuario_id} as asignado_usuario_id
      from ${ticketsTable}
      where ${cohortCondition}
    ),
    resolution_durations as (
      select fecha_resolucion - fecha_creacion as duracion_ms
      from cohort
      where estado in ('resuelto', 'cerrado')
        and fecha_resolucion is not null
        and fecha_resolucion >= fecha_creacion
    ),
    ranked_durations as (
      select
        duracion_ms,
        row_number() over (order by duracion_ms) as posicion,
        count(*) over () as muestra
      from resolution_durations
    ),
    resolution_stats as (
      select
        count(*) as muestra,
        avg(duracion_ms) as promedio_ms,
        avg(
          case
            when posicion in ((muestra + 1) / 2, (muestra + 2) / 2)
              then duracion_ms
            else null
          end
        ) as mediana_ms
      from ranked_durations
    ),
    audited_deadlines as (
      select
        case
          when ${seguimientosTable.fecha_creacion} <= ${seguimientosTable.fecha_limite_snapshot}
            then 1
          else 0
        end as cumplido
      from ${seguimientosTable}
      inner join cohort
        on cohort.ticket_id = ${seguimientosTable.ticket_id}
      where ${seguimientosTable.estado_anterior} is not null
        and ${seguimientosTable.estado_anterior} not in ('resuelto', 'cerrado')
        and ${seguimientosTable.estado_nuevo} in ('resuelto', 'cerrado')
        and ${seguimientosTable.fecha_limite_snapshot} is not null
    ),
    deadline_stats as (
      select
        count(*) as muestra,
        coalesce(sum(cumplido), 0) as cumplidos
      from audited_deadlines
    )
    select
      count(*) as total,
      coalesce(sum(case when estado not in ('resuelto', 'cerrado') then 1 else 0 end), 0) as abiertos,
      coalesce(sum(case when estado in ('resuelto', 'cerrado') then 1 else 0 end), 0) as finalizados,
      coalesce(sum(
        case
          when estado not in ('resuelto', 'cerrado')
            and fecha_limite < ${nowMs}
            then 1
          else 0
        end
      ), 0) as vencidos_abiertos,
      coalesce(sum(
        case
          when estado not in ('resuelto', 'cerrado')
            and fecha_limite is not null
            then 1
          else 0
        end
      ), 0) as abiertos_con_plazo,
      coalesce(sum(
        case
          when estado not in ('resuelto', 'cerrado')
            and asignado_usuario_id is not null
            then 1
          else 0
        end
      ), 0) as abiertos_asignados,
      coalesce(sum(
        case
          when estado not in ('resuelto', 'cerrado')
            and fecha_creacion <= ${nowMs}
            then 1
          else 0
        end
      ), 0) as antiguedad_muestra,
      coalesce(sum(case when estado = 'nuevo' then 1 else 0 end), 0) as estado_nuevo,
      coalesce(sum(case when estado = 'en_proceso' then 1 else 0 end), 0) as estado_en_proceso,
      coalesce(sum(case when estado = 'pendiente' then 1 else 0 end), 0) as estado_pendiente,
      coalesce(sum(case when estado = 'resuelto' then 1 else 0 end), 0) as estado_resuelto,
      coalesce(sum(case when estado = 'cerrado' then 1 else 0 end), 0) as estado_cerrado,
      coalesce(sum(case when prioridad = 'baja' then 1 else 0 end), 0) as prioridad_baja,
      coalesce(sum(case when prioridad = 'media' then 1 else 0 end), 0) as prioridad_media,
      coalesce(sum(case when prioridad = 'alta' then 1 else 0 end), 0) as prioridad_alta,
      coalesce(sum(case when prioridad = 'urgente' then 1 else 0 end), 0) as prioridad_urgente,
      (select muestra from resolution_stats) as resolucion_muestra,
      (select promedio_ms from resolution_stats) as resolucion_promedio_ms,
      (select mediana_ms from resolution_stats) as resolucion_mediana_ms,
      (select muestra from deadline_stats) as plazo_muestra,
      (select cumplidos from deadline_stats) as plazo_cumplidos
      from cohort
    `);

    if (!row) {
      throw new Error("SQLite no devolvió el resumen agregado de rendimiento");
    }

    const total = numberOf(row.total);
    const opened = numberOf(row.abiertos);
    const overdue = numberOf(row.vencidos_abiertos);
    const assigned = numberOf(row.abiertos_asignados);
    const backlogAgeSample = numberOf(row.antiguedad_muestra);
    const resolutionSample = numberOf(row.resolucion_muestra);
    const deadlineSample = numberOf(row.plazo_muestra);
    const deadlinesMet = numberOf(row.plazo_cumplidos);
    const centralRows =
      backlogAgeSample === 0
        ? []
        : transaction.all<RawBacklogCreation>(sql`
            select ${ticketsTable.fecha_creacion} as fecha_creacion
            from ${ticketsTable}
            where ${cohortCondition}
              and ${ticketsTable.estado} not in ('resuelto', 'cerrado')
              and ${ticketsTable.fecha_creacion} <= ${nowMs}
            order by ${ticketsTable.fecha_creacion} asc, ${ticketsTable.id} asc
            limit ${backlogAgeSample % 2 === 0 ? 2 : 1}
            offset ${Math.floor((backlogAgeSample - 1) / 2)}
          `);

    return {
      tickets_ingresados: total,
      estado_actual: {
        total,
        abiertos: opened,
        finalizados: numberOf(row.finalizados),
        vencidos_abiertos: overdue,
      },
      resolucion_con_fecha: {
        muestra: resolutionSample,
        promedio_horas: millisecondsToRoundedHours(row.resolucion_promedio_ms),
        mediana_horas: millisecondsToRoundedHours(row.resolucion_mediana_ms),
      },
      cumplimiento_plazo_auditable: {
        muestra: deadlineSample,
        cumplidos: deadlinesMet,
        porcentaje: percentage(deadlinesMet, deadlineSample),
      },
      backlog_vencido: {
        abiertos: opened,
        con_plazo: numberOf(row.abiertos_con_plazo),
        vencidos: overdue,
        porcentaje: percentage(overdue, opened),
      },
      antiguedad_backlog: {
        muestra: backlogAgeSample,
        mediana_horas_habiles: medianBusinessHours(centralRows, now),
      },
      cobertura_asignacion: {
        abiertos: opened,
        asignados: assigned,
        sin_asignar: opened - assigned,
        porcentaje: percentage(assigned, opened),
      },
      distribucion_estado: {
        [ESTADOS[0]]: numberOf(row.estado_nuevo),
        [ESTADOS[1]]: numberOf(row.estado_en_proceso),
        [ESTADOS[2]]: numberOf(row.estado_pendiente),
        [ESTADOS[3]]: numberOf(row.estado_resuelto),
        [ESTADOS[4]]: numberOf(row.estado_cerrado),
      },
      distribucion_prioridad: {
        [PRIORIDADES[0]]: numberOf(row.prioridad_baja),
        [PRIORIDADES[1]]: numberOf(row.prioridad_media),
        [PRIORIDADES[2]]: numberOf(row.prioridad_alta),
        [PRIORIDADES[3]]: numberOf(row.prioridad_urgente),
      },
    };
  });
}
