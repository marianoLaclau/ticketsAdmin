import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TicketSortToolbarProps {
  isResetDisabled: boolean;
  onReset: () => void;
}

export function TicketSortToolbar({
  isResetDisabled,
  onReset,
}: TicketSortToolbarProps) {
  return (
    <div className="flex shrink-0 flex-col items-start justify-between gap-1.5 border-b border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:gap-3">
      <span>
        Ordená con un clic. Usá{' '}
        <kbd className="rounded border bg-white px-1 font-sans">Shift</kbd> +
        clic para combinar varias columnas; los números indican su prioridad.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReset}
        disabled={isResetDisabled}
        className="h-7 shrink-0 gap-1.5 px-2 text-[11px] font-medium"
        title="Volver a Fecha de llegada, más recientes primero"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restablecer orden
      </Button>
    </div>
  );
}
