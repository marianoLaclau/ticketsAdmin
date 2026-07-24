import type { TicketSortBy } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TicketSortState } from '@/lib/ticket-list-controls';

export interface SortableTableHeadProps {
  label: string;
  column: TicketSortBy;
  sorts: TicketSortState;
  onSort: (column: TicketSortBy, additive: boolean) => void;
  className?: string;
  align?: 'left' | 'right';
}

export function SortableTableHead({
  label,
  column,
  sorts,
  onSort,
  className,
  align = 'left',
}: SortableTableHeadProps) {
  const sortIndex = sorts.findIndex((rule) => rule.sortBy === column);
  const activeRule = sortIndex >= 0 ? sorts[sortIndex] : undefined;
  const active = Boolean(activeRule);
  const priority = sortIndex + 1;
  const nextOrder = activeRule?.order === 'asc' ? 'desc' : 'asc';
  const ariaSort =
    priority === 1 ? (activeRule?.order === 'asc' ? 'ascending' : 'descending') : active ? 'other' : 'none';
  const Icon = activeRule ? (activeRule.order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const directionLabel = activeRule?.order === 'asc' ? 'ascendente' : 'descendente';
  const title = activeRule
    ? `${label}: criterio ${priority}, orden ${directionLabel}. Clic para dejarlo como único criterio; Shift+clic para invertirlo sin perder los demás.`
    : `Ordenar por ${label}. Usá Shift+clic para sumarlo al orden actual.`;

  return (
    <TableHead
      aria-sort={ariaSort}
      className={cn(
        'py-3 text-xs font-semibold uppercase tracking-wider text-slate-500',
        align === 'right' && 'text-right',
        className,
      )}
    >
      <button
        type="button"
        onClick={(event) => onSort(column, event.shiftKey)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm uppercase tracking-wider transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          active && 'text-slate-900',
          align === 'right' && 'justify-end',
        )}
        aria-label={
          activeRule
            ? `${label}, criterio ${priority}, orden ${directionLabel}. Próximo orden: ${
                nextOrder === 'asc' ? 'ascendente' : 'descendente'
              }`
            : `Ordenar por ${label}`
        }
        title={title}
      >
        <span>{label}</span>
        <Icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', !active && 'opacity-40')} />
        {activeRule && (
          <span
            aria-hidden="true"
            className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 px-1 text-[9px] font-bold leading-none text-white"
          >
            {priority}
          </span>
        )}
      </button>
    </TableHead>
  );
}
