import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  getGetDashboardStatsQueryKey,
  getGetTicketsVencidosQueryKey,
  useGetDashboardStats,
  useGetActividadReciente,
  useGetTicketsVencidos,
  useGetMotivoStats,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Clock,
  CheckCircle2,
  TrendingUp,
  CalendarRange,
  TriangleAlert,
} from "lucide-react";
import { DashboardKpiGrid } from "@/features/dashboard/DashboardKpiGrid";
import { DashboardMotivesPriorityPanel } from "@/features/dashboard/DashboardMotivesPriorityPanel";
import { DashboardRecentActivityPanel } from "@/features/dashboard/DashboardRecentActivityPanel";
import { DashboardStatusDistribution } from "@/features/dashboard/DashboardStatusDistribution";
import { useDashboardPeriodUrl } from "@/features/dashboard/useDashboardPeriodUrl";
import { PrioridadBadge } from "@/lib/utils-tickets";
import { getContactDisplayName } from "@/lib/contacto";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import {
  DASHBOARD_TIME_ZONE,
  getDashboardBusinessDateKey,
  getDashboardPeriodLabel,
  getDashboardRangeKey,
  getDashboardRangeLabel,
  shouldRefreshDashboardAtBusinessDateChange,
  type DashboardPeriod,
} from "@/lib/dashboard-period";

