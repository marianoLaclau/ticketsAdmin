import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Inbox,
  ListChecks,
  ShieldAlert,
  Timer,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { getEstadoLabel } from "@/lib/estados";
import { cn } from "@/lib/utils";
import {
  formatRendimientoPeriod,
  rendimientoNumberFormatter,
} from "./rendimiento-format";
import { KpiCard, OperationalKpiCard } from "./ResumenEquipoKpiCards";
import {
  decimalFormatter,
  formatBusinessHours,
  formatGeneratedAt,
  formatHours,
  formatPercentage,
  normalizeCount,
  normalizePercentage,
} from "./resumen-equipo-format";
import type {
  ResumenEquipoEstadoDistribucion,
  ResumenEquipoPanelProps,
  ResumenEquipoResolucionConFecha,
  ResumenEquipoPrioridadDistribucion,
} from "./resumen-equipo-types";
export type * from "./resumen-equipo-types";

interface VisualConfig {
  label: string;
  color: string;
  barClassName: string;
}

const ESTADO_CONFIG: Readonly<Record<string, VisualConfig>> = {
  nuevo: {
    label: "Nuevo",
    color: "#64748b",
    barClassName: "bg-slate-500",
  },
  en_proceso: {
    label: "En proceso",
    color: "#3b82f6",
    barClassName: "bg-blue-500",
  },
  pendiente: {
    label: getEstadoLabel("pendiente"),
    color: "#f59e0b",
    barClassName: "bg-amber-500",
  },
  resuelto: {
    label: "Resuelto",
    color: "#3d7532",
    barClassName: "bg-primary",
  },
  cerrado: {
    label: "Cerrado",
    color: "#1e293b",
    barClassName: "bg-slate-800",
  },
};

const PRIORIDAD_CONFIG: Readonly<Record<string, VisualConfig>> = {
  urgente: {
    label: "Urgente",
    color: "#ef4444",
    barClassName: "bg-red-500",
  },
  alta: {
    label: "Alta",
    color: "#f97316",
    barClassName: "bg-orange-500",
  },
  media: {
    label: "Media",
    color: "#3b82f6",
    barClassName: "bg-blue-500",
  },
  baja: {
    label: "Baja",
    color: "#22c55e",
    barClassName: "bg-emerald-500",
  },
};

