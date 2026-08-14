import type {
  RendimientoPersona,
  RendimientoPersonas,
  RendimientoPersonasCoberturaComparacionIndividualEstado,
} from "@workspace/api-client-react";
import {
  CheckCircle2,
  CircleAlert,
  Inbox,
  RotateCcw,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
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

interface CoverageConfig {
  title: string;
  description: string;
  icon: typeof CheckCircle2;
  className: string;
  iconClassName: string;
}

function getCoverageConfig(
  status: RendimientoPersonasCoberturaComparacionIndividualEstado,
): CoverageConfig {
  switch (status) {
    case "disponible":
      return {
        title: "Cobertura global disponible",
        description:
          "La autoría global alcanza el umbral auditable. Las muestras individuales siguen siendo descriptivas y no forman una clasificación.",
        icon: CheckCircle2,
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
        iconClassName: "text-emerald-700",
      };
    case "parcial":
      return {
        title: "Cobertura global parcial",
        description:
          "Parte de las resoluciones no tiene un autor estructurado. Los hechos se muestran en orden alfabético, con sus muestras y sin comparaciones de desempeño.",
        icon: ShieldAlert,
        className: "border-amber-200 bg-amber-50 text-amber-950",
        iconClassName: "text-amber-700",
      };
    default:
      return {
        title: "Cobertura insuficiente para comparar",
        description:
          "La muestra global no permite comparar operadores de forma responsable. Se conservan visibles los hechos descriptivos y la carga actual, siempre con sus muestras.",
        icon: CircleAlert,
        className: "border-slate-300 bg-slate-50 text-slate-950",
        iconClassName: "text-slate-600",
      };
  }
}

function CoverageNotice({ data }: { data: RendimientoPersonas }) {
  const coverage = data.cobertura;
  const config = getCoverageConfig(coverage.comparacion_individual_estado);
  const Icon = config.icon;
  const percentage =
    coverage.porcentaje_atribucion === null
      ? "Sin muestra"
      : percentageFormatter.format(coverage.porcentaje_atribucion) + "%";
  const attributionContext = coverage.atribucion_desde
    ? " Primera atribución del conjunto analizado: " +
      formatDateTime(coverage.atribucion_desde, data.periodo.timezone) +
      "."
    : " Todavía no hay una resolución con autor estructurado en el conjunto analizado.";

  return (
    <section
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        config.className,
      )}
      aria-labelledby="rendimiento-personas-cobertura-heading"
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconClassName)}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <h3
          id="rendimiento-personas-cobertura-heading"
          className="font-semibold"
        >
          {config.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed">{config.description}</p>
        <p className="mt-2 text-xs leading-relaxed">
          Autor identificado en{" "}
          <strong>
            {numberFormatter.format(coverage.resoluciones_atribuidas)} de{" "}
            {numberFormatter.format(coverage.resoluciones_evaluadas)}
          </strong>{" "}
          resoluciones ({percentage}).{attributionContext}
        </p>
      </div>
    </section>
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

function PersonRow({ person }: { person: RendimientoPersona }) {
  const time = person.tiempo_resolucion_atribuible;
  const compliance = person.cumplimiento_plazo_auditable;
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
            label="Tickets resueltos"
            value={numberFormatter.format(person.tickets_resueltos)}
            details={[
              pluralize(
                person.resoluciones_atribuidas,
                "resolución atribuible",
                "resoluciones atribuibles",
              ),
            ]}
          />
          <PersonFact
            label="Tiempo hasta resolver"
            value={timeValue}
            details={
              time.muestra > 0
                ? [
                    "Mediana · promedio " + formatHours(time.promedio_horas),
                    "Muestra: " +
                      pluralize(time.muestra, "resolución", "resoluciones"),
                  ]
                : ["Sin resoluciones con duración válida"]
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
                    "Muestra auditable: " +
                      numberFormatter.format(compliance.muestra),
                  ]
                : ["Sin resoluciones con plazo auditable"]
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
              "Asignación al snapshot actual",
            ]}
            tone={workload.vencidos_asignados > 0 ? "risk" : "default"}
          />
          <PersonFact
            label="Resoluciones reabiertas"
            value={numberFormatter.format(person.resoluciones_reabiertas)}
            details={[
              "de " +
                pluralize(
                  person.resoluciones_atribuidas,
                  "resolución atribuible",
                  "resoluciones atribuibles",
                ),
            ]}
          />
        </dl>
      </article>
    </li>
  );
}

function PeopleList({ people }: { people: readonly RendimientoPersona[] }) {
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
              Hechos auditables presentados por nombre. Cada indicador conserva
              su propia muestra y no se combina en un puntaje.
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
        <ul className="divide-y divide-slate-100">
          {people.map((person) => (
            <PersonRow key={person.usuario.id} person={person} />
          ))}
        </ul>
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          <p
            id="rendimiento-reaperturas-contexto"
            className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
          >
            <RotateCcw
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            Resoluciones reabiertas describe qué ocurrió después de una
            resolución; no atribuye la acción de reabrir ni implica por sí sola
            una evaluación negativa.
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
                  Resoluciones atribuibles, tiempos, cumplimiento y carga actual
                  por operador, sin completar datos faltantes ni construir
                  clasificaciones.
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
              label="Resoluciones verificadas"
              value={numberFormatter.format(
                data.cobertura.resoluciones_evaluadas,
              )}
              detail="transiciones de un estado abierto a uno final"
            />
            <SummaryFact
              label="Resoluciones atribuidas"
              value={numberFormatter.format(
                data.cobertura.resoluciones_atribuidas,
              )}
              detail={coveragePercentage + " con autor identificado"}
            />
            <SummaryFact
              label="Operadores informados"
              value={numberFormatter.format(data.personas.length)}
              detail="usuarios persistidos, activos o inactivos"
            />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Snapshot generado el{" "}
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
          <CoverageNotice data={data} />
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
