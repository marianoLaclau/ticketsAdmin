import { useId, useState } from "react";
import type {
  RendimientoReiteracionContacto,
  RendimientoReiteracionTicket,
  RendimientoReiteraciones,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Inbox,
  Repeat2,
  ShieldCheck,
  TicketCheck,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { getMotivoCategoriaConfig } from "@/lib/motivos";
import { cn } from "@/lib/utils";
import { EstadoBadge, PrioridadBadge } from "@/lib/utils-tickets";
import {
  formatRendimientoDateTime,
  formatRendimientoPeriod,
} from "./rendimiento-format";

interface RendimientoReiteracionesPanelProps {
  data: RendimientoReiteraciones;
  onClearFilters: () => void;
  isPageLoading?: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}

const INITIAL_VISIBLE_TICKETS = 3;
const INITIAL_VISIBLE_CONTACTS = 3;
const numberFormatter = new Intl.NumberFormat("es-AR");
const percentageFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

function formatDateTime(value: string, timezone: string): string {
  return (
    formatRendimientoDateTime(value, timezone, "short") ?? "Fecha no disponible"
  );
}

function formatAge(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) {
    return "No disponible";
  }
  if (hours < 1) return "Menos de 1 hora";

  const wholeHours = Math.floor(hours);
  const days = Math.floor(wholeHours / 24);
  const remainingHours = wholeHours % 24;
  if (days === 0) return `${numberFormatter.format(wholeHours)} h`;
  if (remainingHours === 0) {
    return `${numberFormatter.format(days)} ${days === 1 ? "día" : "días"}`;
  }
  return `${numberFormatter.format(days)} ${days === 1 ? "día" : "días"} ${remainingHours} h`;
}

function matchTypeLabel(type: string): string {
  switch (type) {
    case "dni":
      return "DNI";
    case "telefono":
      return "Teléfono";
    case "email":
      return "Email";
    default:
      return "Identificador";
  }
}

// Firma estable basada únicamente en ids públicos de tickets. Conserva el
// estado expandido si el servidor reordena los grupos por riesgo, sin depender
// del grupo_id opaco ni de la posición del contacto.
export function buildRepetitionContactTicketSignature(
  contact: Pick<RendimientoReiteracionContacto, "tickets">,
): string {
  return [...contact.tickets]
    .map(({ id }) => id)
    .sort((left, right) => left - right)
    .join("-");
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
        {numberFormatter.format(value)}
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
            {numberFormatter.format(identity.numerador)} de{" "}
            {numberFormatter.format(identity.denominador)} tickets tienen DNI,
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
              {numberFormatter.format(data.cobertura.ambiguos_detectados)}{" "}
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

function TicketRow({
  ticket,
  contactName,
  timezone,
}: {
  ticket: RendimientoReiteracionTicket;
  contactName: string;
  timezone: string;
}) {
  const category = getMotivoCategoriaConfig(ticket.motivo_categoria);
  const assigned = ticket.asignado_a?.trim() || "Sin asignar";

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(150px,0.85fr)_minmax(190px,1fr)_minmax(130px,0.7fr)_minmax(140px,0.8fr)] lg:items-center">
        <div className="min-w-0">
          <Link
            href={`/tickets/${ticket.id}`}
            className="inline-flex rounded-sm text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={`Abrir ticket #${ticket.id} de ${contactName}`}
          >
            Ticket #{ticket.id}
          </Link>
          <time
            dateTime={ticket.fecha_creacion}
            className="mt-1 block text-xs tabular-nums text-muted-foreground"
          >
            {formatDateTime(ticket.fecha_creacion, timezone)}
          </time>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <EstadoBadge estado={ticket.estado} />
          <PrioridadBadge prioridad={ticket.prioridad} />
          {ticket.vencido ? (
            <Badge
              variant="outline"
              className="border-red-200 bg-red-50 text-red-700"
            >
              Vencido
            </Badge>
          ) : null}
        </div>

        <span
          className={cn(
            "w-fit max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold",
            category.badgeClass,
          )}
          title={category.label}
        >
          {category.label}
        </span>

        <div className="min-w-0 text-xs text-muted-foreground">
          <p className="truncate" title={assigned}>
            Responsable:{" "}
            <span className="font-medium text-foreground">{assigned}</span>
          </p>
          <p className="mt-1 tabular-nums">
            Plazo:{" "}
            {ticket.fecha_limite
              ? formatDateTime(ticket.fecha_limite, timezone)
              : "No informado"}
          </p>
        </div>
      </div>
    </li>
  );
}

