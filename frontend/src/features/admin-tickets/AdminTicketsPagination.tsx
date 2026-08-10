import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_LIST_LIMITS,
  type TicketListLimit,
} from "@/lib/ticket-list-url";

interface AdminTicketsPaginationProps {
  page: number;
  pageSize: TicketListLimit;
  total: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  onPageSizeChange: (pageSize: TicketListLimit) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AdminTicketsPagination({
  page,
  pageSize,
  total,
  totalPages,
  isLoading,
  isError,
  onPageSizeChange,
  onPreviousPage,
  onNextPage,
}: AdminTicketsPaginationProps) {
  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 border-t bg-slate-50/50 px-4 py-3 text-sm sm:flex-row sm:gap-2 sm:py-2.5"
      aria-label="Paginación de registros administrativos"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Mostrar</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            const nextPageSize = TICKET_LIST_LIMITS.find(
              (size) => String(size) === value,
            );
            if (nextPageSize) onPageSizeChange(nextPageSize);
          }}
        >
          <SelectTrigger
            className="h-9 w-[76px] bg-white text-xs sm:h-8"
            aria-label="Registros por página"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_LIST_LIMITS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>por página</span>
      </div>
      <span
        className="text-center text-xs text-muted-foreground"
        role={!isLoading && !isError ? "status" : undefined}
        aria-live={!isLoading && !isError ? "polite" : undefined}
        aria-atomic={!isLoading && !isError ? "true" : undefined}
      >
        {isLoading
          ? "Cargando registros..."
          : isError
            ? "No se pudieron cargar los registros."
            : `${total} registros — página ${page} de ${totalPages}`}
      </span>
      <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1 bg-white px-3 text-xs sm:h-8 sm:flex-none sm:px-2"
          disabled={page <= 1}
          onClick={onPreviousPage}
        >
          <ChevronLeft className="mr-0.5 h-3.5 w-3.5" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1 bg-white px-3 text-xs sm:h-8 sm:flex-none sm:px-2"
          disabled={page >= totalPages}
          onClick={onNextPage}
        >
          Siguiente
          <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
