import type { EstadoStat } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getEstadoLabel } from "@/lib/estados";

const ESTADO_COLOR: Record<string, { bar: string; label: string }> = {
  nuevo: { bar: "#64748b", label: "Nuevo" },
  en_proceso: {
    bar: "#3b82f6",
    label: "En proceso",
  },
  pendiente: {
    bar: "#f59e0b",
    label: getEstadoLabel("pendiente"),
  },
  resuelto: { bar: "#3d7532", label: "Resuelto" },
  cerrado: { bar: "#1e293b", label: "Cerrado" },
};

interface DashboardStatusDistributionProps {
  statuses: readonly EstadoStat[] | undefined;
  isLoading: boolean;
}

export function DashboardStatusDistribution({
  statuses,
  isLoading,
}: DashboardStatusDistributionProps) {
  const totalCount =
    statuses?.reduce((total, status) => total + status.cantidad, 0) || 0;

  return (
    <div className="p-5 border-b">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Distribución por Estado
      </h3>
      {isLoading ? (
        <Skeleton className="h-5 w-full rounded-full" />
      ) : totalCount > 0 ? (
        <>
          {/* Segmented bar */}
          <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {statuses?.map((status, index) => {
              const pct = (status.cantidad / totalCount) * 100;
              const color = ESTADO_COLOR[status.estado]?.bar ?? "#94a3b8";
              return (
                <div
                  key={status.estado}
                  style={{ width: `${pct}%`, backgroundColor: color }}
                  className={`h-full transition-all ${index === 0 ? "" : "ml-[2px]"}`}
                  title={`${ESTADO_COLOR[status.estado]?.label ?? status.estado}: ${status.cantidad}`}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {statuses?.map((status) => {
              const config = ESTADO_COLOR[status.estado];
              return (
                <div key={status.estado} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: config?.bar ?? "#94a3b8" }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {config?.label ?? status.estado}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {status.cantidad}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">Sin datos</p>
      )}
    </div>
  );
}
