import type { Ticket } from '@workspace/api-client-react';
import { AlertCircle, Eye, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  getAssignedDisplayName,
  hasAssignedDisplayName,
} from '@/lib/asignacion';
import {
  getContactDisplayEmail,
  getContactDisplayName,
  getContactDisplayPhone,
} from '@/lib/contacto';
import { getMotivoCategoriaConfig } from '@/lib/motivos';
import {
  EstadoBadge,
  formatDate,
  isVencido,
  PrioridadBadge,
} from '@/lib/utils-tickets';

interface AdminTicketTableRowProps {
  ticket: Ticket;
  isEditDisabled: boolean;
  onOpen: (ticketId: number) => void;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
}

export function AdminTicketTableRow({
  ticket,
  isEditDisabled,
  onOpen,
  onEdit,
  onDelete,
}: AdminTicketTableRowProps) {
  const conversationId =
    ticket.conversation_id?.trim() || 'Sin ID de conversación';
  const phone = getContactDisplayPhone(ticket.telefono);
  const email = getContactDisplayEmail(ticket.email);
  const company = ticket.empresa?.trim() || 'Sin empresa asociada';
  const category = getMotivoCategoriaConfig(ticket.motivo_categoria);
  const reason = ticket.motivo?.trim() || 'Sin motivo proporcionado';
  const assigned = getAssignedDisplayName(ticket.asignado_a);
  const hasAssigned = hasAssignedDisplayName(ticket.asignado_a);
  const overdue = isVencido(ticket.fecha_limite, ticket.estado);

  return (
    <TableRow className="group text-sm">
      <TableCell className="font-medium tabular-nums text-muted-foreground">
        #{ticket.id}
      </TableCell>
      <TableCell>
        <div className="flex flex-col whitespace-nowrap">
          <span className="font-medium text-foreground">
            {formatDate(ticket.fecha_creacion).split(',')[0]}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {ticket.hora?.trim()
              ? `${ticket.hora} hs`
              : 'Sin hora proporcionada'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span
          className="inline-block max-w-[190px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]"
          title={conversationId}
        >
          {conversationId}
        </span>
      </TableCell>
      <TableCell>
        <div className="min-w-0 space-y-0.5">
          <span
            className="block truncate font-semibold text-foreground"
            title={getContactDisplayName(ticket)}
          >
            {getContactDisplayName(ticket)}
          </span>
          <span
            className="flex min-w-0 items-center text-[11px] text-muted-foreground"
            title={phone ?? 'Sin teléfono proporcionado'}
          >
            <Phone className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {phone ?? 'Sin teléfono proporcionado'}
            </span>
          </span>
          <span
            className="flex min-w-0 items-center text-[11px] text-muted-foreground"
            title={email ?? 'Sin email proporcionado'}
          >
            <Mail className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {email ?? 'Sin email proporcionado'}
            </span>
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="block truncate" title={company}>
          {company}
        </span>
      </TableCell>
      <TableCell>
        <div className="min-w-0 space-y-1">
          <span
            className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold ${category.badgeClass}`}
          >
            <span className="truncate">{category.label}</span>
          </span>
          <span
            className="block line-clamp-2 text-xs leading-snug text-slate-700"
            title={reason}
          >
            {reason}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <EstadoBadge estado={ticket.estado} />
      </TableCell>
      <TableCell>
        <PrioridadBadge prioridad={ticket.prioridad} />
      </TableCell>
      <TableCell>
        <span
          className={`block truncate ${hasAssigned ? 'font-medium text-slate-700' : 'text-muted-foreground'}`}
          title={assigned}
        >
          {assigned}
        </span>
      </TableCell>
      <TableCell>
        {ticket.fecha_limite ? (
          <div
            className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${overdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}
          >
            {overdue && (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>{formatDate(ticket.fecha_limite)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin vencimiento</span>
        )}
      </TableCell>
      <TableCell className="sticky right-0 z-[1] bg-white text-right shadow-[-4px_0_6px_-6px_rgba(15,23,42,0.45)] group-hover:bg-slate-50/80">
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(ticket.id);
            }}
            title={`Abrir ticket #${ticket.id}`}
            aria-label={`Abrir ticket #${ticket.id}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(ticket);
            }}
            disabled={isEditDisabled}
            title={`Editar ticket #${ticket.id}`}
            aria-label={`Editar ticket #${ticket.id}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(ticket);
            }}
            title={`Eliminar ticket #${ticket.id}`}
            aria-label={`Eliminar ticket #${ticket.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
