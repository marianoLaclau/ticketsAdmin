import type { QueryClient } from "@tanstack/react-query";

/**
 * React Query puede conservar `data` cuando un refetch termina en error. La
 * entrada pública solo debe confiar en el usuario después de que la
 * revalidación actual haya finalizado correctamente.
 */
export function hasConfirmedPublicSession<T>(
  user: T | null | undefined,
  isError: boolean,
  isFetching: boolean,
): user is T {
  return user != null && !isError && !isFetching;
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
 * Un evento terminal del servidor es autoritativo: ninguna respuesta o dato
 * de la identidad anterior debe seguir visible mientras se revalida la cookie
 * actual desde la entrada pública.
 */
export function clearRevokedSessionState(queryClient: QueryClient): void {
  queryClient.clear();
}
