import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import {
  getConfirmedSessionUser,
  PROTECTED_SESSION_QUERY_POLICY,
} from "@/lib/session-state";

/** Lee la identidad ya verificada sin iniciar otra transición de sesión. */
export function useProtectedSessionUser() {
  const sessionQuery = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      ...PROTECTED_SESSION_QUERY_POLICY,
    },
  });

  return getConfirmedSessionUser(sessionQuery.data, {
    isError: sessionQuery.isError,
    fetchStatus: sessionQuery.fetchStatus,
  });
}