// Circular progress SVG component
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
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(pct / 100, 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

const DASHBOARD_TEMPORAL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DASHBOARD_TEMPORAL_QUERY_POLICY = {
  refetchInterval: DASHBOARD_TEMPORAL_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

export default function Dashboard() {
  const [fechaReferencia, setFechaReferencia] = useState(() => new Date());
  const {
    periodo,
    periodoPersonalizado,
    setPeriodoPersonalizado,
    errorPeriodo,
    dashboardParams,
    selectPeriodo,
    applyPeriodoPersonalizado,
  } = useDashboardPeriodUrl(fechaReferencia);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setFechaReferencia((actual) =>
        getDashboardBusinessDateKey(actual) === getDashboardBusinessDateKey(now)
          ? actual
          : now,
      );
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const businessDateKey = getDashboardBusinessDateKey(fechaReferencia);
  const dashboardRangeKey = getDashboardRangeKey(dashboardParams);

  const statsQuery = useGetDashboardStats(dashboardParams, {
    query: {
      queryKey: getGetDashboardStatsQueryKey(dashboardParams),
      ...DASHBOARD_TEMPORAL_QUERY_POLICY,
    },
  });
  const actividadQuery = useGetActividadReciente({
    limit: 12,
    ...dashboardParams,
  });
  const vencidosQuery = useGetTicketsVencidos(dashboardParams, {
    query: {
      queryKey: getGetTicketsVencidosQueryKey(dashboardParams),
      ...DASHBOARD_TEMPORAL_QUERY_POLICY,
    },
  });
  const motivosQuery = useGetMotivoStats(dashboardParams);
  const refetchStats = statsQuery.refetch;
  const refetchVencidos = vencidosQuery.refetch;
  const refreshSnapshot = useRef({
    businessDateKey,
    rangeKey: dashboardRangeKey,
  });

  useEffect(() => {
    const currentSnapshot = {
      businessDateKey,
      rangeKey: dashboardRangeKey,
    };
    const shouldRefresh = shouldRefreshDashboardAtBusinessDateChange(
      refreshSnapshot.current,
      currentSnapshot,
    );
    refreshSnapshot.current = currentSnapshot;

    if (shouldRefresh) {
      void Promise.all([refetchStats(), refetchVencidos()]);
    }
  }, [businessDateKey, dashboardRangeKey, refetchStats, refetchVencidos]);

  const { data: stats, isLoading: loadingStats } = statsQuery;
  const { data: actividades, isLoading: loadingActividad } = actividadQuery;
  const { data: vencidos, isLoading: loadingVencidos } = vencidosQuery;
  const { data: motivos, isLoading: loadingMotivos } = motivosQuery;

  const dashboardInitialError =
    (statsQuery.isLoadingError ? statsQuery.error : undefined) ??
    (actividadQuery.isLoadingError ? actividadQuery.error : undefined) ??
    (vencidosQuery.isLoadingError ? vencidosQuery.error : undefined) ??
    (motivosQuery.isLoadingError ? motivosQuery.error : undefined);
  const dashboardHasRefreshError =
    statsQuery.isRefetchError ||
    actividadQuery.isRefetchError ||
    vencidosQuery.isRefetchError ||
    motivosQuery.isRefetchError;
  const dashboardIsFetching =
    statsQuery.isFetching ||
    actividadQuery.isFetching ||
    vencidosQuery.isFetching ||
    motivosQuery.isFetching;
  const dashboardIsLoading =
    loadingStats || loadingActividad || loadingVencidos || loadingMotivos;

  const refetchDashboard = () => {
    void Promise.all([
      statsQuery.refetch(),
      actividadQuery.refetch(),
      vencidosQuery.refetch(),
      motivosQuery.refetch(),
    ]);
  };

  if (dashboardInitialError) {
    return (
      <ErrorPage
        embedded
        status={getErrorStatus(dashboardInitialError) ?? 503}
        title="No pudimos cargar el dashboard"
        message="Una o más secciones no pudieron obtener sus datos. Reintentá para volver a cargar el panel."
        onRetry={refetchDashboard}
        isRetrying={dashboardIsFetching}
      />
    );
  }

  const today = new Date();
  const dateString = today.toLocaleDateString("es-AR", {
    timeZone: DASHBOARD_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const periodoLabel = getDashboardPeriodLabel(periodo);
  const appliedPeriodLabel = dashboardParams
    ? getDashboardRangeLabel(dashboardParams)
    : "Todo el historial";
  const handlePeriodSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (periodo === "personalizado" && !errorPeriodo) {
      applyPeriodoPersonalizado();
    }
  };
  const resueltosDelPeriodo =
    periodo === "todo" ? stats?.resueltos_hoy : stats?.resueltos_periodo;

  // Estado derived values
  const nuevosSinRevisar =
    stats?.por_estado?.find((e) => e.estado === "nuevo")?.cantidad || 0;
  const enProceso =
    stats?.por_estado?.find((e) => e.estado === "en_proceso")?.cantidad || 0;
  const resueltos =
    stats?.por_estado?.find((e) => e.estado === "resuelto")?.cantidad || 0;
  const cerrados =
    stats?.por_estado?.find((e) => e.estado === "cerrado")?.cantidad || 0;
  const pendientes =
    stats?.por_estado?.find((e) => e.estado === "pendiente")?.cantidad || 0;
  const total = stats?.total || 0;

  // Rendimiento metrics
  const finalizados = resueltos + cerrados;
  const tasaResolucion =
    total > 0 ? Math.round((finalizados / total) * 100) : 0;
  const activos = enProceso + pendientes + nuevosSinRevisar;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6">
      {dashboardIsLoading ? (
        <LoadingStatus>Cargando dashboard</LoadingStatus>
      ) : null}
      {dashboardHasRefreshError ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              No pudimos actualizar todos los datos. Conservamos la última
              información disponible.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dashboardIsFetching}
              onClick={refetchDashboard}
            >
              {dashboardIsFetching ? "Actualizando..." : "Reintentar"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Sistema de Tickets
          </h1>
          <p className="text-sm text-muted-foreground capitalize">
            {dateString}
          </p>
        </div>

        <form
          className="w-full rounded-xl border bg-card p-3 shadow-sm xl:w-auto"
          onSubmit={handlePeriodSubmit}
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
                  value={periodo}
                  onValueChange={(value) =>
                    selectPeriodo(value as DashboardPeriod)
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

              {periodo === "personalizado" && (
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
                      aria-invalid={errorPeriodo ? true : undefined}
                      aria-describedby={
                        errorPeriodo ? "dashboard-periodo-error" : undefined
                      }
                      value={periodoPersonalizado.fecha_desde}
                      onChange={(event) =>
                        setPeriodoPersonalizado((actual) => ({
                          ...actual,
                          fecha_desde: event.target.value,
                        }))
                      }
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
                      aria-invalid={errorPeriodo ? true : undefined}
                      aria-describedby={
                        errorPeriodo ? "dashboard-periodo-error" : undefined
                      }
                      value={periodoPersonalizado.fecha_hasta}
                      onChange={(event) =>
                        setPeriodoPersonalizado((actual) => ({
                          ...actual,
                          fecha_hasta: event.target.value,
                        }))
                      }
                      className="w-full sm:w-[155px]"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={Boolean(errorPeriodo)}
                  >
                    Aplicar
                  </Button>
                </>
              )}
            </div>
            {periodo === "personalizado" && errorPeriodo && (
              <p
                id="dashboard-periodo-error"
                className="mt-2 text-xs text-red-600"
                role="alert"
              >
                {errorPeriodo}
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
      </div>

      <DashboardKpiGrid
        isLoading={loadingStats}
        unreviewedCount={nuevosSinRevisar}
        inProgressCount={enProceso}
        overdueCount={stats?.vencidos || 0}
        resolvedCount={resueltosDelPeriodo || 0}
        resolvedPeriodLabel={periodoLabel}
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          {/* Distribución + Rendimiento */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <DashboardStatusDistribution
              statuses={stats?.por_estado}
              isLoading={loadingStats}
            />

            {/* Rendimiento */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Rendimiento
                </h3>
              </div>

              <div className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
                {/* Gauge ring */}
                <div className="relative flex-shrink-0">
                  {loadingStats ? (
                    <Skeleton className="h-[120px] w-[120px] rounded-full" />
                  ) : (
                    <>
                      <GaugeRing
                        pct={tasaResolucion}
                        size={120}
                        stroke={11}
                        color="#3d7532"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-foreground">
                          {tasaResolucion}%
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          resueltos
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Stats grid */}
                <div className="grid w-full flex-1 grid-cols-2 gap-x-4 gap-y-4 md:gap-x-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Finalizados
                    </p>
                    {loadingStats ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-foreground mt-0.5">
                        {finalizados}
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
                    {loadingStats ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-blue-600 mt-0.5">
                        {activos}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      en curso
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Solo resueltos
                    </p>
                    {loadingStats ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-green-700 mt-0.5">
                        {resueltos}
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
                    {loadingStats ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-foreground mt-0.5">
                        {total}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">tickets</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DashboardMotivesPriorityPanel
            motives={motivos}
            priorities={stats?.por_prioridad}
            isMotivesLoading={loadingMotivos}
            isPrioritiesLoading={loadingStats}
          />

          {/* Tickets vencidos */}
          <div className="bg-card border border-red-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-red-50 px-5 py-3 border-b border-red-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-red-800 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5" />
                Requieren Atención Inmediata
              </h3>
              {stats?.vencidos ? (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  {stats.vencidos} vencidos
                </span>
              ) : null}
            </div>
            {loadingVencidos ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !vencidos || vencidos.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                <p className="text-sm text-slate-400">
                  Todos los tickets están al día
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <caption className="sr-only">
                    Tickets vencidos que requieren atención inmediata
                  </caption>
                  <thead className="text-[11px] uppercase text-muted-foreground bg-slate-50/60">
                    <tr>
                      <th scope="col" className="px-5 py-2 font-medium">
                        Contacto
                      </th>
                      <th scope="col" className="px-5 py-2 font-medium">
                        Motivo
                      </th>
                      <th scope="col" className="px-5 py-2 font-medium">
                        Prioridad
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-2 font-medium text-right"
                      >
                        Venció hace
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vencidos.map((ticket) => {
                      const fechaLimite = ticket.fecha_limite;
                      if (!fechaLimite) return null;

                      const limitDate = new Date(fechaLimite);
                      const diffHours = Math.floor(
                        (today.getTime() - limitDate.getTime()) /
                          (1000 * 60 * 60),
                      );
                      const vencioStr =
                        diffHours > 24
                          ? `${Math.floor(diffHours / 24)}d`
                          : `${diffHours}h`;
                      return (
                        <tr key={ticket.id}>
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="-m-1 block rounded-md p-1 underline-offset-4 hover:bg-red-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <span className="block text-sm font-medium text-foreground hover:underline">
                                {getContactDisplayName(ticket)}
                              </span>
                              {ticket.empresa && (
                                <span className="block text-[11px] text-slate-400">
                                  {ticket.empresa}
                                </span>
                              )}
                            </Link>
                          </td>
                          <td
                            className="px-5 py-2.5 text-slate-600 text-sm truncate max-w-[180px]"
                            title={ticket.motivo}
                          >
                            {ticket.motivo}
                          </td>
                          <td className="px-5 py-2.5">
                            <PrioridadBadge prioridad={ticket.prioridad} />
                          </td>
                          <td className="px-5 py-2.5 text-right font-bold text-red-600 text-xs">
                            {vencioStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DashboardRecentActivityPanel
          activities={actividades}
          isLoading={loadingActividad}
          title={
            periodo === "todo"
              ? "Actividad Reciente"
              : `Actividad ${periodoLabel}`
          }
        />
      </div>
    </div>
  );
}
