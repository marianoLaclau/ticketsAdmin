import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  MOTIVO_CATEGORIAS,
  MOTIVO_CATEGORIA_LABELS,
  PRIORIDADES_VALIDAS,
} from "@workspace/ingesta";
import { CalendarRange, CircleHelp, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isValidCalendarDate } from "@/lib/calendar-date";
import {
  createDefaultRendimientoUrlState,
  RENDIMIENTO_PERIODO_LABELS,
  type RendimientoCategoria,
  type RendimientoFilterState,
  type RendimientoPeriodo,
  type RendimientoPrioridad,
  type RendimientoUrlState,
} from "@/features/rendimiento/rendimiento-url";
import {
  createDefaultRendimientoCustomRange,
  type RendimientoDateRange,
} from "./rendimiento-query";

const ALL_FILTERS = "_all";

interface RendimientoFilterDraft extends RendimientoDateRange {
  periodo: RendimientoPeriodo;
  empresa: string;
  categoria: RendimientoCategoria | typeof ALL_FILTERS;
  prioridad: RendimientoPrioridad | typeof ALL_FILTERS;
}

interface RendimientoFiltersPanelProps {
  state: RendimientoUrlState;
  onApply: (state: RendimientoFilterState) => void;
  onReset: () => void;
}

function createDraft(
  state: RendimientoUrlState,
  defaultRange: RendimientoDateRange,
): RendimientoFilterDraft {
  const range =
    state.periodo === "personalizado"
      ? { desde: state.desde, hasta: state.hasta }
      : defaultRange;

  return {
    periodo: state.periodo,
    ...range,
    empresa: state.empresa ?? "",
    categoria: state.categoria ?? ALL_FILTERS,
    prioridad: state.prioridad ?? ALL_FILTERS,
  };
}

function getDateRangeError(draft: RendimientoFilterDraft): string | null {
  if (draft.periodo !== "personalizado") return null;
  if (!draft.desde || !draft.hasta) {
    return "Completá las fechas desde y hasta.";
  }
  if (!isValidCalendarDate(draft.desde) || !isValidCalendarDate(draft.hasta)) {
    return "Ingresá fechas válidas.";
  }
  if (draft.desde > draft.hasta) {
    return "La fecha desde no puede ser posterior a la fecha hasta.";
  }
  return null;
}

function buildAppliedLabel(state: RendimientoUrlState): string {
  const parts = [RENDIMIENTO_PERIODO_LABELS[state.periodo]];
  if (state.empresa) parts.push(`Empresa: ${state.empresa}`);
  if (state.categoria) {
    parts.push(MOTIVO_CATEGORIA_LABELS[state.categoria]);
  }
  if (state.prioridad) {
    parts.push(
      `Prioridad: ${state.prioridad[0]?.toLocaleUpperCase("es")}${state.prioridad.slice(1)}`,
    );
  }
  return parts.join(" · ");
}

