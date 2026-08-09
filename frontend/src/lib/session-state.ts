import type { FetchStatus, QueryClient } from "@tanstack/react-query";

/**
 * La entrada pública verifica la cookie al montar, pero no mientras el usuario
 * puede estar enviando el login: un GET viejo no debe competir con ese POST.
 */
export const PUBLIC_SESSION_QUERY_POLICY = Object.freeze({
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  retry: false,
});

/**
 * React Query puede conservar `data` mientras revalida y cuando un refetch
 * termina en error. Ningún consumidor debe usar esa identidad hasta que la
 * revalidación actual haya finalizado correctamente.
 */
export function getConfirmedSessionUser<T>(
  user: T | null | undefined,
  state: { isError: boolean; fetchStatus: FetchStatus },
): T | undefined {
  return user != null && !state.isError && state.fetchStatus === "idle"
    ? user
    : undefined;
}

type SessionVerificationState = "settled" | "verifying" | "paused";

export function getSessionVerificationState(state: {
  isPending: boolean;
  fetchStatus: FetchStatus;
}): SessionVerificationState {
  if (state.fetchStatus === "paused") return "paused";
  if (state.isPending || state.fetchStatus === "fetching") return "verifying";
  return "settled";
}

type SessionIdentityStatus = "unconfirmed" | "changed" | "accepted";

/**
 * Obliga a reconciliar la caché antes de continuar con una identidad nueva.
 * El estado `accepted` es el único que habilita navegación y UI protegida.
 */
export function getSessionIdentityStatus(
  acceptedUserId: number | null,
  confirmedUserId: number | undefined,
): SessionIdentityStatus {
  if (confirmedUserId === undefined) return "unconfirmed";
  return confirmedUserId === acceptedUserId ? "accepted" : "changed";
}

/**
 * Elimina datos funcionales del usuario anterior sin remover la query activa
 * de /auth/me. Preservarla evita que un 401 recree/refetchee la misma query en
 * un loop; login reemplaza inmediatamente su contenido por el usuario nuevo.
 */
export function clearAuthenticatedQueries(
  queryClient: QueryClient,
  sessionQueryKey: readonly unknown[],
): void {
  const sessionQueryRoot = sessionQueryKey[0];
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionQueryRoot,
  });
}

/**
 * Una identidad nueva no puede heredar ni queries ni mutaciones de la
 * anterior. La query de sesión se conserva porque contiene al usuario ya
 * confirmado que está siendo aceptado.
 */
export function clearIdentityScopedCache(
  queryClient: QueryClient,
  sessionQueryKey: readonly unknown[],
): void {
  clearAuthenticatedQueries(queryClient, sessionQueryKey);
  destroySessionMutations(queryClient);
}

function destroySessionMutations(queryClient: QueryClient): void {
  const mutationCache = queryClient.getMutationCache();
  mutationCache.getAll().forEach((mutation) => mutation.destroy());
  mutationCache.clear();
}

/**
 * Un evento terminal del servidor es autoritativo: ninguna respuesta o dato
 * de la identidad anterior debe seguir visible mientras se revalida la cookie
 * actual desde la entrada pública.
 */
export function clearRevokedSessionState(queryClient: QueryClient): void {
  destroySessionMutations(queryClient);
  queryClient.clear();
}

interface RemoteSessionTransitionActions {
  resetAcceptedIdentity: () => void;
  reloadFromPublicEntry: () => void;
}

/**
 * Consume una sola vez una transición remota. La limpieza ocurre antes de
 * cambiar estado o URL para que ningún render intermedio reutilice datos.
 */
export function createRemoteSessionTransitionHandler(
  queryClient: QueryClient,
  actions: RemoteSessionTransitionActions,
): () => void {
  let handled = false;

  return () => {
    if (handled) return;
    handled = true;
    clearRevokedSessionState(queryClient);
    actions.resetAcceptedIdentity();
    actions.reloadFromPublicEntry();
  };
}
