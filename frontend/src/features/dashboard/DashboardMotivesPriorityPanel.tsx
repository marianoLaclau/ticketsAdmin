import type { MotivoStat, PrioridadStat } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getMotivoCategoriaConfig } from "@/lib/motivos";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "#ef4444",
  alta: "#f97316",
  media: "#3b82f6",
  baja: "#22c55e",
};

const PRIORIDAD_LABEL: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

// Alto del gráfico de prioridad. La columna derecha mide esto más su leyenda;
// la izquierda crece con el catálogo de categorías, así que se la acota a la
// misma altura y se le da scroll. Sin ese tope, catorce categorías estiraban el
// contenedor y dejaban al gráfico flotando sobre un bloque de blanco.
const ALTO_GRAFICO_PRIORIDAD = 180;

interface DashboardMotivesPriorityPanelProps {
  motives: readonly MotivoStat[] | undefined;
  priorities: readonly PrioridadStat[] | undefined;
  isMotivesLoading: boolean;
  isPrioritiesLoading: boolean;
}

export function DashboardMotivesPriorityPanel({
  motives,
  priorities,
  isMotivesLoading,
  isPrioritiesLoading,
}: DashboardMotivesPriorityPanelProps) {
  const sortedMotives = (motives ?? [])
    .map((item) => {
      // Compatibilidad temporal con respuestas anteriores que agrupaban por
      // `motivo`. El contrato nuevo expone el código estable en `categoria`.
      const stat = item as typeof item & {
        categoria?: string;
        motivo_categoria?: string;
        motivo?: string;
      };
      const categoria =
        stat.categoria ??
        stat.motivo_categoria ??
        stat.motivo ??
        "sin_clasificar";

      return {
        categoria,
        cantidad: stat.cantidad,
        config: getMotivoCategoriaConfig(categoria),
      };
    })
    .sort((a, b) => b.cantidad - a.cantidad);
  const maxMotive = sortedMotives[0]?.cantidad || 1;

  const priorityData = (priorities ?? []).map((priority) => ({
    name: PRIORIDAD_LABEL[priority.prioridad] ?? priority.prioridad,
    cantidad: priority.cantidad,
    color: PRIORIDAD_COLOR[priority.prioridad] ?? "#94a3b8",
  }));

  return (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 divide-y lg:grid-cols-2 lg:items-start lg:divide-x lg:divide-y-0">
        {/* Left — Motivos ranking */}
        <div className="p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Motivos de Contacto
          </h3>
          {isMotivesLoading ? (
            <div className="space-y-3 lg:max-h-[212px] lg:overflow-hidden">
              {[1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-7 w-full" />
              ))}
            </div>
          ) : sortedMotives.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos</p>
          ) : (
            // 212px = alto del gráfico (180) + su leyenda, para que ambas
            // columnas terminen a la misma altura. En una sola columna no se
            // acota: ahí no hay nada al lado que quede desalineado.
            <div className="space-y-3 lg:max-h-[212px] lg:overflow-y-auto lg:pr-2 scroll-sutil">
              {sortedMotives.map((motive, index) => {
                const pct = (motive.cantidad / maxMotive) * 100;
                const color = motive.config.color;

                return (
                  <div
                    key={motive.categoria}
                    className="flex items-center gap-3"
                  >
                    <span className="text-[11px] font-bold text-muted-foreground w-4 text-right flex-shrink-0 tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-xs text-foreground font-medium truncate pr-2"
                          title={motive.config.label}
                        >
                          {motive.config.label}
                        </span>
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color }}
                        >
                          {motive.cantidad}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right — Prioridad bar chart */}
        <div className="p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Tickets por Prioridad
          </h3>
          {isPrioritiesLoading ? (
            <Skeleton
              className="w-full"
              style={{ height: ALTO_GRAFICO_PRIORIDAD }}
            />
          ) : priorityData.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={ALTO_GRAFICO_PRIORIDAD}>
              <BarChart
                data={priorityData}
                margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                barSize={32}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                  formatter={(value) => [value, "tickets"]}
                />
                <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Mini legend */}
          {!isPrioritiesLoading && priorityData.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {priorityData.map((priority) => (
                <div key={priority.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: priority.color }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {priority.name}
                  </span>
                  <span className="text-[11px] font-bold text-foreground">
                    {priority.cantidad}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
