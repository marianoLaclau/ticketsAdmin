import type { FetchStatus, QueryClient } from "@tanstack/react-query";

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

export type SessionVerificationState = "settled" | "verifying" | "paused";

export function getSessionVerificationState(state: {
  isPending: boolean;
  fetchStatus: FetchStatus;
}): SessionVerificationState {
  if (state.fetchStatus === "paused") return "paused";
  if (state.isPending || state.fetchStatus === "fetching") return "verifying";
  return "settled";
}

export type SessionIdentityStatus = "unconfirmed" | "changed" | "accepted";

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
  queryClient.clear();
}
