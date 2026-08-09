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
  ADMIN_DIRECTORY_USER_LIMITS,
  type AdminDirectoryUserLimit,
} from "@/lib/admin-directory-url";

interface AdminUsersPaginationProps {
  page: number;
  pageSize: AdminDirectoryUserLimit;
  total: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  hasResults: boolean;
  onPageSizeChange: (pageSize: AdminDirectoryUserLimit) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AdminUsersPagination({
  page,
  pageSize,
  total,
  totalPages,
  isLoading,
  isError,
  hasResults,
  onPageSizeChange,
  onPreviousPage,
  onNextPage,
}: AdminUsersPaginationProps) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-border bg-slate-50/60 px-4 py-2.5 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Mostrar</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            const nextPageSize = ADMIN_DIRECTORY_USER_LIMITS.find(
              (size) => String(size) === value,
            );
            if (nextPageSize) onPageSizeChange(nextPageSize);
          }}
        >
          <SelectTrigger
            className="h-7 w-[70px] bg-white text-xs"
            aria-label="Cantidad de usuarios por página"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_DIRECTORY_USER_LIMITS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>por página</span>
      </div>
      <span
        className="text-xs text-muted-foreground"
        role={hasResults ? "status" : undefined}
        aria-live={hasResults ? "polite" : undefined}
        aria-atomic={hasResults ? "true" : undefined}
      >
        {isLoading
          ? "Cargando registros..."
          : isError
            ? "No se pudieron cargar los registros."
            : `${total} registros — página ${page} de ${totalPages}`}
      </span>
      <nav
        className="flex items-center gap-1"
        aria-label="Paginación de usuarios"
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-white px-2 text-xs"
          disabled={page <= 1}
          onClick={onPreviousPage}
        >
          <ChevronLeft className="mr-0.5 h-3.5 w-3.5" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-white px-2 text-xs"
          disabled={page >= totalPages}
          onClick={onNextPage}
        >
          Siguiente
          <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
