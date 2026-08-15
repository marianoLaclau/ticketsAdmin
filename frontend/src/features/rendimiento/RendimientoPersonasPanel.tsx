import type { RendimientoPersonas } from "@workspace/api-client-react";
import { Inbox, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  formatRendimientoPeriod,
  rendimientoNumberFormatter,
} from "./rendimiento-format";
import { formatDateTime, percentageFormatter } from "./personas-format";
import { PeopleList } from "./PersonasList";

interface RendimientoPersonasPanelProps {
  data: RendimientoPersonas;
  onClearFilters: () => void;
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
              value={rendimientoNumberFormatter.format(data.tickets_evaluados)}
              detail="conjunto analizado con los filtros actuales"
            />
            <SummaryFact
              label="Finalizaciones analizadas"
              value={rendimientoNumberFormatter.format(
                data.cobertura.resoluciones_evaluadas,
              )}
              detail="cierres y resoluciones del conjunto analizado"
            />
            <SummaryFact
              label="Finalizaciones atribuidas"
              value={rendimientoNumberFormatter.format(
                data.cobertura.resoluciones_atribuidas,
              )}
              detail={coveragePercentage + " con autor identificado"}
            />
            <SummaryFact
              label="Operadores informados"
              value={rendimientoNumberFormatter.format(data.personas.length)}
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
