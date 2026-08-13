import { useMemo, useState } from "react";
import {
  getGetRendimientoPersonasQueryKey,
  useGetRendimientoPersonas,
} from "@workspace/api-client-react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/error-messages";
import type { RendimientoUrlState } from "@/lib/rendimiento-url";
import { buildRendimientoParams } from "./rendimiento-query";
import { RendimientoPersonasPanel } from "./RendimientoPersonasPanel";
import { RendimientoRefreshStatus } from "./RendimientoRefreshStatus";

interface RendimientoPersonasViewProps {
  filters: RendimientoUrlState;
  onClearFilters: () => void;
}

export function RendimientoPersonasLoadingState() {
  return (
    <section
      className="space-y-4"
      aria-label="Cargando rendimiento individual"
      aria-busy="true"
    >
      <LoadingStatus>Cargando rendimiento individual</LoadingStatus>
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-3 rounded-xl border p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

interface RendimientoPersonasErrorStateProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export function RendimientoPersonasErrorState({
  message,
  isRetrying,
  onRetry,
}: RendimientoPersonasErrorStateProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            No pudimos cargar el rendimiento individual
          </p>
          <p className="mt-1">{message}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function RendimientoPersonasView({
  filters,
  onClearFilters,
}: RendimientoPersonasViewProps) {
  const [referenceDate] = useState(() => new Date());
  const params = useMemo(
    () => buildRendimientoParams(filters, referenceDate),
    [filters, referenceDate],
  );
  const query = useGetRendimientoPersonas(params, {
    query: {
      queryKey: getGetRendimientoPersonasQueryKey(params),
      refetchOnWindowFocus: true,
    },
  });
  const errorMessage = getUserErrorMessage(
    query.error,
    "No fue posible obtener la actividad por operador. Reintentá en unos segundos.",
  );

  if (query.isLoading) return <RendimientoPersonasLoadingState />;

  if (query.isError && !query.data) {
    return (
      <RendimientoPersonasErrorState
        message={errorMessage}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data) {
    return (
      <RendimientoPersonasErrorState
        message="La respuesta no contiene datos utilizables."
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      <RendimientoRefreshStatus
        visible={query.isFetching && !query.isRefetchError}
      />
      {query.isRefetchError ? (
        <RendimientoPersonasErrorState
          message="Conservamos el último resultado mientras reintentás la actualización."
          isRetrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <RendimientoPersonasPanel
        data={query.data}
        onClearFilters={onClearFilters}
      />
    </div>
  );
}
