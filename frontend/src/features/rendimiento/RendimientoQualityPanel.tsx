import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ContactRound,
  DatabaseZap,
  Link2,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import type {
  RendimientoCalidadDatos,
  RendimientoCoberturasCalidadDatos,
  RendimientoProporcion,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { RENDIMIENTO_TIME_ZONE } from "./rendimiento-query";

type CoverageKey = keyof RendimientoCoberturasCalidadDatos;

interface CoverageDefinition {
  key: CoverageKey;
  title: string;
  description: string;
  icon: LucideIcon;
}

const COVERAGE_DEFINITIONS: readonly CoverageDefinition[] = [
  {
    key: "actor_resolucion",
    title: "Autor de resolución",
    description:
      "Resoluciones cuyo historial identifica al usuario que finalizó el ticket.",
    icon: UserCheck,
  },
  {
    key: "fecha_resolucion",
    title: "Fecha de resolución",
    description:
      "Tickets finalizados que conservan la fecha efectiva de resolución.",
    icon: CalendarCheck2,
  },
  {
    key: "plazo_resolucion",
    title: "Plazo al resolver",
    description:
      "Resoluciones que conservaron el vencimiento vigente para medir cumplimiento.",
    icon: Clock3,
  },
  {
    key: "asignacion_estructurada",
    title: "Asignación estructurada",
    description:
      "Asignaciones vinculadas a un usuario identificable y no solo a texto histórico.",
    icon: Link2,
  },
  {
    key: "identidad_contacto",
    title: "Identidad del contacto",
    description:
      "Tickets con DNI, teléfono o email utilizable para detectar reiteraciones.",
    icon: ContactRound,
  },
  {
    key: "fecha_limite",
    title: "Fecha límite",
    description:
      "Tickets con un vencimiento válido para analizar riesgo y cumplimiento del plazo.",
    icon: CalendarCheck2,
  },
] as const;

const numberFormatter = new Intl.NumberFormat("es-AR");
const percentageFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const generatedAtFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: RENDIMIENTO_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCalendarDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatPeriod(data: RendimientoCalidadDatos): string {
  const from = formatCalendarDate(data.periodo.fecha_desde);
  const to = formatCalendarDate(data.periodo.fecha_hasta);
  if (from && to) return `${from} al ${to}`;
  if (from) return `Desde ${from}`;
  if (to) return `Hasta ${to}`;
  return "Todo el historial";
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "hora no disponible"
    : generatedAtFormatter.format(date);
}

function formatAttributionStart(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : generatedAtFormatter.format(date);
}

function CoverageCard({
  definition,
  coverage,
}: {
  definition: CoverageDefinition;
  coverage: RendimientoProporcion;
}) {
  const Icon = definition.icon;
  const percentageLabel =
    coverage.porcentaje === null
      ? "Sin muestra"
      : `${percentageFormatter.format(coverage.porcentaje)}%`;
  const descriptionId = `rendimiento-cobertura-${definition.key}-descripcion`;

  return (
    <article
      className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      aria-describedby={descriptionId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight text-foreground">
              {definition.title}
            </h3>
            <p
              id={descriptionId}
              className="mt-1 text-xs leading-relaxed text-muted-foreground"
            >
              {definition.description}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-lg font-bold tabular-nums text-foreground">
          {percentageLabel}
        </span>
      </div>

      <Progress
        className="mt-4"
        value={coverage.porcentaje ?? 0}
        aria-label={`Cobertura de ${definition.title}`}
        aria-valuetext={percentageLabel}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">
          {numberFormatter.format(coverage.numerador)}
        </span>{" "}
        de {numberFormatter.format(coverage.denominador)} casos con el dato
        disponible
      </p>
    </article>
  );
}

interface ComparisonNoticeConfig {
  title: string;
  description: string;
  icon: LucideIcon;
  className: string;
  iconClassName: string;
}

function getComparisonNoticeConfig(
  data: RendimientoCalidadDatos,
): ComparisonNoticeConfig {
  const attributionStart = formatAttributionStart(data.atribucion_desde);
  const historicalContext = attributionStart
    ? ` La atribución estructurada se observa desde ${attributionStart}.`
    : " Todavía no hay una resolución con autor estructurado en esta cohorte.";

  switch (data.comparacion_individual_estado) {
    case "disponible":
      return {
        title: "Comparación individual disponible",
        description:
          "La muestra y la atribución alcanzan el umbral auditable definido por el servidor." +
          historicalContext,
        icon: CheckCircle2,
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        iconClassName: "text-emerald-700",
      };
    case "parcial":
      return {
        title: "Comparación individual con cobertura parcial",
        description:
          "Los indicadores por persona deben interpretarse con cautela porque parte de las resoluciones no tiene autor estructurado." +
          historicalContext,
        icon: ShieldAlert,
        className: "border-amber-200 bg-amber-50 text-amber-950",
        iconClassName: "text-amber-700",
      };
    default:
      return {
        title: "Comparación individual no disponible",
        description:
          "La muestra o la cobertura de autoría todavía no permite comparar personas sin inducir conclusiones incompletas." +
          historicalContext,
        icon: CircleAlert,
        className: "border-red-200 bg-red-50 text-red-950",
        iconClassName: "text-red-700",
      };
  }
}

function ComparisonNotice({ data }: { data: RendimientoCalidadDatos }) {
  const config = getComparisonNoticeConfig(data);
  const Icon = config.icon;

  return (
    <section
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        config.className,
      )}
      aria-labelledby="rendimiento-comparacion-estado"
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconClassName)}
        aria-hidden="true"
      />
      <div>
        <h3 id="rendimiento-comparacion-estado" className="font-semibold">
          {config.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed">{config.description}</p>
      </div>
    </section>
  );
}

interface RendimientoQualityPanelProps {
  data: RendimientoCalidadDatos;
  onClearFilters: () => void;
}

export function RendimientoQualityPanel({
  data,
  onClearFilters,
}: RendimientoQualityPanelProps) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <DatabaseZap className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h2 className="text-lg font-semibold leading-tight tracking-tight text-slate-950 sm:text-xl">
                  Calidad y cobertura
                </h2>
                <CardDescription className="max-w-3xl leading-relaxed">
                  Qué proporción de la cohorte puede sostener métricas
                  auditables sin completar ni inferir datos faltantes.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="w-fit shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              Datos auditados
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tickets evaluados
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {numberFormatter.format(data.tickets_evaluados)}
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resoluciones evaluadas
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {numberFormatter.format(data.resoluciones_evaluadas)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Período: {formatPeriod(data)} · Snapshot generado el{" "}
            {formatGeneratedAt(data.periodo.generado_en)}
          </p>
        </CardContent>
      </Card>

      {data.tickets_evaluados === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center px-5 py-12 text-center">
            <DatabaseZap
              className="h-9 w-9 text-slate-300"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">
              No hay datos para estos filtros
            </h3>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              La cohorte no contiene tickets visibles. Probá otro período o
              quitá los filtros de empresa, categoría y prioridad.
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
          <ComparisonNotice data={data} />

          <section aria-labelledby="rendimiento-coberturas-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="rendimiento-coberturas-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Coberturas de la cohorte
                </h2>
                <p className="text-sm text-muted-foreground">
                  Cada indicador muestra su propia base evaluada.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {COVERAGE_DEFINITIONS.map((definition) => (
                <CoverageCard
                  key={definition.key}
                  definition={definition}
                  coverage={data.coberturas[definition.key]}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export { ComparisonNotice, CoverageCard };