function ContactCard({
  contact,
  signature,
  timezone,
}: {
  contact: RendimientoReiteracionContacto;
  signature: string;
  timezone: string;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [ticketsExpanded, setTicketsExpanded] = useState(false);
  const headingId = `rendimiento-reiteracion-contacto-${signature}`;
  const detailsId = `rendimiento-reiteracion-detalles-${signature}`;
  const ticketsId = `rendimiento-reiteracion-tickets-${signature}`;
  const hasMore = contact.tickets.length > INITIAL_VISIBLE_TICKETS;
  const visibleTickets = ticketsExpanded
    ? contact.tickets
    : contact.tickets.slice(0, INITIAL_VISIBLE_TICKETS);
  const hiddenCount = contact.tickets.length - INITIAL_VISIBLE_TICKETS;
  const primaryResponsible = contact.responsables[0];
  const additionalResponsibleCount = Math.max(
    0,
    contact.responsables.length - 1,
  );
  const responsibleSummary = primaryResponsible
    ? `${primaryResponsible.nombre}${
        additionalResponsibleCount > 0
          ? ` +${numberFormatter.format(additionalResponsibleCount)}`
          : ""
      }`
    : "Sin asignar";

  return (
    <article
      className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm"
      aria-labelledby={headingId}
    >
      <div
        className={cn(
          "bg-slate-50/70 p-4 sm:p-5",
          detailsExpanded && "border-b border-slate-100",
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 md:items-center xl:grid-cols-[minmax(220px,1.1fr)_minmax(300px,1.35fr)_minmax(250px,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={headingId}
                className="min-w-0 break-words text-base font-semibold text-foreground"
              >
                {contact.nombre_referencia}
              </h3>
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-800"
              >
                Coincidencia por {matchTypeLabel(contact.coincidencia.tipo)}
              </Badge>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {contact.coincidencia.valor_enmascarado}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap gap-2">
            <Badge variant="secondary">
              {numberFormatter.format(contact.cantidad_llamados)} llamados
            </Badge>
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-800"
            >
              {numberFormatter.format(contact.abiertos)}{" "}
              {contact.abiertos === 1 ? "abierto" : "abiertos"}
            </Badge>
            {contact.vencidos_abiertos > 0 ? (
              <Badge
                variant="outline"
                className="border-red-200 bg-red-50 text-red-700"
              >
                {numberFormatter.format(contact.vencidos_abiertos)}{" "}
                {contact.vencidos_abiertos === 1 ? "vencido" : "vencidos"}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Sin vencidos
              </Badge>
            )}
            <PrioridadBadge prioridad={contact.prioridad_maxima} />
          </div>

          <dl className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Último llamado
              </dt>
              <dd className="mt-0.5 truncate text-xs font-medium tabular-nums text-foreground">
                <time dateTime={contact.ultimo_contacto}>
                  {formatDateTime(contact.ultimo_contacto, timezone)}
                </time>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Responsable actual
              </dt>
              <dd
                className="mt-0.5 truncate text-xs font-medium text-foreground"
                title={contact.responsables
                  .map((responsible) => responsible.nombre)
                  .join(", ")}
              >
                {responsibleSummary}
              </dd>
            </div>
          </dl>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full shrink-0 bg-white md:w-auto md:justify-self-end"
            aria-expanded={detailsExpanded}
            aria-controls={detailsId}
            aria-label={`${detailsExpanded ? "Ocultar" : "Ver"} detalles de ${contact.nombre_referencia}`}
            onClick={() => setDetailsExpanded((current) => !current)}
          >
            {detailsExpanded ? (
              <ChevronUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {detailsExpanded ? "Ocultar detalles" : "Ver detalles"}
          </Button>
        </div>
      </div>

      <div
        id={detailsId}
        className="space-y-4 p-4 sm:p-5"
        hidden={!detailsExpanded}
      >
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Primer contacto
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              <time dateTime={contact.primer_contacto}>
                {formatDateTime(contact.primer_contacto, timezone)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Antigüedad del abierto
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {formatAge(contact.antiguedad_abierto_horas)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Responsables actuales
            </dt>
            <dd className="mt-1">
              {contact.responsables.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {contact.responsables.map((responsible, responsibleIndex) => (
                    <li
                      key={`${responsible.usuario_id ?? "none"}-${responsibleIndex}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        {responsible.nombre}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {numberFormatter.format(responsible.cantidad_abiertos)}{" "}
                        {responsible.cantidad_abiertos === 1
                          ? "abierto"
                          : "abiertos"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Sin asignar
                </span>
              )}
            </dd>
          </div>
        </dl>

        <section aria-labelledby={`rendimiento-tickets-heading-${signature}`}>
          <div className="mb-3 flex items-center gap-2">
            <TicketCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4
              id={`rendimiento-tickets-heading-${signature}`}
              className="text-sm font-semibold"
            >
              Tickets relacionados
            </h4>
          </div>
          <ul id={ticketsId} className="space-y-2">
            {visibleTickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                contactName={contact.nombre_referencia}
                timezone={timezone}
              />
            ))}
          </ul>
          {hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              aria-expanded={ticketsExpanded}
              aria-controls={ticketsId}
              onClick={() => setTicketsExpanded((current) => !current)}
            >
              {ticketsExpanded ? (
                <ChevronUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {ticketsExpanded
                ? "Mostrar solo los 3 más recientes"
                : `Ver ${numberFormatter.format(hiddenCount)} ${
                    hiddenCount === 1 ? "ticket más" : "tickets más"
                  }`}
            </Button>
          ) : null}
        </section>
      </div>
    </article>
  );
}

function ContactsList({
  contacts,
  timezone,
}: {
  contacts: readonly RendimientoReiteracionContacto[];
  timezone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasMore = contacts.length > INITIAL_VISIBLE_CONTACTS;
  const visibleContacts = expanded
    ? contacts
    : contacts.slice(0, INITIAL_VISIBLE_CONTACTS);
  const hiddenCount = contacts.length - INITIAL_VISIBLE_CONTACTS;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <div
        id={listId}
        className={cn(
          "space-y-3 p-3 sm:p-4",
          expanded &&
            hasMore &&
            "scroll-sutil max-h-[680px] overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        )}
        role={expanded && hasMore ? "region" : undefined}
        aria-label={
          expanded && hasMore
            ? "Lista ampliada de contactos recurrentes"
            : undefined
        }
        tabIndex={expanded && hasMore ? 0 : undefined}
      >
        {visibleContacts.map((contact) => {
          const signature = buildRepetitionContactTicketSignature(contact);
          return (
            <ContactCard
              key={signature}
              contact={contact}
              signature={signature}
              timezone={timezone}
            />
          );
        })}
      </div>
      {hasMore ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-center">
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
              ? "Mostrar solo 3 contactos"
              : `Ver ${numberFormatter.format(hiddenCount)} ${
                  hiddenCount === 1 ? "contacto más" : "contactos más"
                }`}
          </Button>
        </div>
      ) : null}
    </div>
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
          Página {numberFormatter.format(data.pagina)} de{" "}
          {numberFormatter.format(data.total_paginas)}
        </span>
        {pageIsInRange ? (
          <>
            {" "}
            · Contactos {numberFormatter.format(firstResult)}–
            {numberFormatter.format(lastResult)} de{" "}
            {numberFormatter.format(data.resumen.contactos_reiterados)}
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
              detail={`de ${numberFormatter.format(data.tickets_evaluados)} evaluados`}
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
