import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminElevation,
  deleteAdminElevation,
  getAdminElevation,
  getGetAdminElevationQueryKey,
  getGetMeQueryKey,
  useGetMe,
  type AdminElevationStatus,
  type AuthUser,
} from "@workspace/api-client-react";
import type { AdminAccessState } from "@/lib/admin-access-state";
import { ROL_SYSADMIN } from "@/lib/roles";
import { getConfirmedSessionUser } from "@/lib/session-state";

export type AdminElevationAction = "idle" | "elevating" | "revoking";

export interface AdminElevationAccess {
  readonly user: AuthUser | null;
  readonly state: AdminAccessState;
  readonly expiresAt: string | null;
  readonly error: unknown;
  readonly action: AdminElevationAction;
  readonly elevate: (secret: string) => Promise<boolean>;
  readonly revoke: () => Promise<boolean>;
  readonly adminRequest: RequestInit;
  readonly accessVersion: number;
  readonly accessGeneration: number;
}

interface UseAdminElevationOptions {
  readonly enabled?: boolean;
}

const INACTIVE_ELEVATION = Object.freeze({
  active: false,
  expires_at: null,
}) satisfies AdminElevationStatus;

const NO_ADMIN_REQUEST = Object.freeze({}) satisfies RequestInit;
const ADMIN_INTENT_REQUEST = Object.freeze({
  headers: Object.freeze({ "x-admin-intent": "1" }),
}) satisfies RequestInit;

let nextAccessVersionValue = 0;

function nextAccessVersion(): number {
  nextAccessVersionValue += 1;
  return nextAccessVersionValue;
}

function activeExpiration(
  status: AdminElevationStatus | undefined,
  now: number,
): string | null {
  if (!status?.active || typeof status.expires_at !== "string") return null;

  const expiration = Date.parse(status.expires_at);
  return Number.isFinite(expiration) && expiration > now
    ? status.expires_at
    : null;
}

interface OperationContext {
  mounted: boolean;
  identityUserId: number | null;
  sequence: number;
  locked: boolean;
  controller: AbortController | null;
}

/**
 * Mantiene la credencial administrativa fuera de React Query y del estado de
 * React. La clave existe solamente como argumento local mientras se construye
 * el POST de elevación; las operaciones posteriores usan una intención fija.
 */
