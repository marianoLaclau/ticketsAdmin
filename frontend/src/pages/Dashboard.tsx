import { useEffect, useRef, useState } from "react";
import {
  getGetDashboardStatsQueryKey,
  getGetTicketsVencidosQueryKey,
  useGetDashboardStats,
  useGetActividadReciente,
  useGetTicketsVencidos,
  useGetMotivoStats,
} from "@workspace/api-client-react";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";
import { DashboardKpiGrid } from "@/features/dashboard/DashboardKpiGrid";
import { DashboardMotivesPriorityPanel } from "@/features/dashboard/DashboardMotivesPriorityPanel";
import { DashboardOverdueTicketsPanel } from "@/features/dashboard/DashboardOverdueTicketsPanel";
import { DashboardPeriodFilter } from "@/features/dashboard/DashboardPeriodFilter";
import { DashboardPerformancePanel } from "@/features/dashboard/DashboardPerformancePanel";
import { DashboardRecentActivityPanel } from "@/features/dashboard/DashboardRecentActivityPanel";
import { DashboardStatusDistribution } from "@/features/dashboard/DashboardStatusDistribution";
import { useDashboardPeriodUrl } from "@/features/dashboard/useDashboardPeriodUrl";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import {
  DASHBOARD_TIME_ZONE,
  getDashboardBusinessDateKey,
  getDashboardPeriodLabel,
  getDashboardRangeKey,
  getDashboardRangeLabel,
  shouldRefreshDashboardAtBusinessDateChange,
} from "@/features/dashboard/dashboard-period";

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
    : "Período completo";
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

        <DashboardPeriodFilter
          period={periodo}
          customRange={periodoPersonalizado}
          error={errorPeriodo}
          appliedPeriodLabel={appliedPeriodLabel}
          onPeriodChange={selectPeriodo}
          onFromChange={(fecha_desde) =>
            setPeriodoPersonalizado((current) => ({
              ...current,
              fecha_desde,
            }))
          }
          onToChange={(fecha_hasta) =>
            setPeriodoPersonalizado((current) => ({
              ...current,
              fecha_hasta,
            }))
          }
          onApply={applyPeriodoPersonalizado}
        />
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          {/* Distribución + Rendimiento */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <DashboardStatusDistribution
              statuses={stats?.por_estado}
              isLoading={loadingStats}
            />

            <DashboardPerformancePanel
              isLoading={loadingStats}
              resolutionRate={tasaResolucion}
              completedCount={finalizados}
              activeCount={activos}
              resolvedCount={resueltos}
              totalCount={total}
            />
          </div>

          <DashboardMotivesPriorityPanel
            motives={motivos}
            priorities={stats?.por_prioridad}
            isMotivesLoading={loadingMotivos}
            isPrioritiesLoading={loadingStats}
          />

          <DashboardOverdueTicketsPanel
            tickets={vencidos}
            overdueCount={stats?.vencidos ?? 0}
            isLoading={loadingVencidos}
            referenceTimeMs={today.getTime()}
          />
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
