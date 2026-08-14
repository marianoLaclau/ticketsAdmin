import { seguimientosTable, ticketsTable } from "@workspace/db/schema";
import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  buildQualityProportion,
  getIndividualComparisonStatus,
  type IndividualComparisonStatus,
  type QualityProportion,
} from "../domain/quality";
import {
  buildPerformanceCohortConditions,
  type PerformanceFilters,
} from "./cohort";
import {
  nonBlankContactText,
  usableDniContactIdentity,
  usableEmailContactIdentity,
  usablePhoneContactIdentity,
} from "./contact-identity";

type PerformanceDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type PerformanceQualityFilters = PerformanceFilters;

export type PerformanceQualityResult = {
  tickets_evaluados: number;
  resoluciones_evaluadas: number;
  atribucion_desde: Date | null;
  comparacion_individual_estado: IndividualComparisonStatus;
  coberturas: {
    actor_resolucion: QualityProportion;
    fecha_resolucion: QualityProportion;
    plazo_resolucion: QualityProportion;
    asignacion_estructurada: QualityProportion;
    identidad_contacto: QualityProportion;
    fecha_limite: QualityProportion;
  };
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

/**
 * Mide cobertura sin materializar filas. Todas las consultas comparten un
 * snapshot diferido y el mismo conjunto analizado de tickets visibles por creación.
 */
export function consultarCalidadRendimiento<
  TSchema extends Record<string, unknown>,
>(
  database: PerformanceDatabase<TSchema>,
  filters: PerformanceQualityFilters,
): PerformanceQualityResult {
  const cohort = buildPerformanceCohortConditions(filters);
  const finalStatus = inArray(ticketsTable.estado, ["resuelto", "cerrado"]);
  const hasContactIdentity = or(
    usableDniContactIdentity(ticketsTable.dni),
    usablePhoneContactIdentity(ticketsTable.telefono),
    usableEmailContactIdentity(ticketsTable.email),
  )!;
  const hasAnyAssignment = or(
    isNotNull(ticketsTable.asignado_usuario_id),
    nonBlankContactText(ticketsTable.asignado_a),
  )!;
  const isVerifiedResolution = and(
    isNotNull(seguimientosTable.estado_anterior),
    not(inArray(seguimientosTable.estado_anterior, ["resuelto", "cerrado"])),
    inArray(seguimientosTable.estado_nuevo, ["resuelto", "cerrado"]),
  )!;

  return database.transaction((tx): PerformanceQualityResult => {
    const ticketCoverage = tx
      .select({
        total: count(),
        finalizados: countWhen(finalStatus),
        finalizadosConFecha: countWhen(
          and(finalStatus, isNotNull(ticketsTable.fecha_resolucion))!,
        ),
        conFechaLimite: countWhen(isNotNull(ticketsTable.fecha_limite)),
        conIdentidad: countWhen(hasContactIdentity),
        conAsignacion: countWhen(hasAnyAssignment),
        conAsignacionEstructurada: countWhen(
          isNotNull(ticketsTable.asignado_usuario_id),
        ),
      })
      .from(ticketsTable)
      .where(and(...cohort))
      .get()!;

    const resolutionCoverage = tx
      .select({
        total: count(),
        conActor: countWhen(isNotNull(seguimientosTable.autor_usuario_id)),
        conPlazo: countWhen(isNotNull(seguimientosTable.fecha_limite_snapshot)),
        atribucionDesde: sql<
          number | null
        >`min(case when ${seguimientosTable.autor_usuario_id} is not null then ${seguimientosTable.fecha_creacion} else null end)`.mapWith(
          nullableNumericDecoder,
        ),
      })
      .from(seguimientosTable)
      .innerJoin(
        ticketsTable,
        and(eq(seguimientosTable.ticket_id, ticketsTable.id), ...cohort),
      )
      .where(isVerifiedResolution)
      .get()!;

    const actorResolution = buildQualityProportion(
      resolutionCoverage.conActor,
      resolutionCoverage.total,
    );

    return {
      tickets_evaluados: ticketCoverage.total,
      resoluciones_evaluadas: resolutionCoverage.total,
      atribucion_desde:
        resolutionCoverage.atribucionDesde === null
          ? null
          : new Date(resolutionCoverage.atribucionDesde),
      comparacion_individual_estado:
        getIndividualComparisonStatus(actorResolution),
      coberturas: {
        actor_resolucion: actorResolution,
        fecha_resolucion: buildQualityProportion(
          ticketCoverage.finalizadosConFecha,
          ticketCoverage.finalizados,
        ),
        plazo_resolucion: buildQualityProportion(
          resolutionCoverage.conPlazo,
          resolutionCoverage.total,
        ),
        asignacion_estructurada: buildQualityProportion(
          ticketCoverage.conAsignacionEstructurada,
          ticketCoverage.conAsignacion,
        ),
        identidad_contacto: buildQualityProportion(
          ticketCoverage.conIdentidad,
          ticketCoverage.total,
        ),
        fecha_limite: buildQualityProportion(
          ticketCoverage.conFechaLimite,
          ticketCoverage.total,
        ),
      },
    };
  });
}