export function useAdminElevation({
  enabled = true,
}: UseAdminElevationOptions = {}): AdminElevationAccess {
  const queryClient = useQueryClient();
  const meQuery = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  });
  const confirmedUser = getConfirmedSessionUser(meQuery.data, {
    isError: meQuery.isError,
    fetchStatus: meQuery.fetchStatus,
  });
  const eligibleUserId =
    enabled &&
    confirmedUser?.rol === ROL_SYSADMIN &&
    confirmedUser.debe_cambiar_password === false
      ? confirmedUser.id
      : null;
  const elevationQueryKey = useMemo(
    () => [
      ...getGetAdminElevationQueryKey(),
      "user",
      eligibleUserId ?? "unconfirmed",
    ],
    [eligibleUserId],
  );
  const [action, setAction] = useState<AdminElevationAction>("idle");
  const [actionError, setActionError] = useState<unknown>(null);
  const operationRef = useRef<OperationContext>({
    mounted: false,
    identityUserId: eligibleUserId,
    sequence: 0,
    locked: false,
    controller: null,
  });
  const elevationQuery = useQuery({
    queryKey: elevationQueryKey,
    queryFn: async ({ signal }) => {
      const operationAtStart = operationRef.current;
      const identityAtStart = eligibleUserId;
      const sequenceAtStart = operationAtStart.sequence;
      const cachedStatus = () =>
        queryClient.getQueryData<AdminElevationStatus>(elevationQueryKey) ??
        INACTIVE_ELEVATION;

      if (identityAtStart === null || operationAtStart.locked) {
        return cachedStatus();
      }

      const status = await getAdminElevation({ signal });
      const currentOperation = operationRef.current;
      if (
        !currentOperation.mounted ||
        currentOperation.identityUserId !== identityAtStart ||
        currentOperation.sequence !== sequenceAtStart ||
        currentOperation.locked
      ) {
        return cachedStatus();
      }
      return status;
    },
    enabled: eligibleUserId !== null && action === "idle",
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: () => !operationRef.current.locked,
  });
  const refetchElevation = elevationQuery.refetch;

  useLayoutEffect(() => {
    const operation = operationRef.current;
    operation.mounted = true;
    return () => {
      operation.mounted = false;
      operation.sequence += 1;
      operation.locked = false;
      operation.controller?.abort();
      operation.controller = null;
    };
  }, []);

  useLayoutEffect(() => {
    const operation = operationRef.current;
    if (operation.identityUserId === eligibleUserId) return;

    operation.identityUserId = eligibleUserId;
    operation.sequence += 1;
    operation.locked = false;
    operation.controller?.abort();
    operation.controller = null;
    setAction("idle");
    setActionError(null);
  }, [eligibleUserId]);

  const identityIsPending = meQuery.isPending || meQuery.fetchStatus !== "idle";
  const elevationIsPending =
    eligibleUserId !== null &&
    (elevationQuery.isPending || elevationQuery.fetchStatus !== "idle");
  const expiresAt = activeExpiration(elevationQuery.data, Date.now());

  let rawState: AdminAccessState = "missing";
  if (action !== "idle" || identityIsPending || elevationIsPending) {
    rawState = "pending";
  } else if (
    eligibleUserId !== null &&
    !meQuery.isError &&
    !elevationQuery.isError &&
    expiresAt !== null
  ) {
    rawState = "ready";
  }

  const boundary = `${eligibleUserId ?? "unconfirmed"}:${rawState}:${expiresAt ?? "none"}`;
  const committedBoundaryValueRef = useRef<string | null>(null);
  const [accessBoundary, setAccessBoundary] = useState<{
    value: string | null;
    generation: number;
    version: number;
  }>({
    value: null,
    generation: 0,
    version: 0,
  });

  useLayoutEffect(() => {
    if (committedBoundaryValueRef.current === boundary) return;

    committedBoundaryValueRef.current = boundary;
    const version = nextAccessVersion();
    setAccessBoundary((current) => ({
      value: boundary,
      generation: current.value === null ? 0 : current.generation + 1,
      version,
    }));
  }, [boundary]);

  const state: AdminAccessState =
    accessBoundary.value === boundary ? rawState : "pending";

  const isCurrentOperation = useCallback(
    (userId: number, sequence: number, controller: AbortController) => {
      const operation = operationRef.current;
      return (
        operation.mounted &&
        operation.identityUserId === userId &&
        operation.sequence === sequence &&
        operation.controller === controller &&
        !controller.signal.aborted
      );
    },
    [],
  );

  const beginOperation = useCallback(
    (nextAction: Exclude<AdminElevationAction, "idle">) => {
      const operation = operationRef.current;
      if (
        !operation.mounted ||
        eligibleUserId === null ||
        operation.identityUserId !== eligibleUserId ||
        operation.locked
      ) {
        return null;
      }

      operation.locked = true;
      operation.sequence += 1;
      const controller = new AbortController();
      operation.controller = controller;
      setActionError(null);
      setAction(nextAction);
      return {
        userId: eligibleUserId,
        sequence: operation.sequence,
        controller,
      };
    },
    [eligibleUserId],
  );

  const finishOperation = useCallback(
    (userId: number, sequence: number, controller: AbortController) => {
      if (!isCurrentOperation(userId, sequence, controller)) return;

      const operation = operationRef.current;
      operation.locked = false;
      operation.controller = null;
      setAction("idle");
    },
    [isCurrentOperation],
  );

  const elevate = useCallback(
    async (secret: string): Promise<boolean> => {
      const operation = beginOperation("elevating");
      if (!operation) return false;

      try {
        await queryClient.cancelQueries({
          queryKey: elevationQueryKey,
          exact: true,
        });
        if (
          !isCurrentOperation(
            operation.userId,
            operation.sequence,
            operation.controller,
          )
        ) {
          return false;
        }

        const status = await createAdminElevation(
          { admin_key: secret },
          { signal: operation.controller.signal },
        );
        if (
          !isCurrentOperation(
            operation.userId,
            operation.sequence,
            operation.controller,
          )
        ) {
          return false;
        }

        await queryClient.cancelQueries({
          queryKey: elevationQueryKey,
          exact: true,
        });
        if (
          !isCurrentOperation(
            operation.userId,
            operation.sequence,
            operation.controller,
          )
        ) {
          return false;
        }

        queryClient.setQueryData<AdminElevationStatus>(
          elevationQueryKey,
          status,
        );
        return activeExpiration(status, Date.now()) !== null;
      } catch (error) {
        if (
          isCurrentOperation(
            operation.userId,
            operation.sequence,
            operation.controller,
          )
        ) {
          setActionError(error);
        }
        return false;
      } finally {
        finishOperation(
          operation.userId,
          operation.sequence,
          operation.controller,
        );
      }
    },
    [
      beginOperation,
      elevationQueryKey,
      finishOperation,
      isCurrentOperation,
      queryClient,
    ],
  );

  const revoke = useCallback(async (): Promise<boolean> => {
    const operation = beginOperation("revoking");
    if (!operation) return false;

    try {
      await queryClient.cancelQueries({
        queryKey: elevationQueryKey,
        exact: true,
      });
      if (
        !isCurrentOperation(
          operation.userId,
          operation.sequence,
          operation.controller,
        )
      ) {
        return false;
      }

      queryClient.setQueryData<AdminElevationStatus>(
        elevationQueryKey,
        INACTIVE_ELEVATION,
      );
      const status = await deleteAdminElevation({
        signal: operation.controller.signal,
      });
      if (
        !isCurrentOperation(
          operation.userId,
          operation.sequence,
          operation.controller,
        )
      ) {
        return false;
      }

      await queryClient.cancelQueries({
        queryKey: elevationQueryKey,
        exact: true,
      });
      if (
        !isCurrentOperation(
          operation.userId,
          operation.sequence,
          operation.controller,
        )
      ) {
        return false;
      }

      queryClient.setQueryData<AdminElevationStatus>(elevationQueryKey, status);
      return !status.active;
    } catch (error) {
      if (
        isCurrentOperation(
          operation.userId,
          operation.sequence,
          operation.controller,
        )
      ) {
        setActionError(error);
      }
      return false;
    } finally {
      finishOperation(
        operation.userId,
        operation.sequence,
        operation.controller,
      );
    }
  }, [
    beginOperation,
    elevationQueryKey,
    finishOperation,
    isCurrentOperation,
    queryClient,
  ]);

  useEffect(() => {
    if (state !== "ready" || expiresAt === null || eligibleUserId === null) {
      return;
    }

    const expiration = Date.parse(expiresAt);
    const delay = Math.max(0, expiration - Date.now());
    const timer = window.setTimeout(() => {
      const operation = operationRef.current;
      if (
        !operation.mounted ||
        operation.identityUserId !== eligibleUserId ||
        operation.locked
      ) {
        return;
      }

      queryClient.setQueryData<AdminElevationStatus>(
        elevationQueryKey,
        INACTIVE_ELEVATION,
      );
      void refetchElevation();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    elevationQueryKey,
    eligibleUserId,
    expiresAt,
    queryClient,
    refetchElevation,
    state,
  ]);

  const error =
    actionError ??
    (meQuery.isError ? meQuery.error : null) ??
    (elevationQuery.isError ? elevationQuery.error : null);

  return {
    user: confirmedUser ?? null,
    state,
    expiresAt: state === "ready" ? expiresAt : null,
    error,
    action,
    elevate,
    revoke,
    adminRequest: state === "ready" ? ADMIN_INTENT_REQUEST : NO_ADMIN_REQUEST,
    accessVersion: accessBoundary.version,
    accessGeneration: accessBoundary.generation,
  };
}
