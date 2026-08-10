import { TicketSortBy, type Ticket } from "@workspace/api-client-react";
import { Plus, RotateCcw, Search } from "lucide-react";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { AdminTicketTableRow } from "@/features/admin-tickets/AdminTicketTableRow";
import { AdminTicketsPagination } from "@/features/admin-tickets/AdminTicketsPagination";
import type { TicketSortState } from "@/lib/ticket-list-controls";
import type { TicketListLimit } from "@/lib/ticket-list-url";
import type { AdminTicketDetailNavigationState } from "@/lib/ticket-navigation";

interface AdminTicketsListPanelProps {
  search: string;
  sorts: TicketSortState;
  isDefaultSort: boolean;
  tickets: readonly Ticket[];
  isLoading: boolean;
  errorMessage: string | null;
  areCrudActionsDisabled: boolean;
  detailNavigationState: AdminTicketDetailNavigationState;
  page: number;
  pageSize: TicketListLimit;
  total: number;
  totalPages: number;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onSort: (column: TicketSortBy, additive: boolean) => void;
  onResetSort: () => void;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
  onPageSizeChange: (pageSize: TicketListLimit) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AdminTicketsListPanel({
  search,
  sorts,
  isDefaultSort,
  tickets,
  isLoading,
  errorMessage,
  areCrudActionsDisabled,
  detailNavigationState,
  page,
  pageSize,
  total,
  totalPages,
  onSearchChange,
  onCreate,
  onSort,
  onResetSort,
  onEdit,
  onDelete,
  onPageSizeChange,
  onPreviousPage,
  onNextPage,
}: AdminTicketsListPanelProps) {
  return (
    <TabsContent value="registros" className="space-y-3 mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full flex-1 sm:max-w-lg">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Buscar en todos los campos..."
            aria-label="Buscar registros administrativos"
            className="pl-8 h-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Button
          onClick={onCreate}
          disabled={areCrudActionsDisabled}
          className="h-9 w-full sm:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nuevo registro
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Esta vista incluye los registros en cuarentena sin datos útiles, ocultos
        en Tickets y Dashboard.
      </p>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <div className="flex flex-col items-start justify-between gap-1.5 border-b border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:gap-3">
          <span>
            Ordená con un clic. Usá{" "}
            <kbd className="rounded border bg-white px-1 font-sans">Shift</kbd>{" "}
            + clic para combinar varias columnas; los números indican su
            prioridad.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetSort}
            disabled={isDefaultSort}
            className="h-7 shrink-0 gap-1.5 px-2 text-[11px] font-medium"
            title="Volver a Fecha de llegada, más recientes primero"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restablecer orden
          </Button>
        </div>
        <div
          className="max-w-full overflow-x-auto overscroll-x-contain"
          role="region"
          aria-label="Registros administrativos"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <LoadingStatus>Cargando registros administrativos</LoadingStatus>
          ) : null}
          <Table className="min-w-[1900px]">
            <TableCaption className="sr-only">
              Registros administrativos, incluidos los tickets en cuarentena
            </TableCaption>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <SortableTableHead
                  label="ID"
                  column={TicketSortBy.id}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[70px]"
                />
                <SortableTableHead
                  label="Fecha y hora"
                  column={TicketSortBy.fecha_creacion}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[145px]"
                />
                <SortableTableHead
                  label="Conversation ID"
                  column={TicketSortBy.conversation_id}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[210px]"
                />
                <SortableTableHead
                  label="Contacto"
                  column={TicketSortBy.contacto}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[250px]"
                />
                <SortableTableHead
                  label="Empresa"
                  column={TicketSortBy.empresa}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[180px]"
                />
                <SortableTableHead
                  label="Categoría y motivo"
                  column={TicketSortBy.motivo_categoria}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[280px]"
                />
                <SortableTableHead
                  label="Estado"
                  column={TicketSortBy.estado}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[140px]"
                />
                <SortableTableHead
                  label="Prioridad"
                  column={TicketSortBy.prioridad}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[110px]"
                />
                <SortableTableHead
                  label="Asignado"
                  column={TicketSortBy.asignado_a}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[170px]"
                />
                <SortableTableHead
                  label="Vencimiento"
                  column={TicketSortBy.fecha_limite}
                  sorts={sorts}
                  onSort={onSort}
                  className="w-[165px]"
                />
                <TableHead className="sticky right-0 z-10 w-[190px] bg-slate-50 text-right text-xs uppercase shadow-[-4px_0_6px_-6px_rgba(15,23,42,0.45)]">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, row) => (
                  <TableRow key={row} aria-hidden="true">
                    {Array.from({ length: 11 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : errorMessage !== null ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-40 text-center text-sm text-destructive"
                  >
                    <div role="alert">{errorMessage}</div>
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-40 text-center text-sm text-muted-foreground"
                  >
                    <div role="status" aria-live="polite">
                      No hay registros
                      {search ? " que coincidan con la búsqueda" : ""}.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket) => (
                  <AdminTicketTableRow
                    key={ticket.id}
                    ticket={ticket}
                    areCrudActionsDisabled={areCrudActionsDisabled}
                    navigationState={detailNavigationState}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <AdminTicketsPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          isLoading={isLoading}
          isError={errorMessage !== null}
          onPageSizeChange={onPageSizeChange}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      </div>
    </TabsContent>
  );
}
