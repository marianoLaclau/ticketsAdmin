import { useMemo, useState } from "react";
import {
  getGetRendimientoCalidadDatosQueryKey,
  useGetRendimientoCalidadDatos,
} from "@workspace/api-client-react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/error-messages";
import type { RendimientoUrlState } from "@/lib/rendimiento-url";
import { RendimientoQualityPanel } from "./RendimientoQualityPanel";
import { RendimientoRefreshStatus } from "./RendimientoRefreshStatus";
import { buildRendimientoParams } from "./rendimiento-query";

interface RendimientoQualityViewProps {
  filters: RendimientoUrlState;
  onClearFilters: () => void;
}

export function RendimientoQualityLoadingState() {
  return (
    <section
      className="space-y-4"
      aria-label="Cargando calidad de datos"
      aria-busy="true"
    >
      <LoadingStatus>Cargando calidad de datos</LoadingStatus>
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

interface RendimientoQualityErrorStateProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export function RendimientoQualityErrorState({
  message,
  isRetrying,
  onRetry,
}: RendimientoQualityErrorStateProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">No pudimos cargar la calidad de datos</p>
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

export function RendimientoQualityView({
  filters,
  onClearFilters,
}: RendimientoQualityViewProps) {
  const [referenceDate] = useState(() => new Date());
  const params = useMemo(
    () => buildRendimientoParams(filters, referenceDate),
    [filters, referenceDate],
  );
  const query = useGetRendimientoCalidadDatos(params, {
    query: {
      queryKey: getGetRendimientoCalidadDatosQueryKey(params),
      refetchOnWindowFocus: true,
    },
  });
  const errorMessage = getUserErrorMessage(
    query.error,
    "No fue posible obtener las coberturas. Reintentá en unos segundos.",
  );

  if (query.isLoading) return <RendimientoQualityLoadingState />;

  if (query.isError && !query.data) {
    return (
      <RendimientoQualityErrorState
        message={errorMessage}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data) {
    return (
      <RendimientoQualityErrorState
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
        <RendimientoQualityErrorState
          message="Conservamos el último resultado disponible mientras reintentás la actualización."
          isRetrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <RendimientoQualityPanel
        data={query.data}
        onClearFilters={onClearFilters}
      />
    </div>
  );
}
