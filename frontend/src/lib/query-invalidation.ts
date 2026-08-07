import type { QueryClient } from "@tanstack/react-query";

const TICKETS_QUERY_ROOT = "/api/tickets";
const DASHBOARD_QUERY_ROOT = "/api/dashboard";

function isPathWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function isTicketDomainQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return (
    typeof root === "string" &&
    (isPathWithin(root, TICKETS_QUERY_ROOT) ||
      isPathWithin(root, DASHBOARD_QUERY_ROOT))
  );
}

export function invalidateTicketDomainQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => isTicketDomainQueryKey(query.queryKey),
  });
}
