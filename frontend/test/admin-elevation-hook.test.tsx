import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetAdminElevationQueryKey,
  getGetMeQueryKey,
  type AdminElevationStatus,
  type AuthUser,
} from "@workspace/api-client-react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import {
  useAdminElevation,
  type AdminElevationAccess,
} from "../src/hooks/use-admin-elevation.ts";

const SYSADMIN: AuthUser = {
  id: 42,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "SysAdmin",
  debe_cambiar_password: false,
};

const INACTIVE: AdminElevationStatus = {
  active: false,
  expires_at: null,
};

function activeIn(milliseconds: number): AdminElevationStatus {
  return {
    active: true,
    expires_at: new Date(Date.now() + milliseconds).toISOString(),
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function requestMethod(init: RequestInit | undefined): string {
  return init?.method?.toUpperCase() ?? "GET";
}

function createQueryClient(user: AuthUser | null = SYSADMIN): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  if (user) queryClient.setQueryData(getGetMeQueryKey(), user);
  return queryClient;
}

interface HookProbe {
  readonly current: AdminElevationAccess;
  rerender: () => void;
}

function renderHookProbe(queryClient: QueryClient, strict = false): HookProbe {
  let latest: AdminElevationAccess | null = null;

  function Probe() {
    latest = useAdminElevation();
    return null;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const probe = strict ? (
    <StrictMode>
      <Probe />
    </StrictMode>
  ) : (
    <Probe />
  );
  const view = render(probe, { wrapper: Wrapper });

  return {
    get current() {
      assert.ok(latest);
      return latest;
    },
    rerender: () => view.rerender(probe),
  };
}

function storageSnapshot(storage: Storage): Record<string, string | null> {
  return Object.fromEntries(
    Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index);
      return [key ?? `missing-${index}`, key ? storage.getItem(key) : null];
    }),
  );
}

test("consulta la elevación activa por identidad y la revalida al remontar", async (t) => {
  let getCalls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(requestUrl(input), "/api/auth/admin-elevation");
      assert.equal(requestMethod(init), "GET");
      getCalls += 1;
      return jsonResponse(activeIn(60_000 + getCalls));
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const first = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(first.current.state, "ready"));
  assert.equal(getCalls, 1);
  const stableBoundary = {
    version: first.current.accessVersion,
    generation: first.current.accessGeneration,
  };
  act(() => {
    first.rerender();
    first.rerender();
  });
  assert.deepEqual(
    {
      version: first.current.accessVersion,
      generation: first.current.accessGeneration,
    },
    stableBoundary,
  );
  assert.deepEqual(
    queryClient
      .getQueryCache()
      .findAll()
      .map((query) => query.queryKey)
      .find((key) => key[0] === getGetAdminElevationQueryKey()[0]),
    [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
  );

  cleanup();
  const reloaded = renderHookProbe(queryClient);
  await waitFor(() => {
    assert.equal(getCalls, 2);
    assert.equal(reloaded.current.state, "ready");
  });
});

test("mantiene una única frontera estable bajo StrictMode", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(activeIn(60_000)),
  );
  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const probe = renderHookProbe(queryClient, true);
  await waitFor(() => assert.equal(probe.current.state, "ready"));
  const committed = {
    version: probe.current.accessVersion,
    generation: probe.current.accessGeneration,
  };
  assert.ok(committed.version > 0);

  act(() => {
    probe.rerender();
    probe.rerender();
  });
  assert.deepEqual(
    {
      version: probe.current.accessVersion,
      generation: probe.current.accessGeneration,
    },
    committed,
  );
});

