import type { FormEvent } from "react";
import { CalendarRange } from "lucide-react";
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
import type {
  DashboardDateParams,
  DashboardPeriod,
} from "@/lib/dashboard-period";

interface DashboardPeriodFilterProps {
  period: DashboardPeriod;
  customRange: DashboardDateParams;
  error: string | null;
  appliedPeriodLabel: string;
  onPeriodChange: (period: DashboardPeriod) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
}

export function DashboardPeriodFilter({
  period,
  customRange,
  error,
  appliedPeriodLabel,
  onPeriodChange,
  onFromChange,
  onToChange,
  onApply,
}: DashboardPeriodFilterProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (period === "personalizado" && !error) onApply();
  };

  return (
    <form
      className="w-full rounded-xl border bg-card p-3 shadow-sm xl:w-auto"
      onSubmit={handleSubmit}
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">
          Filtrar los datos del dashboard por período
        </legend>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[220px] space-y-1.5">
            <Label
              htmlFor="dashboard-periodo"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Datos a visualizar
            </Label>
            <Select
              value={period}
              onValueChange={(value) =>
                onPeriodChange(value as DashboardPeriod)
              }
            >
              <SelectTrigger id="dashboard-periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">Todo</SelectItem>
                <SelectItem value="semana">Semana actual</SelectItem>
                <SelectItem value="mes">Mes actual</SelectItem>
                <SelectItem value="personalizado">
                  Período personalizado
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "personalizado" && (
            <>
              <div className="space-y-1.5">
                <Label
                  htmlFor="dashboard-desde"
                  className="text-xs text-muted-foreground"
                >
                  Desde
                </Label>
                <Input
                  id="dashboard-desde"
                  type="date"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error ? "dashboard-periodo-error" : undefined
                  }
                  value={customRange.fecha_desde}
                  onChange={(event) => onFromChange(event.target.value)}
                  className="w-full sm:w-[155px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="dashboard-hasta"
                  className="text-xs text-muted-foreground"
                >
                  Hasta
                </Label>
                <Input
                  id="dashboard-hasta"
                  type="date"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error ? "dashboard-periodo-error" : undefined
                  }
                  value={customRange.fecha_hasta}
                  onChange={(event) => onToChange(event.target.value)}
                  className="w-full sm:w-[155px]"
                />
              </div>
              <Button type="submit" size="sm" disabled={Boolean(error)}>
                Aplicar
              </Button>
            </>
          )}
        </div>
        {period === "personalizado" && error && (
          <p
            id="dashboard-periodo-error"
            className="mt-2 text-xs text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}
        <p
          className="mt-2 text-[11px] text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Período aplicado: {appliedPeriodLabel}
        </p>
      </fieldset>
    </form>
  );
}