export function RendimientoFiltersPanel({
  state,
  onApply,
  onReset,
}: RendimientoFiltersPanelProps) {
  const defaultRange = useMemo(() => createDefaultRendimientoCustomRange(), []);
  const [draft, setDraft] = useState(() => createDraft(state, defaultRange));
  const dateError = getDateRangeError(draft);

  useEffect(() => {
    setDraft(createDraft(state, defaultRange));
  }, [defaultRange, state]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dateError) return;

    const empresa = draft.empresa.trim();
    const commonFilters = {
      ...(empresa ? { empresa } : {}),
      ...(draft.categoria !== ALL_FILTERS
        ? { categoria: draft.categoria }
        : {}),
      ...(draft.prioridad !== ALL_FILTERS
        ? { prioridad: draft.prioridad }
        : {}),
    };

    onApply(
      draft.periodo === "personalizado"
        ? {
            periodo: draft.periodo,
            desde: draft.desde,
            hasta: draft.hasta,
            ...commonFilters,
          }
        : { periodo: draft.periodo, ...commonFilters },
    );
  };

  const handleReset = () => {
    const defaultState = createDefaultRendimientoUrlState();
    setDraft(createDraft(defaultState, defaultRange));
    onReset();
  };

  return (
    <form
      aria-label="Filtros de Rendimiento"
      className="rounded-xl border bg-card p-4 shadow-sm"
      onSubmit={handleSubmit}
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">
          Filtrar los datos del módulo Rendimiento
        </legend>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="rendimiento-periodo"
              className="flex h-6 items-center gap-1.5 text-xs text-muted-foreground"
            >
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              Período
            </Label>
            <Select
              value={draft.periodo}
              onValueChange={(periodo) =>
                setDraft((current) => ({
                  ...current,
                  periodo: periodo as RendimientoPeriodo,
                }))
              }
            >
              <SelectTrigger id="rendimiento-periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RENDIMIENTO_PERIODO_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex h-6 items-center gap-1.5">
              <Label
                htmlFor="rendimiento-empresa"
                className="text-xs text-muted-foreground"
              >
                Empresa
              </Label>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Ayuda sobre búsqueda por nombre"
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Busca coincidencias dentro del nombre.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="rendimiento-empresa"
              type="search"
              value={draft.empresa}
              placeholder="Todas las empresas"
              autoComplete="organization"
              aria-describedby="rendimiento-empresa-ayuda"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  empresa: event.target.value,
                }))
              }
            />
            <span id="rendimiento-empresa-ayuda" className="sr-only">
              Busca coincidencias dentro del nombre.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="rendimiento-categoria"
              className="flex h-6 items-center text-xs text-muted-foreground"
            >
              Categoría
            </Label>
            <Select
              value={draft.categoria}
              onValueChange={(categoria) =>
                setDraft((current) => ({
                  ...current,
                  categoria: categoria as RendimientoFilterDraft["categoria"],
                }))
              }
            >
              <SelectTrigger id="rendimiento-categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTERS}>
                  Todas las categorías
                </SelectItem>
                {MOTIVO_CATEGORIAS.map(({ codigo, label }) => (
                  <SelectItem key={codigo} value={codigo}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="rendimiento-prioridad"
              className="flex h-6 items-center text-xs text-muted-foreground"
            >
              Prioridad
            </Label>
            <Select
              value={draft.prioridad}
              onValueChange={(prioridad) =>
                setDraft((current) => ({
                  ...current,
                  prioridad: prioridad as RendimientoFilterDraft["prioridad"],
                }))
              }
            >
              <SelectTrigger id="rendimiento-prioridad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTERS}>
                  Todas las prioridades
                </SelectItem>
                {PRIORIDADES_VALIDAS.map((prioridad) => (
                  <SelectItem key={prioridad} value={prioridad}>
                    {prioridad[0]?.toLocaleUpperCase("es")}
                    {prioridad.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {draft.periodo === "personalizado" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <div className="space-y-1.5">
              <Label
                htmlFor="rendimiento-desde"
                className="text-xs text-muted-foreground"
              >
                Desde
              </Label>
              <Input
                id="rendimiento-desde"
                type="date"
                value={draft.desde}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={
                  dateError ? "rendimiento-fechas-error" : undefined
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    desde: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="rendimiento-hasta"
                className="text-xs text-muted-foreground"
              >
                Hasta
              </Label>
              <Input
                id="rendimiento-hasta"
                type="date"
                value={draft.hasta}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={
                  dateError ? "rendimiento-fechas-error" : undefined
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    hasta: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        ) : null}

        {dateError ? (
          <p
            id="rendimiento-fechas-error"
            className="mt-2 text-xs text-red-600"
            role="alert"
          >
            {dateError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            className="min-w-0 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Filtros aplicados: {buildAppliedLabel(state)}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleReset}>
              <FilterX className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Limpiar
            </Button>
            <Button type="submit" disabled={Boolean(dateError)}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
