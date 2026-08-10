import assert from "node:assert/strict";
import test from "node:test";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryObserver,
  type QueryKey,
} from "@tanstack/react-query";
import type { AdminElevationStatus } from "@workspace/api-client-react";
import {
  handleAdminElevationRequired,
  INACTIVE_ADMIN_ELEVATION,
  isAdminElevationRequiredError,
} from "../src/lib/admin-elevation-error-policy.ts";

const ELEVATION_QUERY_KEY = ["test", "admin-elevation"] as const;
const ME_QUERY_KEY = ["test", "auth-me"] as const;
const NEAR_MISS_QUERY_KEY = [...ELEVATION_QUERY_KEY, "users", 42] as const;

const ACTIVE_ELEVATION: AdminElevationStatus = {
  active: true,
  expires_at: "2099-01-01T00:00:00.000Z",
};
const SERVER_ACTIVE_ELEVATION: AdminElevationStatus = {
  active: true,
  expires_at: "2099-02-01T00:00:00.000Z",
};
const TRAILING_ACTIVE_ELEVATION: AdminElevationStatus = {
  active: true,
  expires_at: "2099-03-01T00:00:00.000Z",
};
const SESSION = {
  id: 42,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "SysAdmin",
  debe_cambiar_password: false,
};
const REQUIRED_ERROR = {
  status: 401,
  data: {
    code: "ADMIN_ELEVATION_REQUIRED",
    error: "texto deliberadamente irrelevante",
  },
};

function elevationKey(identity: number) {
  return [...ELEVATION_QUERY_KEY, "user", identity] as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function requireReconciliation(
  reconciliation: Promise<void> | null,
): Promise<void> {
  assert.ok(reconciliation);
  return reconciliation;
}

function observeFreshQuery<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
): () => void {
  const observer = new QueryObserver<T>(queryClient, {
    queryKey,
    queryFn,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return observer.subscribe(() => undefined);
}

function seedSharedState(queryClient: QueryClient): void {
  queryClient.setQueryData(elevationKey(42), ACTIVE_ELEVATION);
  queryClient.setQueryData(elevationKey(77), ACTIVE_ELEVATION);
  queryClient.setQueryData(ME_QUERY_KEY, SESSION);
  queryClient.setQueryData(NEAR_MISS_QUERY_KEY, ACTIVE_ELEVATION);
}

function assertUnrelatedStateIntact(queryClient: QueryClient): void {
  assert.deepEqual(queryClient.getQueryData(ME_QUERY_KEY), SESSION);
  assert.deepEqual(
    queryClient.getQueryData(NEAR_MISS_QUERY_KEY),
    ACTIVE_ELEVATION,
  );
}

test("la politica de query reconcilia una expiracion normal con GET inactive", async () => {
  let fallbackCalls = 0;
  let elevationGets = 0;
  let meGets = 0;
  let nearMissGets = 0;
  let reconciliation: Promise<void> | null = null;
  let queryClient!: QueryClient;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({
      onError: (error) => {
        const current = handleAdminElevationRequired(
          queryClient,
          error,
          ELEVATION_QUERY_KEY,
        );
        if (current) {
          reconciliation = current;
          return;
        }
        fallbackCalls += 1;
      },
    }),
  });
  seedSharedState(queryClient);
  const stopElevation = observeFreshQuery(queryClient, elevationKey(42), () => {
    elevationGets += 1;
    return Promise.resolve(INACTIVE_ADMIN_ELEVATION);
  });
  const stopMe = observeFreshQuery(queryClient, ME_QUERY_KEY, () => {
    meGets += 1;
    return Promise.resolve(SESSION);
  });
  const stopNearMiss = observeFreshQuery(
    queryClient,
    NEAR_MISS_QUERY_KEY,
    () => {
      nearMissGets += 1;
      return Promise.resolve(ACTIVE_ELEVATION);
    },
  );

  await assert.rejects(
    queryClient.fetchQuery({
      queryKey: ["admin", "query-rechazada"],
      queryFn: () => Promise.reject(REQUIRED_ERROR),
    }),
  );
  await requireReconciliation(reconciliation);

  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    INACTIVE_ADMIN_ELEVATION,
  );
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(77)),
    INACTIVE_ADMIN_ELEVATION,
  );
  assert.equal(elevationGets, 1);
  assert.equal(meGets, 0);
  assert.equal(nearMissGets, 0);
  assert.equal(fallbackCalls, 0);
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  stopMe();
  stopNearMiss();
  queryClient.clear();
});