test("presenta el secreto una vez y no lo deja en cachés, storage ni headers posteriores", async (t) => {
  const secret = "clave-ultra-reservada";
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let serverStatus = INACTIVE;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: requestUrl(input), init };
      calls.push(call);
      if (requestMethod(init) === "POST") {
        serverStatus = activeIn(60_000);
      }
      return jsonResponse(serverStatus);
    },
  );

  localStorage.clear();
  sessionStorage.clear();
  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "missing"));

  let elevated = false;
  await act(async () => {
    elevated = await probe.current.elevate(secret);
  });
  assert.equal(elevated, true);
  await waitFor(() => assert.equal(probe.current.state, "ready"));

  const posts = calls.filter((call) => requestMethod(call.init) === "POST");
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(String(posts[0]?.init?.body)), {
    admin_key: secret,
  });
  assert.equal(new Headers(posts[0]?.init?.headers).has("x-admin-key"), false);

  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
      exact: true,
    });
  });

  const querySnapshot = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => ({ key: query.queryKey, state: query.state.data }));
  assert.equal(JSON.stringify(querySnapshot).includes(secret), false);
  assert.equal(queryClient.getMutationCache().getAll().length, 0);
  assert.equal(
    JSON.stringify(storageSnapshot(localStorage)).includes(secret),
    false,
  );
  assert.equal(
    JSON.stringify(storageSnapshot(sessionStorage)).includes(secret),
    false,
  );
  assert.equal(JSON.stringify(probe.current).includes(secret), false);

  const downstreamHeaders = new Headers(probe.current.adminRequest.headers);
  assert.equal(downstreamHeaders.get("x-admin-intent"), "1");
  assert.equal(downstreamHeaders.has("x-admin-key"), false);
  for (const call of calls.filter(
    (candidate) => requestMethod(candidate.init) !== "POST",
  )) {
    const headers = new Headers(call.init?.headers);
    assert.equal(
      JSON.stringify([...headers.entries()]).includes(secret),
      false,
    );
  }
});

test("falla cerrado mientras verifica identidad y ante un GET administrativo fallido", async (t) => {
  let elevationFails = false;
  let resolveIdentity: ((response: Response) => void) | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (requestUrl(input) === "/api/auth/me") {
      return new Promise<Response>((resolve) => {
        resolveIdentity = resolve;
      });
    }
    return elevationFails
      ? jsonResponse(
          { code: "ADMIN_ELEVATION_UNAVAILABLE", error: "No disponible" },
          503,
        )
      : jsonResponse(activeIn(60_000));
  });

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "ready"));

  act(() => {
    void queryClient.invalidateQueries({
      queryKey: getGetMeQueryKey(),
      exact: true,
    });
  });
  await waitFor(() => {
    assert.ok(resolveIdentity);
    assert.equal(probe.current.state, "pending");
    assert.deepEqual(probe.current.adminRequest, {});
  });

  await act(async () => {
    resolveIdentity?.(jsonResponse(SYSADMIN));
  });
  await waitFor(() => assert.equal(probe.current.state, "ready"));

  elevationFails = true;
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
      exact: true,
    });
  });
  await waitFor(() => assert.equal(probe.current.state, "missing"));
  assert.equal((probe.current.error as { status?: number }).status, 503);
  assert.deepEqual(probe.current.adminRequest, {});
});

test("expone de forma cerrada errores 401, 429 y 503 sin bloquear reintentos", async (t) => {
  const failures = [
    { status: 401, code: "ADMIN_ELEVATION_INVALID" },
    { status: 429, code: "ADMIN_ELEVATION_RATE_LIMITED" },
    { status: 503, code: "ADMIN_ELEVATION_UNAVAILABLE" },
  ];
  let postIndex = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) !== "POST") return jsonResponse(INACTIVE);
      const failure = failures[postIndex];
      assert.ok(failure);
      postIndex += 1;
      return jsonResponse(
        { code: failure.code, error: "Rechazada" },
        failure.status,
      );
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "missing"));

  for (const failure of failures) {
    let result = true;
    await act(async () => {
      result = await probe.current.elevate(`intento-${failure.status}`);
    });
    assert.equal(result, false);
    assert.equal(probe.current.state, "missing");
    assert.equal(probe.current.action, "idle");
    assert.equal(
      (probe.current.error as { status?: number }).status,
      failure.status,
    );
    assert.deepEqual(probe.current.adminRequest, {});
  }
  assert.equal(postIndex, failures.length);
});

