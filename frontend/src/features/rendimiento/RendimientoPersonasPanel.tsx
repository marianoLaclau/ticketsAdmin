import type {
  RendimientoPersona,
  RendimientoPersonas,
} from "@workspace/api-client-react";
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Inbox,
  Minus,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatRendimientoDateTime,
  formatRendimientoPeriod,
} from "./rendimiento-format";
import {
  calculateOperatorPerformance,
  OPERATOR_PERFORMANCE_CONFIG,
  type OperatorPerformanceResult,
} from "./operator-performance";

interface RendimientoPersonasPanelProps {
  data: RendimientoPersonas;
  onClearFilters: () => void;
}

const numberFormatter = new Intl.NumberFormat("es-AR");
const percentageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

function formatDateTime(value: string, timezone: string): string {
  return formatRendimientoDateTime(value, timezone) ?? "fecha no disponible";
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "Sin muestra";
  }
  if (value < 1) return String(Math.round(value * 60)) + " min";

  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  if (minutes === 60) {
    return numberFormatter.format(wholeHours + 1) + " h";
  }
  return minutes > 0
    ? numberFormatter.format(wholeHours) + " h " + minutes + " min"
    : numberFormatter.format(wholeHours) + " h";
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
  return initials || "U";
}

function pluralize(count: number, singular: string, plural: string): string {
  return (
    numberFormatter.format(count) + " " + (count === 1 ? singular : plural)
  );
}

function SummaryFact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">
        {value}
      </dd>
      <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}

function PersonFact({
  label,
  value,
  details,
  tone = "default",
}: {
  label: string;
  value: string;
  details: readonly string[];
  tone?: "default" | "risk";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-lg font-bold tabular-nums text-foreground",
          tone === "risk" && "text-red-700",
        )}
      >
        {value}
      </dd>
      {details.map((detail) => (
        <dd
          key={detail}
          className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground"
        >
          {detail}
        </dd>
      ))}
    </div>
  );
}

interface PerformancePresentation {
  label: string;
  icon: typeof TrendingUp;
  valueClassName: string;
  trackClassName: string;
  indicatorClassName: string;
}

function getPerformancePresentation(
  performance: OperatorPerformanceResult,
): PerformancePresentation {
  switch (performance.state) {
    case "favorable":
      return {
        label: "Favorable",
        icon: TrendingUp,
        valueClassName: "text-emerald-700",
        trackClassName: "bg-emerald-100",
        indicatorClassName: "bg-emerald-600",
      };
    case "atencion":
      return {
        label: "Requiere atención",
        icon: TrendingDown,
        valueClassName: "text-red-700",
        trackClassName: "bg-red-100",
        indicatorClassName: "bg-red-600",
      };
    case "muestra_inicial":
      return {
        label: "Muestra inicial",
        icon: Minus,
        valueClassName: "text-slate-700",
        trackClassName: "bg-slate-200",
        indicatorClassName: "bg-slate-500",
      };
    default:
      return {
        label: "No disponible",
        icon: Minus,
        valueClassName: "text-slate-600",
        trackClassName: "bg-slate-200",
        indicatorClassName: "bg-slate-400",
      };
  }
}

function OperatorPerformanceFact({ person }: { person: RendimientoPersona }) {
  const performance = calculateOperatorPerformance({
    cumplimiento_plazo: person.cumplimiento_plazo,
    carga_actual: person.carga_actual,
  });
  const presentation = getPerformancePresentation(performance);
  const Icon = presentation.icon;
  const score = performance.score;
  const formattedScore =
    score === null ? "Sin muestra" : percentageFormatter.format(score) + "/100";
  const scoreDescription =
    score === null
      ? "Sin datos suficientes para calcular el indicador"
      : percentageFormatter.format(score) +
        " de 100, " +
        presentation.label.toLocaleLowerCase("es-AR");

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Rendimiento operativo
      </dt>
      <dd className="mt-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-lg font-bold tabular-nums",
            presentation.valueClassName,
          )}
        >
          {formattedScore}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-semibold",
            presentation.valueClassName,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {presentation.label}
        </span>
      </dd>
      <dd className="mt-2">
        {score === null ? (
          <div
            className={cn("h-2 rounded-full", presentation.trackClassName)}
            aria-hidden="true"
          />
        ) : (
          <div
            role="meter"
            aria-label={
              "Índice de rendimiento operativo de " + person.usuario.nombre
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            aria-valuetext={scoreDescription}
            className={cn(
              "h-2 overflow-hidden rounded-full",
              presentation.trackClassName,
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                presentation.indicatorClassName,
              )}
              style={{ width: score + "%" }}
              aria-hidden="true"
            />
          </div>
        )}
      </dd>
      <dd className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {performance.deadlineScore === null
          ? "Sin cierres con plazo medible"
          : "Plazo " +
            percentageFormatter.format(performance.deadlineScore) +
            "% · carga al día " +
            percentageFormatter.format(performance.currentLoadScore) +
            "%"}
      </dd>
      {performance.state === "muestra_inicial" ? (
        <dd className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          Resultado preliminar:{" "}
          {numberFormatter.format(performance.deadlineSample)} de{" "}
          {numberFormatter.format(
            OPERATOR_PERFORMANCE_CONFIG.minimumDeadlineSample,
          )}{" "}
          casos mínimos
        </dd>
      ) : null}
    </div>
  );
}