test("un 401 viejo no pisa una re-elevacion confirmada por el servidor", async () => {
  const serverResponse = deferred<AdminElevationStatus>();
  let elevationGets = 0;
  let reconciliation: Promise<void> | null = null;
  let queryClient!: QueryClient;
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => {
        reconciliation = handleAdminElevationRequired(
          queryClient,
          error,
          ELEVATION_QUERY_KEY,
        );
      },
    }),
  });
  seedSharedState(queryClient);
  queryClient.setQueryData(elevationKey(42), SERVER_ACTIVE_ELEVATION);
  const stopElevation = observeFreshQuery(queryClient, elevationKey(42), () => {
    elevationGets += 1;
    return serverResponse.promise;
  });
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn: () => Promise.reject(REQUIRED_ERROR),
  });

  await assert.rejects(mutation.execute(undefined));
  const pendingReconciliation = requireReconciliation(reconciliation);
  assert.equal(elevationGets, 1);
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    INACTIVE_ADMIN_ELEVATION,
  );

  serverResponse.resolve(SERVER_ACTIVE_ELEVATION);
  await pendingReconciliation;
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    SERVER_ACTIVE_ELEVATION,
  );
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  queryClient.clear();
});

test("un 401 tardio programa la reconciliacion de un observer temporalmente disabled", async () => {
  const serverResponse = deferred<AdminElevationStatus>();
  const recovered = deferred<void>();
  let elevationGets = 0;
  let reconciliation: Promise<void> | null = null;
  let queryClient!: QueryClient;
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => {
        reconciliation = handleAdminElevationRequired(
          queryClient,
          error,
          ELEVATION_QUERY_KEY,
        );
      },
    }),
  });
  seedSharedState(queryClient);
  const elevationObserver = new QueryObserver<AdminElevationStatus>(
    queryClient,
    {
      queryKey: elevationKey(42),
      queryFn: () => {
        elevationGets += 1;
        return serverResponse.promise;
      },
      enabled: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  );
  const stopElevation = elevationObserver.subscribe((result) => {
    if (
      result.fetchStatus === "idle" &&
      result.data?.expires_at === SERVER_ACTIVE_ELEVATION.expires_at
    ) {
      recovered.resolve();
    }
  });
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn: () => Promise.reject(REQUIRED_ERROR),
  });

  await assert.rejects(mutation.execute(undefined));
  await requireReconciliation(reconciliation);
  assert.equal(elevationGets, 0);
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    INACTIVE_ADMIN_ELEVATION,
  );
  assert.equal(
    queryClient.getQueryState(elevationKey(42))?.isInvalidated,
    true,
  );
  assert.equal(
    queryClient.getQueryState(elevationKey(77))?.isInvalidated,
    false,
  );

  elevationObserver.setOptions({
    queryKey: elevationKey(42),
    queryFn: () => {
      elevationGets += 1;
      return serverResponse.promise;
    },
    enabled: true,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  assert.equal(elevationGets, 1);
  serverResponse.resolve(SERVER_ACTIVE_ELEVATION);
  await recovered.promise;

  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    SERVER_ACTIVE_ELEVATION,
  );
  assert.equal(elevationGets, 1);
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  queryClient.clear();
});

