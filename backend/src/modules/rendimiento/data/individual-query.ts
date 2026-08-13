import {
  rolesTable,
  seguimientosTable,
  ticketsTable,
  usuariosTable,
} from "@workspace/db/schema";
import { and, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  buildQualityProportion,
  getIndividualComparisonStatus,
  INDIVIDUAL_COMPARISON_MIN_RESOLUTIONS,
  INDIVIDUAL_COMPARISON_PARTIAL_COVERAGE,
  INDIVIDUAL_COMPARISON_READY_COVERAGE,
  type IndividualComparisonStatus,
} from "../domain/quality";
import {
  buildPerformanceCohortConditions,
  type PerformanceFilters,
} from "./cohort";

type PerformanceDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type PerformanceIndividualsFilters = PerformanceFilters;

export type PerformanceIndividualMetric = {
  usuario: {
    id: number;
    nombre: string;
    rol: string;
    activo: boolean;
  };
  tickets_resueltos: number;
  resoluciones_atribuidas: number;
  tiempo_resolucion_atribuible: {
    muestra: number;
    promedio_horas: number | null;
    mediana_horas: number | null;
  };
  cumplimiento_plazo_auditable: {
    muestra: number;
    cumplidos: number;
    porcentaje: number | null;
  };
  carga_actual: {
    abiertos_asignados: number;
    vencidos_asignados: number;
  };
  resoluciones_reabiertas: number;
};

export type PerformanceIndividualsResult = {
  tickets_evaluados: number;
  cobertura: {
    resoluciones_evaluadas: number;
    resoluciones_atribuidas: number;
    porcentaje_atribucion: number | null;
    atribucion_desde: Date | null;
    comparacion_individual_estado: IndividualComparisonStatus;
    minimo_resoluciones_comparables: typeof INDIVIDUAL_COMPARISON_MIN_RESOLUTIONS;
    umbral_cobertura_parcial_porcentaje: typeof INDIVIDUAL_COMPARISON_PARTIAL_COVERAGE;
    umbral_cobertura_disponible_porcentaje: typeof INDIVIDUAL_COMPARISON_READY_COVERAGE;
  };
  personas: PerformanceIndividualMetric[];
};

type RawCoverage = {
  tickets_evaluados: number;
  resoluciones_evaluadas: number;
  resoluciones_atribuidas: number;
  atribucion_desde: number | null;
};

type RawIndividualMetric = {
  usuario_id: number;
  usuario_nombre: string;
  usuario_rol: string;
  usuario_activo: number;
  tickets_resueltos: number;
  resoluciones_atribuidas: number;
  duracion_muestra: number;
  duracion_promedio_ms: number | null;
  duracion_mediana_ms: number | null;
  plazo_muestra: number;
  plazo_cumplidos: number;
  abiertos_asignados: number;
  vencidos_asignados: number;
  resoluciones_reabiertas: number;
};

const MILLISECONDS_PER_HOUR = 3_600_000;

function numberOf(value: number): number {
  return Number(value);
}

function millisecondsToRoundedHours(
  milliseconds: number | null,
): number | null {
  return milliseconds === null
    ? null
    : Math.round((Number(milliseconds) / MILLISECONDS_PER_HOUR) * 100) / 100;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 1_000) / 10;
}

/**
 * Calcula indicadores individuales exclusivamente sobre identidades y eventos
 * estructurados. La asignacion actual nunca se usa para adjudicar resoluciones:
 * solo representa la carga abierta al instante del snapshot.
 *
 * Se ejecutan dos sentencias agregadas dentro del mismo snapshot de lectura:
 * una conserva las magnitudes globales aun cuando no haya usuarios y otra
 * devuelve una fila por cada usuario persistido. No existe trabajo N+1.
 */
export function consultarRendimientoPersonas<
  TSchema extends Record<string, unknown>,