function PersonRow({ person }: { person: RendimientoPersona }) {
  const time = person.tiempo_resolucion_atribuible;
  const compliance = person.cumplimiento_plazo;
  const workload = person.carga_actual;
  const complianceValue =
    compliance.muestra > 0 && compliance.porcentaje !== null
      ? percentageFormatter.format(compliance.porcentaje) + "%"
      : "Sin muestra";
  const timeValue =
    time.muestra > 0 ? formatHours(time.mediana_horas) : "Sin muestra";

  return (
    <li>
      <article
        className="grid min-w-0 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(190px,0.85fr)_minmax(0,3.15fr)] xl:items-start"
        aria-labelledby={"rendimiento-persona-" + person.usuario.id}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
            aria-hidden="true"
          >
            {getInitials(person.usuario.nombre)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={"rendimiento-persona-" + person.usuario.id}
                className="min-w-0 break-words text-sm font-semibold text-foreground"
              >
                {person.usuario.nombre}
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[10px]",
                  person.usuario.activo
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-slate-100 text-slate-700",
                )}
              >
                {person.usuario.activo ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {person.usuario.rol}
            </p>
          </div>
        </div>

        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <PersonFact
            label="Tickets con finalización"
            value={numberFormatter.format(person.tickets_resueltos)}
            details={[
              pluralize(
                person.resoluciones_atribuidas,
                "finalización registrada",
                "finalizaciones registradas",
              ),
            ]}
          />
          <PersonFact
            label="Tiempo hasta finalizar"
            value={timeValue}
            details={
              time.muestra > 0
                ? [
                    "Mediana · promedio " + formatHours(time.promedio_horas),
                    "Muestra: " +
                      pluralize(time.muestra, "finalización", "finalizaciones"),
                  ]
                : ["Sin finalizaciones con duración válida"]
            }
          />
          <PersonFact
            label="Dentro del plazo"
            value={complianceValue}
            details={
              compliance.muestra > 0
                ? [
                    numberFormatter.format(compliance.cumplidos) +
                      " de " +
                      numberFormatter.format(compliance.muestra) +
                      " resoluciones",
                    "Muestra: " + numberFormatter.format(compliance.muestra),
                  ]
                : ["Sin resoluciones con plazo verificable"]
            }
          />
          <PersonFact
            label="Carga actual"
            value={pluralize(
              workload.abiertos_asignados,
              "abierto",
              "abiertos",
            )}
            details={[
              workload.vencidos_asignados > 0
                ? pluralize(workload.vencidos_asignados, "vencido", "vencidos")
                : "Sin vencidos",
              "Asignación actual",
            ]}
            tone={workload.vencidos_asignados > 0 ? "risk" : "default"}
          />
          <OperatorPerformanceFact person={person} />
        </dl>
      </article>
    </li>
  );
}

const INITIAL_VISIBLE_OPERATORS = 3;

