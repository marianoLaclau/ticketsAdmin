import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import type { AdminElevationStatus } from "@workspace/api-client-react";
import { getApiErrorStatus, getServerErrorCode } from "./error-messages.ts";

const ADMIN_ELEVATION_REQUIRED_CODE = "ADMIN_ELEVATION_REQUIRED";

interface PendingReconciliation {
  dirty: boolean;
  readonly promise: Promise<void>;
  readonly complete: () => void;
}

const pendingReconciliations = new WeakMap<
  QueryClient,
  PendingReconciliation
>();

export const INACTIVE_ADMIN_ELEVATION = Object.freeze({
  active: false,
  expires_at: null,
}) satisfies AdminElevationStatus;

/**
 * Las consultas de elevacion agregan la identidad a la clave generada por la
 * API. El predicado es deliberadamente exacto: no incluye /auth/me ni una
 * consulta futura que solo comparta parte del path.
 */
export function isIdentityScopedAdminElevationQueryKey(
  queryKey: QueryKey,
  elevationKey: QueryKey,
): boolean {
  if (queryKey.length !== elevationKey.length + 2) return false;

  return (
    elevationKey.every((segment, index) => queryKey[index] === segment) &&
    queryKey[elevationKey.length] === "user"
  );
}

function elevationQueries(elevationKey: QueryKey) {
  return {
    predicate: (query: Query) =>
      isIdentityScopedAdminElevationQueryKey(query.queryKey, elevationKey),
  };
}

function observedElevationQueries(elevationKey: QueryKey) {
  return {
    predicate: (query: Query) =>
      query.getObserversCount() > 0 &&
      isIdentityScopedAdminElevationQueryKey(query.queryKey, elevationKey),
  };
}

export function isAdminElevationRequiredError(error: unknown): boolean {
  return (
    getApiErrorStatus(error) === 401 &&
    getServerErrorCode(error) === ADMIN_ELEVATION_REQUIRED_CODE
  );
}

async function drainAdminElevationReconciliation(
  queryClient: QueryClient,
  elevationKey: QueryKey,
  state: PendingReconciliation,
): Promise<void> {
  const allElevations = elevationQueries(elevationKey);
  const cancellation = queryClient.cancelQueries(allElevations, {
    silent: true,
    revert: false,
  });
  queryClient.setQueriesData<AdminElevationStatus>(
    allElevations,
    INACTIVE_ADMIN_ELEVATION,
  );
  await cancellation.catch(() => undefined);

  while (true) {
    state.dirty = false;
    await queryClient
      .invalidateQueries(
        {
          ...observedElevationQueries(elevationKey),
          refetchType: "active",
        },
        { cancelRefetch: false },
      )
      .catch(() => undefined);

    if (state.dirty) continue;

    // No debe existir un `.finally` entre el ultimo chequeo y el delete: si
    // llega otro 401 luego del delete, creara una reconciliacion nueva.
    if (pendingReconciliations.get(queryClient) === state) {
      pendingReconciliations.delete(queryClient);
    }
    state.complete();
    return;
  }
}

/**
 * Cierra primero todas las elevaciones locales y reconcilia luego, contra el
 * servidor, solamente las que tienen un observer montado. Las temporalmente
 * disabled quedan invalidas y se refetchean al volver a habilitarse; las
 * activas lo hacen ahora. La promesa se comparte para que una rafaga de 401
 * no dispare GETs ni bucles paralelos.
 */
export function reconcileAdminElevationQueries(
  queryClient: QueryClient,
  elevationKey: QueryKey,
): Promise<void> {
  const allElevations = elevationQueries(elevationKey);
  const pending = pendingReconciliations.get(queryClient);
  if (pending) {
    pending.dirty = true;
    queryClient.setQueriesData<AdminElevationStatus>(
      allElevations,
      INACTIVE_ADMIN_ELEVATION,
    );
    // setQueriesData vuelve la query fresh. Si el observer esta disabled hay
    // que conservar la invalidacion para que se reconcilie al habilitarse,
    // pero sin reiniciar ni cancelar el GET autoritativo que ya esta en curso.
    void queryClient.invalidateQueries({
      ...observedElevationQueries(elevationKey),
      refetchType: "none",
    });
    return pending.promise;
  }

  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const reconciliation: PendingReconciliation = {
    dirty: false,
    promise,
    complete,
  };
  pendingReconciliations.set(queryClient, reconciliation);
  void drainAdminElevationReconciliation(
    queryClient,
    elevationKey,
    reconciliation,
  ).catch(() => {
    if (pendingReconciliations.get(queryClient) === reconciliation) {
      pendingReconciliations.delete(queryClient);
    }
    reconciliation.complete();
  });
  return reconciliation.promise;
}

/**
 * Devuelve la reconciliacion iniciada para que la politica global pueda hacer
 * early return sin tratar este 401 como una perdida de sesion.
 */
export function handleAdminElevationRequired(
  queryClient: QueryClient,
  error: unknown,
  elevationKey: QueryKey,
): Promise<void> | null {
  if (!isAdminElevationRequiredError(error)) return null;
  return reconcileAdminElevationQueries(queryClient, elevationKey);
}
