import {
  ESTADOS,
  PRIORIDADES,
  seguimientosTable,
  ticketsTable,
  type Estado,
  type Prioridad,
} from "@workspace/db/schema";
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
  distribucion_estado: Record<Estado, number>;
  distribucion_prioridad: Record<Prioridad, number>;
};

export type PerformanceTeamSummaryFilters = PerformanceFilters;

type RawTeamSummary = {
  total: number;
  abiertos: number;
  finalizados: number;
  vencidos_abiertos: number;
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

/**
 * Calcula el resumen completo con una única sentencia agregada. La mediana es
 * poblacional exacta: para una muestra par promedia los dos valores centrales
 * y para una impar toma el central. SQLite ordena duraciones enteras en ms;
 * solo la representación final en horas se redondea a dos decimales.
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
  const row = database.get<RawTeamSummary>(sql`
    with cohort as (
      select
        ${ticketsTable.id} as ticket_id,
        ${ticketsTable.estado} as estado,
        ${ticketsTable.prioridad} as prioridad,
        ${ticketsTable.fecha_creacion} as fecha_creacion,
        ${ticketsTable.fecha_limite} as fecha_limite,
        ${ticketsTable.fecha_resolucion} as fecha_resolucion
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
            and fecha_limite < ${now.getTime()}
            then 1
          else 0
        end
      ), 0) as vencidos_abiertos,
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
  const resolutionSample = numberOf(row.resolucion_muestra);
  const deadlineSample = numberOf(row.plazo_muestra);
  const deadlinesMet = numberOf(row.plazo_cumplidos);

  return {
    tickets_ingresados: total,
    estado_actual: {
      total,
      abiertos: numberOf(row.abiertos),
      finalizados: numberOf(row.finalizados),
      vencidos_abiertos: numberOf(row.vencidos_abiertos),
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
}
