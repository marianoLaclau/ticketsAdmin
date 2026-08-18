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
import { MetricHelp } from "./MetricHelp";
import {
  formatRendimientoDateTime,
  formatRendimientoPeriod,
  rendimientoNumberFormatter,
} from "./rendimiento-format";

type CoverageKey = keyof RendimientoCoberturasCalidadDatos;

interface CoverageDefinition {
  key: CoverageKey;
  title: string;
  description: string;
  /** Numerador y denominador exactos — más preciso que `description`. */
  tooltip: string;
  icon: LucideIcon;
}

const COVERAGE_DEFINITIONS: readonly CoverageDefinition[] = [
  {
    key: "actor_resolucion",
    title: "Autor de resolución",
    description:
      "Resoluciones con un usuario identificado como responsable del cierre.",
    tooltip:
      "Numerador: resoluciones auditadas con autor_usuario_id registrado. Denominador: total de resoluciones auditadas (con evento de cierre verificado), no el total de tickets. Esta es la cobertura que define el semáforo de arriba.",
    icon: UserCheck,
  },
  {
    key: "fecha_resolucion",
    title: "Fecha de resolución",
    description:
      "Tickets finalizados que conservan la fecha efectiva de resolución.",
    tooltip:
      "Numerador: tickets resueltos o cerrados que conservan su fecha_resolucion. Denominador: total de tickets finalizados (resueltos + cerrados) del conjunto analizado.",
    icon: CalendarCheck2,
  },
  {
    key: "plazo_resolucion",
    title: "Plazo al resolver",
    description:
      "Resoluciones que conservaron el vencimiento vigente para medir cumplimiento.",
    tooltip:
      "Numerador: resoluciones auditadas que conservan el snapshot del vencimiento vigente al momento del cierre. Denominador: total de resoluciones auditadas. Suele ser baja porque el snapshot solo existe desde que se empezó a registrar.",
    icon: Clock3,
  },
  {
    key: "asignacion_estructurada",
    title: "Asignación estructurada",
    description: "Asignaciones vinculadas a un usuario identificado.",
    tooltip:
      "Numerador: tickets con un usuario real (con ID) asignado. Denominador: tickets que tienen algún tipo de asignación, sea usuario real o solo un nombre en texto libre.",
    icon: Link2,
  },
  {
    key: "identidad_contacto",
    title: "Identidad del contacto",
    description:
      "Tickets con DNI, teléfono o email utilizable para detectar contactos recurrentes.",
    tooltip:
      "Numerador: tickets con DNI, teléfono o email en formato utilizable. Denominador: todo el conjunto analizado. Es la base de la que depende la pantalla de Contactos recurrentes.",
    icon: ContactRound,
  },
  {
    key: "fecha_limite",
    title: "Fecha límite",
    description:
      "Tickets con un vencimiento válido para analizar riesgo y cumplimiento del plazo.",
    tooltip:
      "Numerador: tickets con una fecha_limite válida registrada. Denominador: todo el conjunto analizado.",
    icon: CalendarCheck2,
  },
] as const;

const percentageFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
function formatGeneratedAt(value: string, timezone: string): string {
  return formatRendimientoDateTime(value, timezone) ?? "hora no disponible";
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
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold leading-tight text-foreground">
                {definition.title}
              </h3>
              <MetricHelp label={definition.title} text={definition.tooltip} />
            </div>
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
          {rendimientoNumberFormatter.format(coverage.numerador)}
        </span>{" "}
        de {rendimientoNumberFormatter.format(coverage.denominador)} casos con
        el dato disponible
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
  switch (data.comparacion_individual_estado) {
    case "disponible":
      return {
        title: "Datos suficientes",
        description:
          "La información disponible alcanza el umbral definido para calcular estos indicadores.",
        icon: CheckCircle2,
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        iconClassName: "text-emerald-700",
      };
    case "parcial":
      return {
        title: "Datos parciales",
        description:
          "Parte de las finalizaciones no tiene un responsable identificado; los porcentajes usan los casos con datos disponibles.",
        icon: ShieldAlert,
        className: "border-amber-200 bg-amber-50 text-amber-950",
        iconClassName: "text-amber-700",
      };
    default:
      return {
        title: "Datos insuficientes",
        description:
          "La cantidad de datos disponibles es reducida. Interpretá los indicadores con cautela.",
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
    <section
      className="space-y-4"
      aria-labelledby="rendimiento-calidad-heading"
    >
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <DatabaseZap className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h2
                  id="rendimiento-calidad-heading"
                  className="text-lg font-semibold leading-tight tracking-tight text-slate-950 sm:text-xl"
                >
                  Calidad y cobertura
                </h2>
                <CardDescription className="max-w-3xl leading-relaxed">
                  Qué proporción del conjunto analizado puede sostener métricas
                  confiables sin completar ni inferir datos faltantes.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="w-fit shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              Calidad de datos
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
                {rendimientoNumberFormatter.format(data.tickets_evaluados)}
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resoluciones evaluadas
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {rendimientoNumberFormatter.format(data.resoluciones_evaluadas)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Período: {formatRendimientoPeriod(data.periodo)} · Actualizado el{" "}
            {formatGeneratedAt(data.periodo.generado_en, data.periodo.timezone)}
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
              El conjunto analizado no contiene tickets visibles. Probá otro
              período o quitá los filtros de empresa, categoría y prioridad.
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
                  Coberturas del conjunto analizado
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
    </section>
  );
}

export { ComparisonNotice, CoverageCard };
