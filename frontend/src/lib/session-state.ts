import type { QueryClient } from '@tanstack/react-query';

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
