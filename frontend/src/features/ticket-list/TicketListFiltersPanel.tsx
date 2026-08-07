import { TicketEstado, TicketPrioridad } from '@workspace/api-client-react';
import { Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getEstadoLabel } from '@/lib/estados';
import { MOTIVO_CATEGORIA_OPTIONS } from '@/lib/motivos';

interface TicketListFilterValues {
  search: string;
  estado: string;
  prioridad: string;
  motivoCategoria: string;
  vencidos: boolean;
  fechaDesde: string;
  fechaHasta: string;
  horaDesde: string;
  horaHasta: string;
  empresa: string;
}

interface TicketListFilterHandlers {
  search: (value: string) => void;
  estado: (value: string) => void;
  prioridad: (value: string) => void;
  motivoCategoria: (value: string) => void;
  vencidos: (value: boolean) => void;
  fechaDesde: (value: string) => void;
  fechaHasta: (value: string) => void;
  horaDesde: (value: string) => void;
  horaHasta: (value: string) => void;
  empresa: (value: string) => void;
}

interface TicketListFiltersPanelProps {
  values: TicketListFilterValues;
  onChange: TicketListFilterHandlers;
  isExporting: boolean;
  onExport: () => Promise<void>;
  onClear: () => void;
}

export function TicketListFiltersPanel({
  values,
  onChange,
  isExporting,
  onExport,
  onClear,
}: TicketListFiltersPanelProps) {
  const hasFilters =
    values.search ||
    values.estado !== '_all' ||
    values.prioridad !== '_all' ||
    values.motivoCategoria !== '_all' ||
    values.vencidos ||
    values.fechaDesde ||
    values.fechaHasta ||
    values.horaDesde ||
    values.horaHasta ||
    values.empresa;

  return (
    <div className="shrink-0 space-y-2 rounded-md border border-border bg-card p-2 shadow-sm">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_185px_165px]">
        <div className="flex h-8 min-w-0 items-center lg:col-span-2 xl:col-span-1">
          <Search
            className="ml-2.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar tickets"
            placeholder="Buscar contacto, empresa o motivo..."
            className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
            value={values.search}
            onChange={(event) => onChange.search(event.target.value)}
          />
        </div>

        <Label htmlFor="tickets-estado" className="sr-only">
          Filtrar por estado
        </Label>
        <Select value={values.estado} onValueChange={onChange.estado}>
          <SelectTrigger
            id="tickets-estado"
            className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs [&>svg]:ml-auto"
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Estado:
            </span>
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value={TicketEstado.nuevo}>Nuevo</SelectItem>
            <SelectItem value={TicketEstado.en_proceso}>En Proceso</SelectItem>
            <SelectItem value={TicketEstado.pendiente}>
              {getEstadoLabel(TicketEstado.pendiente)}
            </SelectItem>
            <SelectItem value={TicketEstado.resuelto}>Resuelto</SelectItem>
            <SelectItem value={TicketEstado.cerrado}>Cerrado</SelectItem>
          </SelectContent>
        </Select>

        <Label htmlFor="tickets-prioridad" className="sr-only">
          Filtrar por prioridad
        </Label>
        <Select value={values.prioridad} onValueChange={onChange.prioridad}>
          <SelectTrigger
            id="tickets-prioridad"
            className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs [&>svg]:ml-auto"
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Prioridad:
            </span>
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas</SelectItem>
            <SelectItem value={TicketPrioridad.baja}>Baja</SelectItem>
            <SelectItem value={TicketPrioridad.media}>Media</SelectItem>
            <SelectItem value={TicketPrioridad.alta}>Alta</SelectItem>
            <SelectItem value={TicketPrioridad.urgente}>Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-[220px_minmax(0,1.3fr)_minmax(0,1fr)]">
        <Label htmlFor="tickets-categoria" className="sr-only">
          Filtrar por categoría
        </Label>
        <Select
          value={values.motivoCategoria}
          onValueChange={onChange.motivoCategoria}
        >
          <SelectTrigger
            id="tickets-categoria"
            className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs lg:col-span-2 xl:col-span-1 [&>svg]:ml-auto"
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Categoría:
            </span>
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas</SelectItem>
            {MOTIVO_CATEGORIA_OPTIONS.map((categoria) => (
              <SelectItem key={categoria.value} value={categoria.value}>
                {categoria.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dates */}
        <div className="flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          <span className="pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Fecha:
          </span>
          <input
            type="date"
            aria-label="Fecha desde"
            className="h-full min-w-0 flex-1 border-none bg-transparent px-1.5 text-xs text-slate-700 outline-none"
            value={values.fechaDesde}
            onChange={(event) => onChange.fechaDesde(event.target.value)}
            title="Fecha Desde"
          />
          <span className="text-slate-300">-</span>
          <input
            type="date"
            aria-label="Fecha hasta"
            className="h-full min-w-0 flex-1 border-none bg-transparent px-1.5 text-xs text-slate-700 outline-none"
            value={values.fechaHasta}
            onChange={(event) => onChange.fechaHasta(event.target.value)}
            title="Fecha Hasta"
          />
        </div>

        {/* Times */}
        <div className="flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          <span className="pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Hora:
          </span>
          <input
            type="time"
            aria-label="Hora desde"
            className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-xs text-slate-700 outline-none"
            value={values.horaDesde}
            onChange={(event) => onChange.horaDesde(event.target.value)}
            title="Hora Desde"
          />
          <span className="text-slate-300">-</span>
          <input
            type="time"
            aria-label="Hora hasta"
            className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-xs text-slate-700 outline-none"
            value={values.horaHasta}
            onChange={(event) => onChange.horaHasta(event.target.value)}
            title="Hora Hasta"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1fr)_auto]">
        <div className="relative min-w-0">
          <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Empresa:
          </span>
          <Input
            aria-label="Filtrar por empresa"
            placeholder="Todas"
            className="h-8 w-full bg-slate-50 pl-[68px] text-xs border-slate-200"
            value={values.empresa}
            onChange={(event) => onChange.empresa(event.target.value)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
          <div className="flex h-8 w-full min-w-0 items-center space-x-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 sm:w-auto">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Plazo:
            </span>
            <Switch
              id="vencidos-mode"
              checked={values.vencidos}
              onCheckedChange={onChange.vencidos}
              className="scale-75 origin-left"
            />
            <Label
              htmlFor="vencidos-mode"
              className="cursor-pointer whitespace-nowrap text-xs font-medium text-slate-700"
            >
              Solo vencidos
            </Label>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onExport()}
            disabled={isExporting}
            aria-label="Exportar todos los tickets filtrados a CSV"
            className="h-8 w-full whitespace-nowrap bg-white px-2.5 text-xs sm:w-auto"
          >
            {isExporting ? (
              <Loader2
                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isExporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-8 w-full px-2 text-xs text-slate-500 hover:text-slate-900 sm:w-auto"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