test("deduplica multiples rechazos y ejecuta un solo GET de elevacion", async () => {
  const serverResponse = deferred<AdminElevationStatus>();
  const reconciliations: Promise<void>[] = [];
  let elevationGets = 0;
  let meGets = 0;
  let queryClient!: QueryClient;
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => {
        const reconciliation = handleAdminElevationRequired(
          queryClient,
          error,
          ELEVATION_QUERY_KEY,
        );
        if (reconciliation) reconciliations.push(reconciliation);
      },
    }),
  });
  seedSharedState(queryClient);
  const stopElevation = observeFreshQuery(queryClient, elevationKey(42), () => {
    elevationGets += 1;
    return serverResponse.promise;
  });
  const stopMe = observeFreshQuery(queryClient, ME_QUERY_KEY, () => {
    meGets += 1;
    return Promise.resolve(SESSION);
  });
  const mutations = Array.from({ length: 3 }, () =>
    queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(REQUIRED_ERROR),
    }),
  );

  const results = await Promise.allSettled(
    mutations.map((mutation) => mutation.execute(undefined)),
  );
  assert.equal(
    results.every((result) => result.status === "rejected"),
    true,
  );
  assert.equal(reconciliations.length, 3);
  assert.equal(new Set(reconciliations).size, 1);
  assert.equal(elevationGets, 1);

  serverResponse.resolve(INACTIVE_ADMIN_ELEVATION);
  await reconciliations[0];
  assert.equal(elevationGets, 1);
  assert.equal(meGets, 0);
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  stopMe();
  queryClient.clear();
});

test("un 401 posterior al primer GET fuerza una reconciliacion trailing", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedSharedState(queryClient);
  let elevationGets = 0;
  let trailingReconciliation: Promise<void> | null = null;
  const elevationObserver = new QueryObserver<AdminElevationStatus>(
    queryClient,
    {
      queryKey: elevationKey(42),
      queryFn: () => {
        elevationGets += 1;
        return Promise.resolve(
          elevationGets === 1
            ? SERVER_ACTIVE_ELEVATION
            : TRAILING_ACTIVE_ELEVATION,
        );
      },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  );
  const stopElevation = elevationObserver.subscribe((result) => {
    if (
      trailingReconciliation === null &&
      result.fetchStatus === "idle" &&
      result.data?.expires_at === SERVER_ACTIVE_ELEVATION.expires_at
    ) {
      trailingReconciliation = handleAdminElevationRequired(
        queryClient,
        REQUIRED_ERROR,
        ELEVATION_QUERY_KEY,
      );
    }
  });

  const firstReconciliation = requireReconciliation(
    handleAdminElevationRequired(
      queryClient,
      REQUIRED_ERROR,
      ELEVATION_QUERY_KEY,
    ),
  );
  await firstReconciliation;

  assert.equal(trailingReconciliation, firstReconciliation);
  assert.equal(elevationGets, 2);
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    TRAILING_ACTIVE_ELEVATION,
  );
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  queryClient.clear();
});

test("un error de red en la reconciliacion conserva el cierre fail-closed", async () => {
  let reconciliation: Promise<void> | null = null;
  let elevationGets = 0;
  let queryClient!: QueryClient;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({
      onError: (error) => {
        const current = handleAdminElevationRequired(
          queryClient,
          error,
          ELEVATION_QUERY_KEY,
        );
        if (current) reconciliation = current;
      },
    }),
  });
  seedSharedState(queryClient);
  const stopElevation = observeFreshQuery(queryClient, elevationKey(42), () => {
    elevationGets += 1;
    return Promise.reject(new TypeError("offline"));
  });

  await assert.rejects(
    queryClient.fetchQuery({
      queryKey: ["admin", "query-rechazada-red"],
      queryFn: () => Promise.reject(REQUIRED_ERROR),
    }),
  );
  await requireReconciliation(reconciliation);

  assert.equal(elevationGets, 1);
  assert.deepEqual(
    queryClient.getQueryData(elevationKey(42)),
    INACTIVE_ADMIN_ELEVATION,
  );
  assertUnrelatedStateIntact(queryClient);

  stopElevation();
  queryClient.clear();
});

test("detecta exclusivamente el status y codigo estables", () => {
  assert.equal(isAdminElevationRequiredError(REQUIRED_ERROR), true);
  assert.equal(
    isAdminElevationRequiredError({
      status: 401,
      data: { code: "SESSION_INVALID", error: "ADMIN_ELEVATION_REQUIRED" },
    }),
    false,
  );
  assert.equal(
    isAdminElevationRequiredError({
      status: 403,
      data: { code: "ADMIN_ELEVATION_REQUIRED" },
    }),
    false,
  );
});
