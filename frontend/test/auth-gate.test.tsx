import assert from "node:assert/strict";
import test from "node:test";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
  type QueryKey,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import { AuthGate } from "../src/features/auth/AuthGate.tsx";
import { clearIdentityScopedCache } from "../src/lib/session-state.ts";

const ignoreSessionLoss = () => undefined;

notifyManager.setNotifyFunction((callback) => {
  act(callback);
});
notifyManager.setScheduler(queueMicrotask);

const userA: AuthUser = {
  id: 11,
  nombre: "Ada",
  apellido: "A",
  email: "ada@example.test",
  rol: "Operador",
  debe_cambiar_password: false,
};

const userB: AuthUser = {
  id: 22,
  nombre: "Beto",
  apellido: "B",
  email: "beto@example.test",
  rol: "Operador",
  debe_cambiar_password: false,
};

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

async function flushQueryNotifications(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createJsonResponse(body: unknown): Response {
  return {
    body: {} as ReadableStream<Uint8Array>,
    headers: new Headers({ "content-type": "application/json" }),
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(body),
    url: "/api/auth/me",
  } as Response;
}

function SessionHarness({
  initialAcceptedUserId,
  onConfirmedSessionLoss,
  queryClient,
  sessionQueryKey,
}: {
  initialAcceptedUserId: number | null;
  onConfirmedSessionLoss: () => void;
  queryClient: QueryClient;
  sessionQueryKey: QueryKey;
}) {
  const [acceptedUserId, setAcceptedUserId] = useState<number | null>(
    initialAcceptedUserId,
  );
  const acceptedUserIdRef = useRef(initialAcceptedUserId);
  const acceptUserId = useCallback(
    (userId: number) => {
      if (acceptedUserIdRef.current !== userId) {
        clearIdentityScopedCache(queryClient, sessionQueryKey);
        acceptedUserIdRef.current = userId;
      }
      setAcceptedUserId(userId);
    },
    [queryClient, sessionQueryKey],
  );

  return (
    <AuthGate
      acceptedUserId={acceptedUserId}
      onAcceptUserId={acceptUserId}
      onConfirmedSessionLoss={onConfirmedSessionLoss}
      passwordChangeContent={
        <p data-testid="password-change-content">Cambiar contraseña</p>
      }
    >
      <p data-testid="protected-content">Usuario {acceptedUserId}</p>
    </AuthGate>
  );
}

function renderGate(
  queryClient: QueryClient,
  initialAcceptedUserId: number | null,
  onConfirmedSessionLoss: () => void = ignoreSessionLoss,
) {
  const sessionQueryKey = getGetMeQueryKey();
  const location = memoryLocation({ path: "/tickets" });

  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <SessionHarness
          initialAcceptedUserId={initialAcceptedUserId}
          onConfirmedSessionLoss={onConfirmedSessionLoss}
          queryClient={queryClient}
          sessionQueryKey={sessionQueryKey}
        />
      </Router>
    </QueryClientProvider>,
  );

  return sessionQueryKey;
}

test("una entrada protegida sin caché verifica y acepta la sesión", async (t) => {
  const queryClient = createQueryClient();
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    createJsonResponse(userA),
  );
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderGate(queryClient, null);

  assert.equal(screen.queryByTestId("protected-content"), null);
  await waitFor(() => {
    assert.equal(
      screen.getByTestId("protected-content").textContent,
      "Usuario 11",
    );
  });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("un cambio A→B bloquea el árbol y purga el estado de A antes de mostrar B", async (t) => {
  const queryClient = createQueryClient();
  const sessionQueryKey = getGetMeQueryKey();
  const deferredUser = createDeferred<AuthUser>();
  t.after(() => {
    deferredUser.resolve(userB);
    cleanup();
    queryClient
      .getMutationCache()
      .getAll()
      .forEach((mutation) => mutation.destroy());
    queryClient.clear();
  });

  queryClient.setQueryData(sessionQueryKey, userA, { updatedAt: 1 });
  queryClient.setQueryData(["tickets"], [{ id: 91, ownerUserId: userA.id }]);
  queryClient.getMutationCache().build(queryClient, {
    mutationKey: ["update-ticket", 91],
    mutationFn: async () => undefined,
  });
  renderGate(queryClient, userA.id);
  assert.equal(
    screen.getByTestId("protected-content").textContent,
    "Usuario 11",
  );

  const transition = queryClient.fetchQuery({
    queryKey: sessionQueryKey,
    queryFn: () => deferredUser.promise,
    staleTime: 0,
  });

  await flushQueryNotifications();
  assert.equal(screen.queryByTestId("protected-content"), null);
  assert.notEqual(queryClient.getQueryData(["tickets"]), undefined);

  deferredUser.resolve(userB);
  await transition;

  await waitFor(() => {
    assert.equal(
      screen.getByTestId("protected-content").textContent,
      "Usuario 22",
    );
  });
  assert.deepEqual(queryClient.getQueryData(sessionQueryKey), userB);
  assert.equal(queryClient.getQueryData(["tickets"]), undefined);
  assert.equal(queryClient.getMutationCache().getAll().length, 0);
});

test("un 401 de una identidad aceptada informa la pérdida una sola vez", async (t) => {
  const queryClient = createQueryClient();
  const sessionQueryKey = getGetMeQueryKey();
  const unauthorizedError = Object.assign(new Error("Sesión vencida"), {
    status: 401,
  });
  let reportedLosses = 0;
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  queryClient.setQueryData(sessionQueryKey, userA, { updatedAt: 1 });
  renderGate(queryClient, userA.id, () => {
    reportedLosses += 1;
  });
  assert.equal(
    screen.getByTestId("protected-content").textContent,
    "Usuario 11",
  );

  await assert.rejects(
    queryClient.fetchQuery({
      queryKey: sessionQueryKey,
      queryFn: async () => {
        throw unauthorizedError;
      },
      staleTime: 0,
    }),
    unauthorizedError,
  );

  await flushQueryNotifications();
  await waitFor(() => assert.equal(reportedLosses, 1));
  assert.equal(screen.queryByTestId("protected-content"), null);
  assert.equal(reportedLosses, 1);
});
