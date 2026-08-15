import { useId, useState } from "react";
import type {
  RendimientoReiteracionContacto,
  RendimientoReiteracionTicket,
} from "@workspace/api-client-react";
import { ChevronDown, ChevronUp, TicketCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMotivoCategoriaConfig } from "@/lib/motivos";
import { cn } from "@/lib/utils";
import { EstadoBadge, PrioridadBadge } from "@/lib/utils-tickets";
import { rendimientoNumberFormatter } from "./rendimiento-format";
import {
  buildRepetitionContactTicketSignature,
  formatAge,
  formatDateTime,
  INITIAL_VISIBLE_CONTACTS,
  INITIAL_VISIBLE_TICKETS,
  matchTypeLabel,
} from "./reiteraciones-format";

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
          ? ` +${rendimientoNumberFormatter.format(additionalResponsibleCount)}`
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
              {rendimientoNumberFormatter.format(contact.cantidad_llamados)} llamados
            </Badge>
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-800"
            >
              {rendimientoNumberFormatter.format(contact.abiertos)}{" "}
              {contact.abiertos === 1 ? "abierto" : "abiertos"}
            </Badge>
            {contact.vencidos_abiertos > 0 ? (
              <Badge
                variant="outline"
                className="border-red-200 bg-red-50 text-red-700"
              >
                {rendimientoNumberFormatter.format(contact.vencidos_abiertos)}{" "}
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
                        {rendimientoNumberFormatter.format(responsible.cantidad_abiertos)}{" "}
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
                : `Ver ${rendimientoNumberFormatter.format(hiddenCount)} ${
                    hiddenCount === 1 ? "ticket más" : "tickets más"
                  }`}
            </Button>
          ) : null}
        </section>
      </div>
    </article>
  );
}

export function ContactsList({
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
              : `Ver ${rendimientoNumberFormatter.format(hiddenCount)} ${
                  hiddenCount === 1 ? "contacto más" : "contactos más"
                }`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