function PeopleList({ people }: { people: readonly RendimientoPersona[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasMore = people.length > INITIAL_VISIBLE_OPERATORS;
  const visiblePeople = expanded
    ? people
    : people.slice(0, INITIAL_VISIBLE_OPERATORS);
  const hiddenCount = people.length - INITIAL_VISIBLE_OPERATORS;

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Actividad por operador</h2>
            </div>
            <CardDescription className="mt-1 max-w-3xl leading-relaxed">
              Volumen, tiempos, cumplimiento y carga actual presentados por
              nombre. Cada indicador conserva su propia muestra.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="w-fit shrink-0 bg-slate-50 text-slate-700"
          >
            Orden alfabético A–Z
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          id={listId}
          role={expanded ? "region" : undefined}
          aria-label={expanded ? "Lista ampliada de operadores" : undefined}
          tabIndex={expanded ? 0 : undefined}
          className={cn(
            expanded &&
              "scroll-sutil max-h-[680px] overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          )}
        >
          <ul className="divide-y divide-slate-100">
            {visiblePeople.map((person) => (
              <PersonRow key={person.usuario.id} person={person} />
            ))}
          </ul>
        </div>
        {hasMore ? (
          <div className="border-t border-slate-100 px-4 py-3 text-center sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <ChevronUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {expanded
                ? "Mostrar solo 3 operadores"
                : `Ver ${numberFormatter.format(hiddenCount)} ${
                    hiddenCount === 1 ? "operador más" : "operadores más"
                  }`}
            </Button>
          </div>
        ) : null}
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
          <Gauge
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p>
            El rendimiento operativo pondera{" "}
            {OPERATOR_PERFORMANCE_CONFIG.deadlineWeightPercentage}% el
            cumplimiento del plazo y{" "}
            {OPERATOR_PERFORMANCE_CONFIG.currentLoadWeightPercentage}% la carga
            abierta sin vencer. Desde{" "}
            {OPERATOR_PERFORMANCE_CONFIG.favorableScore} puntos se muestra
            favorable; con menos de{" "}
            {OPERATOR_PERFORMANCE_CONFIG.minimumDeadlineSample} cierres
            permanece neutral.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RendimientoPersonasPanel({
  data,
  onClearFilters,
}: RendimientoPersonasPanelProps) {
  const coveragePercentage =
    data.cobertura.porcentaje_atribucion === null
      ? "Sin muestra"
      : percentageFormatter.format(data.cobertura.porcentaje_atribucion) + "%";

  return (
    <section
      className="space-y-4"
      aria-labelledby="rendimiento-personas-heading"
    >
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="rendimiento-personas-heading"
                  className="text-lg font-semibold tracking-tight sm:text-xl"
                >
                  Rendimiento individual
                </h2>
                <CardDescription className="mt-1 max-w-3xl leading-relaxed">
                  Finalizaciones, tiempos, cumplimiento del plazo y carga actual
                  por operador.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="w-fit shrink-0 bg-white">
              {formatRendimientoPeriod(data.periodo)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryFact
              label="Tickets evaluados"
              value={numberFormatter.format(data.tickets_evaluados)}
              detail="conjunto analizado con los filtros actuales"
            />
            <SummaryFact
              label="Finalizaciones analizadas"
              value={numberFormatter.format(
                data.cobertura.resoluciones_evaluadas,
              )}
              detail="cierres y resoluciones del conjunto analizado"
            />
            <SummaryFact
              label="Finalizaciones atribuidas"
              value={numberFormatter.format(
                data.cobertura.resoluciones_atribuidas,
              )}
              detail={coveragePercentage + " con autor identificado"}
            />
            <SummaryFact
              label="Operadores informados"
              value={numberFormatter.format(data.personas.length)}
              detail="usuarios activos e inactivos"
            />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Actualizado el{" "}
            {formatDateTime(data.periodo.generado_en, data.periodo.timezone)}.
            Los tiempos miden horas corridas desde la creación del ticket, no
            tiempo exclusivo de trabajo.
          </p>
        </CardContent>
      </Card>

      {data.tickets_evaluados === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center px-5 py-12 text-center">
            <Inbox className="h-9 w-9 text-slate-300" aria-hidden="true" />
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
          {data.personas.length > 0 ? (
            <PeopleList people={data.personas} />
          ) : (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center px-5 py-10 text-center">
                <UsersRound
                  className="h-8 w-8 text-slate-300"
                  aria-hidden="true"
                />
                <h3 className="mt-3 text-base font-semibold">
                  No hay operadores registrados
                </h3>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  Existen tickets en el conjunto analizado, pero no hay usuarios
                  persistidos para presentar actividad individual.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
