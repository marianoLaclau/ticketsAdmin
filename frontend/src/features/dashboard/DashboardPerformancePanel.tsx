import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPerformancePanelProps {
  isLoading: boolean;
  resolutionRate: number;
  completedCount: number;
  activeCount: number;
  resolvedCount: number;
  totalCount: number;
}

function GaugeRing({
  pct,
  size = 120,
  stroke = 10,
  color = "#3d7532",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * Math.min(pct / 100, 1);

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

export function DashboardPerformancePanel({
  isLoading,
  resolutionRate,
  completedCount,
  activeCount,
  resolvedCount,
  totalCount,
}: DashboardPerformancePanelProps) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Rendimiento
        </h3>
      </div>

      <div className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
        <div className="relative flex-shrink-0">
          {isLoading ? (
            <Skeleton className="h-[120px] w-[120px] rounded-full" />
          ) : (
            <>
              <GaugeRing
                pct={resolutionRate}
                size={120}
                stroke={11}
                color="#3d7532"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">
                  {resolutionRate}%
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  resueltos
                </span>
              </div>
            </>
          )}
        </div>

        <div className="grid w-full flex-1 grid-cols-2 gap-x-4 gap-y-4 md:gap-x-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Finalizados
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-0.5">
                {completedCount}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              resueltos + cerrados
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Activos
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-blue-600 mt-0.5">
                {activeCount}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">en curso</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Solo resueltos
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-green-700 mt-0.5">
                {resolvedCount}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              listos p/ cerrar
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Total general
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-0.5">
                {totalCount}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">tickets</p>
          </div>
        </div>
      </div>
    </div>
  );
}