test("revoca la elevación y retira inmediatamente la intención administrativa", async (t) => {
  let deleteCalls = 0;
  let serverStatus = activeIn(60_000);
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) === "DELETE") {
        deleteCalls += 1;
        serverStatus = INACTIVE;
      }
      return jsonResponse(serverStatus);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "ready"));
  const versionBeforeRevoke = probe.current.accessVersion;

  let revoked = false;
  await act(async () => {
    revoked = await probe.current.revoke();
  });
  assert.equal(revoked, true);
  assert.equal(deleteCalls, 1);
  assert.equal(probe.current.state, "missing");
  assert.deepEqual(probe.current.adminRequest, {});
  assert.notEqual(probe.current.accessVersion, versionBeforeRevoke);
});

test("un GET concurrente y tardío no pisa una elevación confirmada", async (t) => {
  let serverStatus = INACTIVE;
  let getCalls = 0;
  let resolveStaleGet: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) === "POST") {
        serverStatus = activeIn(60_000);
        return jsonResponse(serverStatus);
      }

      getCalls += 1;
      if (getCalls === 2) {
        return new Promise<Response>((resolve) => {
          resolveStaleGet = resolve;
        });
      }
      return jsonResponse(serverStatus);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "missing"));

  let staleRefetch: Promise<void> | undefined;
  act(() => {
    staleRefetch = queryClient.refetchQueries({
      queryKey: [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
      exact: true,
    });
  });
  await waitFor(() => assert.ok(resolveStaleGet));

  let elevated = false;
  await act(async () => {
    elevated = await probe.current.elevate("secreto-de-carrera");
  });
  assert.equal(elevated, true);
  await waitFor(() => assert.equal(probe.current.state, "ready"));

  await act(async () => {
    resolveStaleGet?.(jsonResponse(INACTIVE));
    await staleRefetch;
  });
  await waitFor(() => assert.equal(probe.current.state, "ready"));
  assert.equal(
    queryClient.getQueryData<AdminElevationStatus>([
      ...getGetAdminElevationQueryKey(),
      "user",
      SYSADMIN.id,
    ])?.active,
    true,
  );
});

test("un GET concurrente y tardío no restaura una elevación revocada", async (t) => {
  let serverStatus = activeIn(60_000);
  let getCalls = 0;
  let resolveStaleGet: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) === "DELETE") {
        serverStatus = INACTIVE;
        return jsonResponse(serverStatus);
      }

      getCalls += 1;
      if (getCalls === 2) {
        return new Promise<Response>((resolve) => {
          resolveStaleGet = resolve;
        });
      }
      return jsonResponse(serverStatus);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "ready"));

  let staleRefetch: Promise<void> | undefined;
  act(() => {
    staleRefetch = queryClient.refetchQueries({
      queryKey: [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
      exact: true,
    });
  });
  await waitFor(() => assert.ok(resolveStaleGet));

  let revoked = false;
  await act(async () => {
    revoked = await probe.current.revoke();
  });
  assert.equal(revoked, true);
  await waitFor(() => assert.equal(probe.current.state, "missing"));

  await act(async () => {
    resolveStaleGet?.(jsonResponse(activeIn(60_000)));
    await staleRefetch;
  });
  await waitFor(() => assert.equal(probe.current.state, "missing"));
  assert.deepEqual(
    queryClient.getQueryData([
      ...getGetAdminElevationQueryKey(),
      "user",
      SYSADMIN.id,
    ]),
    INACTIVE,
  );
});

