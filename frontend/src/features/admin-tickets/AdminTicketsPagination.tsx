import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdminTicketsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageSizeChange: (pageSize: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AdminTicketsPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageSizeChange,
  onPreviousPage,
  onNextPage,
}: AdminTicketsPaginationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t bg-slate-50/50 text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Mostrar</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-7 w-[70px] text-xs bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>por página</span>
      </div>
      <span className="text-muted-foreground text-xs">
        {total} registros — página {page} de {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs bg-white"
          disabled={page <= 1}
          onClick={onPreviousPage}
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs bg-white"
          disabled={page >= totalPages}
          onClick={onNextPage}
        >
          Siguiente <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}