>(
  database: PerformanceDatabase<TSchema>,
  filters: PerformanceIndividualsFilters,
  now: Date,
): PerformanceIndividualsResult {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("El instante del rendimiento individual no es valido");
  }

  const cohortCondition = and(...buildPerformanceCohortConditions(filters))!;

  return database.transaction((tx): PerformanceIndividualsResult => {
    const coverage = tx.get<RawCoverage>(sql`
      with cohort as (
        select ${ticketsTable.id} as ticket_id
        from ${ticketsTable}
        where ${cohortCondition}
      ),
      resolution_events as (
        select
          ${seguimientosTable.autor_usuario_id} as autor_usuario_id,
          ${seguimientosTable.fecha_creacion} as fecha_evento
        from ${seguimientosTable}
        inner join cohort
          on cohort.ticket_id = ${seguimientosTable.ticket_id}
        where ${seguimientosTable.estado_anterior} is not null
          and ${seguimientosTable.estado_anterior} not in ('resuelto', 'cerrado')
          and ${seguimientosTable.estado_nuevo} in ('resuelto', 'cerrado')
      )
      select
        (select count(*) from cohort) as tickets_evaluados,
        count(*) as resoluciones_evaluadas,
        coalesce(sum(
          case
            when exists (
              select 1
              from ${usuariosTable}
              where ${usuariosTable.id} = resolution_events.autor_usuario_id
            ) then 1
            else 0
          end
        ), 0) as resoluciones_atribuidas,
        min(
          case
            when exists (
              select 1
              from ${usuariosTable}
              where ${usuariosTable.id} = resolution_events.autor_usuario_id
            ) then fecha_evento
            else null
          end
        ) as atribucion_desde
      from resolution_events
    `);

    if (!coverage) {
      throw new Error(
        "SQLite no devolvio la cobertura del rendimiento individual",
      );
    }

    const rows = tx.all<RawIndividualMetric>(sql`
      with cohort as (
        select
          ${ticketsTable.id} as ticket_id,
          ${ticketsTable.fecha_creacion} as fecha_creacion,
          ${ticketsTable.fecha_limite} as fecha_limite,
          ${ticketsTable.estado} as estado,
          ${ticketsTable.asignado_usuario_id} as asignado_usuario_id
        from ${ticketsTable}
        where ${cohortCondition}
      ),
      resolution_events as (
        select
          ${seguimientosTable.id} as resolucion_id,
          ${seguimientosTable.ticket_id} as ticket_id,
          ${seguimientosTable.autor_usuario_id} as autor_usuario_id,
          ${seguimientosTable.fecha_creacion} as fecha_evento,
          ${seguimientosTable.fecha_limite_snapshot} as fecha_limite_snapshot,
          cohort.fecha_creacion as ticket_fecha_creacion
        from ${seguimientosTable}
        inner join cohort
          on cohort.ticket_id = ${seguimientosTable.ticket_id}
        where ${seguimientosTable.estado_anterior} is not null
          and ${seguimientosTable.estado_anterior} not in ('resuelto', 'cerrado')
          and ${seguimientosTable.estado_nuevo} in ('resuelto', 'cerrado')
      ),
      resolution_windows as (
        select
          resolution_events.*,
          lead(fecha_evento) over (
            partition by ticket_id
            order by fecha_evento, resolucion_id
          ) as siguiente_fecha_evento,
          lead(resolucion_id) over (
            partition by ticket_id
            order by fecha_evento, resolucion_id
          ) as siguiente_resolucion_id
        from resolution_events
      ),
      attributed_resolutions as (
        select resolution_windows.*
        from resolution_windows
        inner join ${usuariosTable}
          on ${usuariosTable.id} = resolution_windows.autor_usuario_id
      ),
      valid_durations as (
        select
          autor_usuario_id,
          fecha_evento - ticket_fecha_creacion as duracion_ms
        from attributed_resolutions
        where fecha_evento >= ticket_fecha_creacion
      ),
      ranked_durations as (
        select
          autor_usuario_id,
          duracion_ms,
          row_number() over (
            partition by autor_usuario_id
            order by duracion_ms
          ) as posicion,
          count(*) over (partition by autor_usuario_id) as muestra
        from valid_durations
      ),
      duration_stats as (
        select
          autor_usuario_id,
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
        group by autor_usuario_id
      ),
      resolution_stats as (
        select
          autor_usuario_id,
          count(distinct ticket_id) as tickets_resueltos,
          count(*) as resoluciones_atribuidas,
          count(fecha_limite_snapshot) as plazo_muestra,
          coalesce(sum(
            case
              when fecha_limite_snapshot is not null
                and fecha_evento <= fecha_limite_snapshot
                then 1
              else 0
            end
          ), 0) as plazo_cumplidos
        from attributed_resolutions
        group by autor_usuario_id
      ),
      current_load as (
        select
          asignado_usuario_id as usuario_id,
          count(*) as abiertos_asignados,
          coalesce(sum(
            case when fecha_limite < ${now.getTime()} then 1 else 0 end
          ), 0) as vencidos_asignados
        from cohort
        where estado not in ('resuelto', 'cerrado')
          and asignado_usuario_id is not null
        group by asignado_usuario_id
      ),
      reopened_resolutions as (
        select
          attributed_resolutions.autor_usuario_id,
          count(*) as resoluciones_reabiertas
        from attributed_resolutions
        where exists (
          select 1
          from ${seguimientosTable} as reopening
          where reopening.ticket_id = attributed_resolutions.ticket_id
            and reopening.estado_anterior in ('resuelto', 'cerrado')
            and reopening.estado_nuevo is not null
            and reopening.estado_nuevo not in ('resuelto', 'cerrado')
            and (
              reopening.fecha_creacion > attributed_resolutions.fecha_evento
              or (
                reopening.fecha_creacion = attributed_resolutions.fecha_evento
                and reopening.id > attributed_resolutions.resolucion_id
              )
            )
            and (
              attributed_resolutions.siguiente_resolucion_id is null
              or reopening.fecha_creacion < attributed_resolutions.siguiente_fecha_evento
              or (
                reopening.fecha_creacion = attributed_resolutions.siguiente_fecha_evento
                and reopening.id < attributed_resolutions.siguiente_resolucion_id
              )
            )
        )
        group by attributed_resolutions.autor_usuario_id
      )
      select
        ${usuariosTable.id} as usuario_id,
        coalesce(
          nullif(trim(
            ${usuariosTable.nombre} || ' ' || coalesce(${usuariosTable.apellido}, '')
          ), ''),
          'Usuario ' || ${usuariosTable.id}
        ) as usuario_nombre,
        ${rolesTable.nombre} as usuario_rol,
        ${usuariosTable.activo} as usuario_activo,
        coalesce(resolution_stats.tickets_resueltos, 0) as tickets_resueltos,
        coalesce(resolution_stats.resoluciones_atribuidas, 0) as resoluciones_atribuidas,
        coalesce(duration_stats.muestra, 0) as duracion_muestra,
        duration_stats.promedio_ms as duracion_promedio_ms,
        duration_stats.mediana_ms as duracion_mediana_ms,
        coalesce(resolution_stats.plazo_muestra, 0) as plazo_muestra,
        coalesce(resolution_stats.plazo_cumplidos, 0) as plazo_cumplidos,
        coalesce(current_load.abiertos_asignados, 0) as abiertos_asignados,
        coalesce(current_load.vencidos_asignados, 0) as vencidos_asignados,
        coalesce(reopened_resolutions.resoluciones_reabiertas, 0)
          as resoluciones_reabiertas
      from ${usuariosTable}
      inner join ${rolesTable} on ${rolesTable.id} = ${usuariosTable.role_id}
      left join resolution_stats
        on resolution_stats.autor_usuario_id = ${usuariosTable.id}
      left join duration_stats
        on duration_stats.autor_usuario_id = ${usuariosTable.id}
      left join current_load
        on current_load.usuario_id = ${usuariosTable.id}
      left join reopened_resolutions
        on reopened_resolutions.autor_usuario_id = ${usuariosTable.id}
      order by usuario_nombre collate nocase, ${usuariosTable.id}
    `);

    const evaluatedResolutions = numberOf(coverage.resoluciones_evaluadas);
    const attributedResolutions = numberOf(coverage.resoluciones_atribuidas);
    const actorCoverage = buildQualityProportion(
      attributedResolutions,
      evaluatedResolutions,
    );

    return {
      tickets_evaluados: numberOf(coverage.tickets_evaluados),
      cobertura: {
        resoluciones_evaluadas: evaluatedResolutions,
        resoluciones_atribuidas: attributedResolutions,
        porcentaje_atribucion: actorCoverage.porcentaje,
        atribucion_desde:
          coverage.atribucion_desde === null
            ? null
            : new Date(Number(coverage.atribucion_desde)),
        comparacion_individual_estado:
          getIndividualComparisonStatus(actorCoverage),
        minimo_resoluciones_comparables: INDIVIDUAL_COMPARISON_MIN_RESOLUTIONS,
        umbral_cobertura_parcial_porcentaje:
          INDIVIDUAL_COMPARISON_PARTIAL_COVERAGE,
        umbral_cobertura_disponible_porcentaje:
          INDIVIDUAL_COMPARISON_READY_COVERAGE,
      },
      personas: rows.map((row) => {
        const deadlineSample = numberOf(row.plazo_muestra);
        const deadlinesMet = numberOf(row.plazo_cumplidos);

        return {
          usuario: {
            id: numberOf(row.usuario_id),
            nombre: row.usuario_nombre,
            rol: row.usuario_rol,
            activo: Boolean(row.usuario_activo),
          },
          tickets_resueltos: numberOf(row.tickets_resueltos),
          resoluciones_atribuidas: numberOf(row.resoluciones_atribuidas),
          tiempo_resolucion_atribuible: {
            muestra: numberOf(row.duracion_muestra),
            promedio_horas: millisecondsToRoundedHours(
              row.duracion_promedio_ms,
            ),
            mediana_horas: millisecondsToRoundedHours(row.duracion_mediana_ms),
          },
          cumplimiento_plazo_auditable: {
            muestra: deadlineSample,
            cumplidos: deadlinesMet,
            porcentaje: percentage(deadlinesMet, deadlineSample),
          },
          carga_actual: {
            abiertos_asignados: numberOf(row.abiertos_asignados),
            vencidos_asignados: numberOf(row.vencidos_asignados),
          },
          resoluciones_reabiertas: numberOf(row.resoluciones_reabiertas),
        };
      }),
    };
  });
}