function DistributionList({
  id,
  title,
  items,
  getConfig,
}: {
  id: string;
  title: string;
  items: Readonly<
    ResumenEquipoEstadoDistribucion | ResumenEquipoPrioridadDistribucion
  >;
  getConfig: (key: string) => VisualConfig;
}) {
  const normalizedItems = Object.entries(items)
    .map(([key, cantidad]) => ({
      key,
      cantidad: normalizeCount(cantidad),
    }))
    .filter((item) => item.cantidad > 0);
  const total = normalizedItems.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <section aria-labelledby={id}>
      <h3
        id={id}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h3>
      {total === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Sin datos para distribuir.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {normalizedItems.map((item) => {
            const config = getConfig(item.key);
            const percentage = (item.cantidad / total) * 100;
            return (
              <li key={item.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: config.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{config.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <strong className="text-foreground">
                      {rendimientoNumberFormatter.format(item.cantidad)}
                    </strong>{" "}
                    ({decimalFormatter.format(percentage)}%)
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${config.label}: ${rendimientoNumberFormatter.format(item.cantidad)} de ${rendimientoNumberFormatter.format(total)} tickets`}
                >
                  <div
                    className={cn("h-full rounded-full", config.barClassName)}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CoverageNotice({
  sample,
  expected,
  subject,
}: {
  sample: number;
  expected: number;
  subject: string;
}) {
  const normalizedSample = normalizeCount(sample);
  const normalizedExpected = normalizeCount(expected);
  if (normalizedExpected === 0 || normalizedSample >= normalizedExpected) {
    return null;
  }

  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
      <ShieldAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <p>
        Cobertura parcial: {subject} usa{" "}
        {rendimientoNumberFormatter.format(normalizedSample)}
        {" de "}
        {rendimientoNumberFormatter.format(normalizedExpected)} tickets finalizados.
      </p>
    </div>
  );
}

function TimingPanel({
  resolution,
  expectedSample,
}: {
  resolution: ResumenEquipoResolucionConFecha;
  expectedSample: number;
}) {
  const sample = normalizeCount(resolution.muestra);
  const hasMetrics =
    sample > 0 &&
    (resolution.promedio_horas !== null || resolution.mediana_horas !== null);

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b p-5">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Tiempo de resolución</h2>
        </div>
        <CardDescription>
          Horas corridas desde la creación hasta la resolución, únicamente en
          tickets actualmente finalizados con ambas fechas disponibles.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {hasMetrics ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Mediana</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatHours(resolution.mediana_horas)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Valor central: la mitad de la muestra se resolvió en este tiempo
                o menos. Reduce el efecto de casos excepcionalmente largos.
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Promedio</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatHours(resolution.promedio_horas)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Suma de todos los tiempos dividida por la muestra. Los casos muy
                demorados pueden elevarlo considerablemente.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Clock3
              className="mx-auto h-7 w-7 text-slate-300"
              aria-hidden="true"
            />
            <h3 className="mt-2 text-sm font-medium">
              Sin tiempos de resolución disponibles
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              El conjunto analizado no contiene una muestra con fechas
              completas.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Muestra: {rendimientoNumberFormatter.format(sample)} tickets finalizados con
          fechas utilizables. Las horas son corridas: incluyen noches, fines de
          semana y feriados.
        </p>
        <CoverageNotice
          sample={sample}
          expected={expectedSample}
          subject="el cálculo de tiempos"
        />
      </CardContent>
    </Card>
  );
}

function genericConfig(key: string): VisualConfig {
  const label = key
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("es"));
  return {
    label,
    color: "#94a3b8",
    barClassName: "bg-slate-400",
  };
}

export function ResumenEquipoPanel({
  periodo,
  periodFilterLabel,
  tickets_ingresados,
  estado_actual,
  resolucion_con_fecha,
  cumplimiento_plazo,
  backlog_vencido,
  antiguedad_backlog,
  cobertura_asignacion,
  distribucion_estado,
  distribucion_prioridad,
  onClearFilters,
}: ResumenEquipoPanelProps) {
  const total = normalizeCount(estado_actual.total);
  const opened = normalizeCount(estado_actual.abiertos);
  const finished = normalizeCount(estado_actual.finalizados);
  const overdue = normalizeCount(estado_actual.vencidos_abiertos);
  const complianceSample = normalizeCount(cumplimiento_plazo.muestra);
  const complianceFulfilled = Math.min(
    normalizeCount(cumplimiento_plazo.cumplidos),
    complianceSample,
  );
  const compliancePercentage =
    complianceSample > 0
      ? normalizePercentage(cumplimiento_plazo.porcentaje)
      : null;
  const backlogOpen = normalizeCount(backlog_vencido.abiertos);
  const backlogOverdue = Math.min(
    normalizeCount(backlog_vencido.vencidos),
    backlogOpen,
  );
  const backlogWithDeadline = Math.min(
    normalizeCount(backlog_vencido.con_plazo),
    backlogOpen,
  );
  const backlogPercentage =
    backlogOpen > 0 ? normalizePercentage(backlog_vencido.porcentaje) : null;
  const backlogAgeSample = normalizeCount(antiguedad_backlog.muestra);
  const backlogAge =
    backlogAgeSample > 0 ? antiguedad_backlog.mediana_horas_habiles : null;
  const assignmentOpen = normalizeCount(cobertura_asignacion.abiertos);
  const assigned = Math.min(
    normalizeCount(cobertura_asignacion.asignados),
    assignmentOpen,
  );
  const assignmentPercentage =
    assignmentOpen > 0
      ? normalizePercentage(cobertura_asignacion.porcentaje)
      : null;
  const hasCompliance = complianceSample > 0 && compliancePercentage !== null;
  const hasBacklogAge =
    backlogAgeSample > 0 &&
    backlogAge !== null &&
    Number.isFinite(backlogAge) &&
    backlogAge >= 0;
  const hasData =
    normalizeCount(tickets_ingresados) > 0 ||
    total > 0 ||
    Object.values(distribucion_estado).some((count) =>
      Boolean(normalizeCount(count)),
    ) ||
    Object.values(distribucion_prioridad).some((count) =>
      Boolean(normalizeCount(count)),
    );

  return (
    <section
      className="space-y-4"
      aria-labelledby="rendimiento-resumen-equipo-heading"
    >
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
                <h2
                  id="rendimiento-resumen-equipo-heading"
                  className="text-lg font-semibold tracking-tight sm:text-xl"
                >
                  Resumen del equipo
                </h2>
              </div>
              <CardDescription className="mt-1 max-w-3xl leading-relaxed">
                Volumen del período, estado actual del conjunto analizado y
                cobertura de sus indicadores de resolución.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit bg-white text-slate-700">
              {formatRendimientoPeriod(periodo)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <p className="text-xs text-muted-foreground">
            Estado registrado el{" "}
            {formatGeneratedAt(periodo.generado_en, periodo.timezone)}
          </p>
        </CardContent>
      </Card>

      {!hasData ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center px-5 py-12 text-center">
            <Inbox className="h-9 w-9 text-slate-300" aria-hidden="true" />
            <h3 className="mt-3 text-base font-semibold">
              No hay actividad en este período
            </h3>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              El conjunto analizado no contiene tickets para construir un
              resumen del equipo. Probá ampliar el período o quitar filtros.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={onClearFilters}
            >
              Limpiar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Tickets ingresados"
              value={tickets_ingresados}
              detail="creados en el período"
              icon={Inbox}
              tone="slate"
            />
            <KpiCard
              title="Abiertos"
              value={opened}
              detail={`de ${rendimientoNumberFormatter.format(total)} en el conjunto analizado`}
              icon={AlertCircle}
              tone="blue"
            />
            <KpiCard
              title="Finalizados"
              value={finished}
              detail="estado actual"
              icon={CheckCircle2}
              tone="emerald"
            />
            <KpiCard
              title="Vencidos abiertos"
              value={overdue}
              detail="requieren atención"
              icon={Clock3}
              tone={overdue > 0 ? "red" : "slate"}
            />
          </div>

          <section aria-labelledby="rendimiento-indicadores-operativos-heading">
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <ListChecks
                    className="h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                  <h2
                    id="rendimiento-indicadores-operativos-heading"
                    className="font-semibold"
                  >
                    Indicadores operativos
                  </h2>
                </div>
                <CardDescription className="max-w-3xl leading-relaxed">
                  Seguimiento del plazo, el backlog y su asignación al momento
                  de la consulta.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <OperationalKpiCard
                    id="rendimiento-kpi-cumplimiento-sla"
                    title="Cumplimiento del plazo"
                    value={
                      hasCompliance
                        ? formatPercentage(compliancePercentage)
                        : "Sin muestra"
                    }
                    detail={
                      hasCompliance
                        ? `${rendimientoNumberFormatter.format(complianceFulfilled)} de ${rendimientoNumberFormatter.format(complianceSample)} finalizaciones dentro del plazo`
                        : "No hay finalizaciones con fechas de plazo utilizables."
                    }
                    description="Finalizaciones realizadas dentro del plazo registrado."
                    scopeLabel={periodFilterLabel}
                    icon={ListChecks}
                    tone="blue"
                    percentage={hasCompliance ? compliancePercentage : null}
                    progressValueText={
                      hasCompliance
                        ? `${formatPercentage(compliancePercentage)}, ${rendimientoNumberFormatter.format(complianceFulfilled)} de ${rendimientoNumberFormatter.format(complianceSample)} finalizaciones dentro del plazo`
                        : undefined
                    }
                  />
                  <OperationalKpiCard
                    id="rendimiento-kpi-backlog-vencido"
                    title="Backlog vencido"
                    value={
                      backlogOpen === 0
                        ? "Sin backlog"
                        : formatPercentage(backlogPercentage)
                    }
                    detail={
                      backlogOpen === 0
                        ? "No hay tickets abiertos en el conjunto analizado."
                        : `${rendimientoNumberFormatter.format(backlogOverdue)} de ${rendimientoNumberFormatter.format(backlogOpen)} tickets abiertos del conjunto analizado`
                    }
                    description="Proporción del backlog que ya superó su fecha límite."
                    note={
                      backlogOpen > 0 && backlogWithDeadline < backlogOpen
                        ? `Cobertura parcial: ${rendimientoNumberFormatter.format(backlogWithDeadline)} de ${rendimientoNumberFormatter.format(backlogOpen)} con plazo verificable.`
                        : undefined
                    }
                    icon={Clock3}
                    tone="amber"
                    percentage={backlogPercentage}
                    progressValueText={
                      backlogPercentage !== null
                        ? `${formatPercentage(backlogPercentage)}, ${rendimientoNumberFormatter.format(backlogOverdue)} de ${rendimientoNumberFormatter.format(backlogOpen)} tickets abiertos vencidos`
                        : undefined
                    }
                  />
                  <OperationalKpiCard
                    id="rendimiento-kpi-antiguedad-backlog"
                    title="Antigüedad del backlog"
                    value={
                      hasBacklogAge
                        ? formatBusinessHours(backlogAge)
                        : "Sin muestra"
                    }
                    detail={
                      hasBacklogAge
                        ? `Mediana de ${rendimientoNumberFormatter.format(backlogAgeSample)} tickets abiertos`
                        : "No hay tickets abiertos con fechas utilizables."
                    }
                    description="Tiempo hábil transcurrido desde la creación de los tickets que siguen abiertos."
                    icon={CalendarClock}
                    tone="violet"
                  />
                  <OperationalKpiCard
                    id="rendimiento-kpi-cobertura-asignacion"
                    title="Cobertura de asignación"
                    value={
                      assignmentOpen === 0
                        ? "Sin backlog"
                        : formatPercentage(assignmentPercentage)
                    }
                    detail={
                      assignmentOpen === 0
                        ? "No hay tickets abiertos en el conjunto analizado."
                        : `${rendimientoNumberFormatter.format(assigned)} de ${rendimientoNumberFormatter.format(assignmentOpen)} tickets abiertos con operador asignado`
                    }
                    description="Proporción del backlog que tiene un responsable identificado."
                    icon={UserCheck}
                    tone="emerald"
                    percentage={assignmentPercentage}
                    progressValueText={
                      assignmentPercentage !== null
                        ? `${formatPercentage(assignmentPercentage)}, ${rendimientoNumberFormatter.format(assigned)} de ${rendimientoNumberFormatter.format(assignmentOpen)} tickets abiertos con operador asignado`
                        : undefined
                    }
                  />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Estos indicadores describen únicamente los tickets del
                  conjunto analizado, incluidos los filtros y el período de
                  creación seleccionados; no representan backlog creado fuera de
                  ese período.
                </p>
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="border-b p-5">
                <h2 className="font-semibold">Flujo y estado actual</h2>
                <CardDescription>
                  Lectura exacta del conjunto analizado por estado y prioridad.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-5 sm:grid-cols-2">
                <DistributionList
                  id="rendimiento-distribucion-estado"
                  title="Distribución por estado"
                  items={distribucion_estado}
                  getConfig={(key) => ESTADO_CONFIG[key] ?? genericConfig(key)}
                />
                <DistributionList
                  id="rendimiento-distribucion-prioridad"
                  title="Distribución por prioridad"
                  items={distribucion_prioridad}
                  getConfig={(key) =>
                    PRIORIDAD_CONFIG[key] ?? genericConfig(key)
                  }
                />
              </CardContent>
            </Card>

            <TimingPanel
              resolution={resolucion_con_fecha}
              expectedSample={finished}
            />
          </div>
        </>
      )}
    </section>
  );
}
