import type { Ticket } from '@workspace/api-client-react';
import { AlertCircle, Building } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  getAssignedDisplayName,
  hasAssignedDisplayName,
} from '@/lib/asignacion';
import { getContactDisplayName } from '@/lib/contacto';
import { getEstadoEmpleadoConfig } from '@/lib/estado-empleado';
import { getMotivoCategoriaConfig } from '@/lib/motivos';
import {
  EstadoBadge,
  formatDate,
  isVencido,
  PrioridadBadge,
} from '@/lib/utils-tickets';

interface TicketListTableRowProps {
  ticket: Ticket;
  onOpen: (ticketId: number) => void;
}

export function TicketListTableRow({
  ticket,
  onOpen,
}: TicketListTableRowProps) {
  const vencido = isVencido(ticket.fecha_limite, ticket.estado);
  const motivoCategoria = getMotivoCategoriaConfig(ticket.motivo_categoria);
  const contactoLabel = getContactDisplayName(ticket);
  const empresa = ticket.empresa?.trim();
  const empresaLabel = empresa || 'Sin empresa asociada';
  const estadoEmpleado = getEstadoEmpleadoConfig(
    empresa,
    ticket.estado_empleado,
  );
  const asignadoLabel = getAssignedDisplayName(ticket.asignado_a);
  const tieneAsignado = hasAssignedDisplayName(ticket.asignado_a);

  return (
    <TableRow
      onClick={() => onOpen(ticket.id)}
      className="cursor-pointer transition-all hover:bg-slate-50/80 group border-b border-slate-100 last:border-0 relative"
      data-testid={`row-ticket-${ticket.id}`}
    >
      <TableCell className="py-2.5">
        {/* Hover Left Border Accent */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex flex-col">
          <span className="text-sm text-foreground font-medium">
            {new Date(ticket.fecha_creacion).toLocaleDateString('es-AR')}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {ticket.hora} hs
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <div className="min-w-0">
          <span
            className="block truncate text-sm font-semibold text-foreground"
            title={contactoLabel}
          >
            {contactoLabel}
          </span>
          <span
            className="mt-0.5 flex min-w-0 items-center text-[11px] text-slate-500"
            title={empresaLabel}
          >
            <Building className="mr-1 h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{empresaLabel}</span>
          </span>
          {estadoEmpleado && (
            <span
              className={`mt-0.5 flex items-center text-[11px] font-medium ${estadoEmpleado.textClass}`}
            >
              <span
                className={`mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${estadoEmpleado.dotClass}`}
                aria-hidden="true"
              />
              {estadoEmpleado.label}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <span
          className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${motivoCategoria.badgeClass}`}
        >
          <span className="truncate">{motivoCategoria.label}</span>
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <div
          className="text-sm text-foreground line-clamp-2 leading-snug"
          title={ticket.motivo}
        >
          {ticket.motivo}
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <EstadoBadge estado={ticket.estado} />
      </TableCell>
      <TableCell className="py-2.5">
        <PrioridadBadge prioridad={ticket.prioridad} />
      </TableCell>
      <TableCell className="py-2.5">
        <span
          className={`block truncate text-sm ${tieneAsignado ? 'font-medium text-slate-700' : 'text-slate-400'}`}
          title={asignadoLabel}
        >
          {asignadoLabel}
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <div className="flex items-center gap-2">
          <Progress
            value={ticket.progreso || 0}
            className="h-1.5 flex-1 bg-slate-100"
          />
          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">
            {ticket.progreso || 0}%
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2.5 text-right">
        {ticket.fecha_limite ? (
          <div
            className={`flex items-center justify-end gap-1 text-[13px] ${vencido ? 'text-red-600 font-bold' : 'text-slate-600 font-medium'}`}
          >
            {vencido && <AlertCircle className="h-3.5 w-3.5" />}
            {formatDate(ticket.fecha_limite).split(' ')[0]}
          </div>
        ) : (
          <span className="text-slate-300 text-sm">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}
