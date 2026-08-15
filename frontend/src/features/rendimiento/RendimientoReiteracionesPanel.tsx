import type { RendimientoReiteraciones } from "@workspace/api-client-react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Repeat2,
  ShieldCheck,
  UserRoundCheck,
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
  formatRendimientoPeriod,
  rendimientoNumberFormatter,
} from "./rendimiento-format";
import { ContactsList } from "./ReiteracionesContactos";
import { formatDateTime, percentageFormatter } from "./reiteraciones-format";

interface RendimientoReiteracionesPanelProps {
  data: RendimientoReiteraciones;
  onClearFilters: () => void;
  isPageLoading?: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}

function SummaryFact({
  title,
  value,
  detail,
  tone = "default",
}: {
  title: string;
  value: number;
  detail: string;
  tone?: "default" | "risk";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "risk"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-slate-200 bg-slate-50 text-foreground",
      )}
    >
      <dt className="text-[11px] font-semibold uppercase tracking-wider opacity-75">
        {title}
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">
        {rendimientoNumberFormatter.format(value)}
      </dd>
      <dd className="mt-1 text-xs leading-relaxed opacity-75">{detail}</dd>
    </div>
  );
}

function CoverageNotice({ data }: { data: RendimientoReiteraciones }) {
  const identity = data.cobertura.identidad_utilizable;
  const percentage =
    identity.porcentaje === null
      ? "Sin muestra"
      : `${percentageFormatter.format(identity.porcentaje)}%`;

  return (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950"
      aria-labelledby="rendimiento-reiteraciones-cobertura-heading"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-blue-700"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3
            id="rendimiento-reiteraciones-cobertura-heading"
            className="font-semibold"
          >
            Cobertura de identidad
          </h3>
          <p className="mt-1 text-sm leading-relaxed">
            {rendimientoNumberFormatter.format(identity.numerador)} de{" "}
            {rendimientoNumberFormatter.format(identity.denominador)} tickets tienen DNI,
            teléfono o email utilizable ({percentage}).
          </p>
          <p className="mt-2 text-xs leading-relaxed text-blue-900">
            Las coincidencias usan una clave canónica con precedencia DNI,
            teléfono y email. Son una señal operativa, no una confirmación de
            identidad civil ni de falta de respuesta.
          </p>
          {data.cobertura.ambiguos_detectados > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-900">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {rendimientoNumberFormatter.format(data.cobertura.ambiguos_detectados)}{" "}
              {data.cobertura.ambiguos_detectados === 1
                ? "ticket ambiguo se mantuvo separado"
                : "tickets ambiguos se mantuvieron separados"}{" "}
              para evitar uniones incorrectas.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RepetitionsPagination({
  data,
  isLoading,
  onPreviousPage,
  onNextPage,
}: {
  data: RendimientoReiteraciones;
  isLoading: boolean;
  onPreviousPage: (() => void) | undefined;
  onNextPage: (() => void) | undefined;
}) {
  if (data.resumen.contactos_reiterados === 0 || data.total_paginas === 0) {
    return null;
  }

  const firstResult = (data.pagina - 1) * data.limite + 1;
  const lastResult = Math.min(
    data.pagina * data.limite,
    data.resumen.contactos_reiterados,
  );
  const pageIsInRange = data.pagina <= data.total_paginas;

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row"
      aria-label="Paginación de contactos recurrentes"
      aria-busy={isLoading}
    >
      <p
        className="text-center text-xs leading-relaxed text-muted-foreground sm:text-left"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="font-semibold text-foreground">
          Página {rendimientoNumberFormatter.format(data.pagina)} de{" "}
          {rendimientoNumberFormatter.format(data.total_paginas)}
        </span>
        {pageIsInRange ? (
          <>
            {" "}
            · Contactos {rendimientoNumberFormatter.format(firstResult)}–
            {rendimientoNumberFormatter.format(lastResult)} de{" "}
            {rendimientoNumberFormatter.format(data.resumen.contactos_reiterados)}
          </>
        ) : null}
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 bg-white sm:flex-none"
          disabled={isLoading || data.pagina <= 1 || !onPreviousPage}
          onClick={onPreviousPage}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 bg-white sm:flex-none"
          disabled={
            isLoading || data.pagina >= data.total_paginas || !onNextPage
          }
          onClick={onNextPage}
        >
          Siguiente
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

function NoResultsState({
  title,
  description,
  onClearFilters,
}: {
  title: string;
  description: string;
  onClearFilters?: () => void;
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center px-5 py-12 text-center">
        <Inbox className="h-9 w-9 text-slate-300" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold">{title}</h3>
        <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {onClearFilters ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={onClearFilters}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RendimientoReiteracionesPanel({
  data,
  onClearFilters,
  isPageLoading = false,
  onPreviousPage,
  onNextPage,
}: RendimientoReiteracionesPanelProps) {
  const identity = data.cobertura.identidad_utilizable;

  return (
    <section
      className="space-y-4"
      aria-labelledby="rendimiento-reiteraciones-heading"
    >
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Repeat2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="rendimiento-reiteraciones-heading"
                  className="text-lg font-semibold tracking-tight sm:text-xl"
                >
                  Contactos recurrentes
                </h2>
                <CardDescription className="mt-1 max-w-3xl leading-relaxed">
                  Coincidencias operativas con múltiples llamados y al menos una
                  gestión todavía abierta, ordenadas por riesgo.
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
              title="Contactos recurrentes"
              value={data.resumen.contactos_reiterados}
              detail="grupos con al menos un ticket abierto"
            />
            <SummaryFact
              title="Tickets involucrados"
              value={data.resumen.tickets_involucrados}
              detail={`de ${rendimientoNumberFormatter.format(data.tickets_evaluados)} evaluados`}
            />
            <SummaryFact
              title="Tickets abiertos"
              value={data.resumen.abiertos}
              detail="requieren seguimiento actual"
            />
            <SummaryFact
              title="Vencidos abiertos"
              value={data.resumen.vencidos_abiertos}
              detail="requieren atención prioritaria"
              tone={data.resumen.vencidos_abiertos > 0 ? "risk" : "default"}
            />
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <CalendarClock
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              Actualizado el{" "}
              {formatDateTime(data.periodo.generado_en, data.periodo.timezone)}.
              El estado, responsable, prioridad y vencimiento son actuales.
            </span>
          </p>
        </CardContent>
      </Card>

      {data.tickets_evaluados === 0 ? (
        <NoResultsState
          title="No hay datos para estos filtros"
          description="El conjunto analizado no contiene tickets visibles. Probá otro período o quitá los filtros de empresa, categoría y prioridad."
          onClearFilters={onClearFilters}
        />
      ) : identity.numerador === 0 ? (
        <>
          <CoverageNotice data={data} />
          <NoResultsState
            title="No hay identidad utilizable"
            description="Los tickets del período no contienen un DNI, teléfono o email válido para detectar coincidencias sin usar el nombre como supuesto."
          />
        </>
      ) : data.resumen.contactos_reiterados === 0 ? (
        <>
          <CoverageNotice data={data} />
          <NoResultsState
            title="No se detectaron contactos recurrentes con gestiones abiertas"
            description="Hay tickets identificables, pero ningún grupo reúne al menos dos llamados y conserva un ticket actualmente abierto."
          />
        </>
      ) : data.contactos.length === 0 ? (
        <>
          <CoverageNotice data={data} />
          <NoResultsState
            title="Esta página no contiene contactos"
            description="La página solicitada quedó fuera del rango disponible. Volvé a la página anterior para continuar revisando los casos."
          />
          <RepetitionsPagination
            data={data}
            isLoading={isPageLoading}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </>
      ) : (
        <>
          <CoverageNotice data={data} />
          <section aria-labelledby="rendimiento-reiteraciones-listado-heading">
            <div className="mb-3 flex items-start gap-2">
              <UserRoundCheck
                className="mt-0.5 h-4 w-4 text-primary"
                aria-hidden="true"
              />
              <div>
                <h2
                  id="rendimiento-reiteraciones-listado-heading"
                  className="text-base font-semibold"
                >
                  Casos que necesitan seguimiento
                </h2>
                <p className="text-sm text-muted-foreground">
                  Nombre, llamados y estado actual en una vista compacta. Abrí
                  los detalles para consultar fechas, responsables y tickets; el
                  orden prioriza vencimiento, prioridad y antigüedad.
                </p>
              </div>
            </div>
            <ContactsList
              contacts={data.contactos}
              timezone={data.periodo.timezone}
            />
          </section>
          <RepetitionsPagination
            data={data}
            isLoading={isPageLoading}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </>
      )}
    </section>
  );
}