test("bloquea al vencer y vuelve a consultar el estado del servidor", async (t) => {
  const scheduleNormally = window.setTimeout.bind(window);
  let expirationCallback: (() => void) | undefined;
  t.mock.method(window, "setTimeout", (handler, timeout, ...arguments_) => {
    if ((timeout ?? 0) > 30_000 && typeof handler === "function") {
      expirationCallback = () => handler(...arguments_);
      return 2_000_000_000;
    }
    return scheduleNormally(handler, timeout, ...arguments_);
  });
  let getCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    getCalls += 1;
    return jsonResponse(getCalls === 1 ? activeIn(60_000) : INACTIVE);
  });

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "ready"));
  const generationBeforeExpiry = probe.current.accessGeneration;
  assert.ok(expirationCallback);

  act(() => expirationCallback?.());

  await waitFor(() => {
    assert.equal(getCalls, 2);
    assert.equal(probe.current.state, "missing");
  });
  assert.ok(probe.current.accessGeneration > generationBeforeExpiry);
  assert.deepEqual(probe.current.adminRequest, {});
});

test("descarta la respuesta de una identidad anterior aunque el transporte ignore abort", async (t) => {
  let resolveOldPost: ((response: Response) => void) | undefined;
  let oldPostStarted = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) === "POST") {
        oldPostStarted = true;
        return new Promise<Response>((resolve) => {
          resolveOldPost = resolve;
        });
      }
      return jsonResponse(INACTIVE);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "missing"));
  const generationBeforeChange = probe.current.accessGeneration;

  let oldResultPromise: Promise<boolean> | undefined;
  act(() => {
    oldResultPromise = probe.current.elevate("secreto-identidad-anterior");
  });
  await waitFor(() => assert.equal(oldPostStarted, true));

  const nextUser: AuthUser = {
    ...SYSADMIN,
    id: 77,
    email: "grace@example.test",
  };
  act(() => {
    queryClient.setQueryData(getGetMeQueryKey(), nextUser);
  });
  await waitFor(() => assert.equal(probe.current.state, "missing"));
  assert.ok(probe.current.accessGeneration > generationBeforeChange);
  const generationForNextUser = probe.current.accessGeneration;

  assert.ok(resolveOldPost);
  await act(async () => {
    resolveOldPost?.(jsonResponse(activeIn(60_000)));
    assert.equal(await oldResultPromise, false);
  });
  assert.equal(probe.current.state, "missing");

  act(() => {
    queryClient.setQueryData(getGetMeQueryKey(), SYSADMIN);
  });
  await waitFor(() => {
    assert.equal(probe.current.state, "missing");
    assert.ok(probe.current.accessGeneration > generationForNextUser);
  });
  assert.deepEqual(
    queryClient.getQueryData([
      ...getGetAdminElevationQueryKey(),
      "user",
      SYSADMIN.id,
    ]),
    INACTIVE,
  );
});

test("el lock síncrono reduce un doble submit a un único POST", async (t) => {
  let postCalls = 0;
  let serverStatus = INACTIVE;
  let resolvePost: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestMethod(init) !== "POST") return jsonResponse(serverStatus);
      postCalls += 1;
      return new Promise<Response>((resolve) => {
        resolvePost = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);
  await waitFor(() => assert.equal(probe.current.state, "missing"));

  let first: Promise<boolean> | undefined;
  let second: Promise<boolean> | undefined;
  act(() => {
    first = probe.current.elevate("primera-clave");
    second = probe.current.elevate("segunda-clave");
  });
  assert.equal(await second, false);
  await waitFor(() => assert.equal(postCalls, 1));
  assert.ok(resolvePost);

  await act(async () => {
    serverStatus = activeIn(60_000);
    resolvePost?.(jsonResponse(serverStatus));
    assert.equal(await first, true);
  });
  assert.equal(postCalls, 1);
  await waitFor(() => assert.equal(probe.current.state, "ready"));
});

test("no consulta ni eleva con contraseña temporal o identidad no SysAdmin", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(INACTIVE),
  );
  const queryClient = createQueryClient({
    ...SYSADMIN,
    rol: "Operador",
    debe_cambiar_password: true,
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const probe = renderHookProbe(queryClient);

  assert.equal(probe.current.state, "missing");
  assert.equal(await probe.current.elevate("no-debe-enviarse"), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});
