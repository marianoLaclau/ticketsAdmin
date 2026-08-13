import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Inbox,
  ListChecks,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getEstadoLabel } from "@/lib/estados";
import { cn } from "@/lib/utils";
import {
  formatRendimientoDateTime,
  formatRendimientoPeriod,
} from "./rendimiento-format";

export interface ResumenEquipoPeriodo {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  timezone: string;
  generado_en: string;
}

export interface ResumenEquipoEstadoActual {
  total: number;
  abiertos: number;
  finalizados: number;
  vencidos_abiertos: number;
}

export interface ResumenEquipoResolucionConFecha {
  muestra: number;
  promedio_horas: number | null;
  mediana_horas: number | null;
}

export interface ResumenEquipoCumplimiento {
  muestra: number;
  cumplidos: number;
  porcentaje: number | null;
}

export interface ResumenEquipoEstadoDistribucion {
  nuevo: number;
  en_proceso: number;
  pendiente: number;
  resuelto: number;
  cerrado: number;
}

export interface ResumenEquipoPrioridadDistribucion {
  baja: number;
  media: number;
  alta: number;
  urgente: number;
}

export interface ResumenEquipoPanelProps {
  periodo: ResumenEquipoPeriodo;
  tickets_ingresados: number;
  estado_actual: ResumenEquipoEstadoActual;
  resolucion_con_fecha: ResumenEquipoResolucionConFecha;
  cumplimiento_plazo_auditable: ResumenEquipoCumplimiento;
  distribucion_estado: ResumenEquipoEstadoDistribucion;
  distribucion_prioridad: ResumenEquipoPrioridadDistribucion;
  onClearFilters: () => void;
}

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

const numberFormatter = new Intl.NumberFormat("es-AR");
const decimalFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizePercentage(value: number | null): number | null {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.min(100, Math.max(0, value));
}

function formatGeneratedAt(value: string, timezone: string): string {
  return formatRendimientoDateTime(value, timezone) ?? "hora no disponible";
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "No disponible";
  }
  if (value < 1) return `${Math.round(value * 60)} min`;

  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  if (minutes === 60) return `${wholeHours + 1} h`;
  return minutes > 0
    ? `${numberFormatter.format(wholeHours)} h ${minutes} min`
    : `${numberFormatter.format(wholeHours)} h`;
}

interface KpiCardProps {
  title: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "slate" | "blue" | "emerald" | "red";
}

const KPI_TONES: Record<KpiCardProps["tone"], string> = {
  slate: "border-slate-200 bg-card text-slate-700 [&_.kpi-icon]:bg-slate-100",
  blue: "border-blue-200 bg-blue-50 text-blue-800 [&_.kpi-icon]:bg-blue-100",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-800 [&_.kpi-icon]:bg-emerald-100",
  red: "border-red-200 bg-red-50 text-red-800 [&_.kpi-icon]:bg-red-100",
};

function KpiCard({ title, value, detail, icon: Icon, tone }: KpiCardProps) {
  return (
    <article
      className={cn(
        "flex min-w-0 items-center gap-4 rounded-xl border px-4 py-4 shadow-sm sm:px-5",
        KPI_TONES[tone],
      )}
    >
      <div className="kpi-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider">
          {title}
        </h3>
        <p className="mt-1 text-3xl font-bold leading-none tabular-nums">
          {numberFormatter.format(normalizeCount(value))}
        </p>
        <p className="mt-1 text-[11px] opacity-80">{detail}</p>
      </div>
    </article>
  );
}

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
                      {numberFormatter.format(item.cantidad)}
                    </strong>{" "}
                    ({decimalFormatter.format(percentage)}%)
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${config.label}: ${numberFormatter.format(item.cantidad)} de ${numberFormatter.format(total)} tickets`}
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
        {numberFormatter.format(normalizedSample)}
        {" de "}
        {numberFormatter.format(normalizedExpected)} tickets finalizados.
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
          Calculado únicamente sobre tickets con fecha de resolución.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {hasMetrics ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Mediana</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatHours(resolution.mediana_horas)}
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Promedio</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatHours(resolution.promedio_horas)}
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
              La cohorte no contiene una muestra con fechas completas.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Muestra: {numberFormatter.format(sample)} tickets
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

function CompliancePanel({
  compliance,
}: {
  compliance: ResumenEquipoCumplimiento;
}) {
  const sample = normalizeCount(compliance.muestra);
  const fulfilled = Math.min(normalizeCount(compliance.cumplidos), sample);
  const percentage = normalizePercentage(compliance.porcentaje);

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Cumplimiento del plazo</h2>
        </div>
        <CardDescription>
          Resoluciones realizadas dentro del plazo vigente.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {sample > 0 && percentage !== null ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {decimalFormatter.format(percentage)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {numberFormatter.format(fulfilled)} de{" "}
                  {numberFormatter.format(sample)} resoluciones
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  percentage >= 80
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800",
                )}
              >
                Muestra: {numberFormatter.format(sample)}
              </Badge>
            </div>
            <Progress
              className="mt-4"
              value={percentage}
              aria-label="Cumplimiento del plazo"
              aria-valuetext={`${decimalFormatter.format(percentage)}%, ${numberFormatter.format(fulfilled)} de ${numberFormatter.format(sample)} resoluciones`}
            />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Muestra auditable: incluye las transiciones de resolución que
              conservaron un plazo verificable. Consultá Calidad de datos para
              interpretar su cobertura histórica.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <ListChecks
              className="mx-auto h-7 w-7 text-slate-300"
              aria-hidden="true"
            />
            <h3 className="mt-2 text-sm font-medium">
              Sin muestra para medir cumplimiento
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              No hay resoluciones con un plazo auditable en este período.
            </p>
          </div>
        )}
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
  tickets_ingresados,
  estado_actual,
  resolucion_con_fecha,
  cumplimiento_plazo_auditable,
  distribucion_estado,
  distribucion_prioridad,
  onClearFilters,
}: ResumenEquipoPanelProps) {
  const total = normalizeCount(estado_actual.total);
  const opened = normalizeCount(estado_actual.abiertos);
  const finished = normalizeCount(estado_actual.finalizados);
  const overdue = normalizeCount(estado_actual.vencidos_abiertos);
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
                Volumen del período, estado actual de la cohorte y cobertura de
                sus indicadores de resolución.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit bg-white text-slate-700">
              {formatRendimientoPeriod(periodo)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <p className="text-xs text-muted-foreground">
            Estado al snapshot del{" "}
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
              La cohorte no contiene tickets para construir un resumen del
              equipo. Probá ampliar el período o quitar filtros.
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
              detail={`de ${numberFormatter.format(total)} en la cohorte`}
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

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="border-b p-5">
                <h2 className="font-semibold">Flujo y estado actual</h2>
                <CardDescription>
                  Lectura exacta de la cohorte por estado y prioridad.
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

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <TimingPanel
                resolution={resolucion_con_fecha}
                expectedSample={finished}
              />
              <CompliancePanel compliance={cumplimiento_plazo_auditable} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
