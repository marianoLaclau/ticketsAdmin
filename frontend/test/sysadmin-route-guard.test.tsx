import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import { AuthGate } from "../src/features/auth/AuthGate.tsx";
import { SysAdminRouteGuard } from "../src/features/auth/SysAdminRouteGuard.tsx";
import { Sidebar } from "../src/components/layout/Sidebar.tsx";

const SYSADMIN: AuthUser = {
  id: 42,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "SysAdmin",
  debe_cambiar_password: false,
};
const OPERATOR: AuthUser = {
  ...SYSADMIN,
  id: 77,
  email: "operador@example.test",
  rol: "Operador",
};

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function ProtectedAdminContent() {
  return (
    <div>
      <Sidebar />
      <SysAdminRouteGuard homeHref="/">
        <p data-testid="admin-content">Administración</p>
      </SysAdminRouteGuard>
    </div>
  );
}

function renderWithProviders(queryClient: QueryClient, content: ReactNode) {
  const location = memoryLocation({ path: "/admin" });
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook}>{content}</Router>
      </QueryClientProvider>
    </StrictMode>,
  );
}

function renderAdminRoute(queryClient: QueryClient, user: AuthUser) {
  return renderWithProviders(
    queryClient,
    <AuthGate
      acceptedUserId={user.id}
      onAcceptUserId={() => undefined}
      onConfirmedSessionLoss={() => undefined}
      passwordChangeContent={<p>Cambiar contraseña</p>}
    >
      <ProtectedAdminContent />
    </AuthGate>,
  );
}

function statsResponse(): Response {
  return new Response(
    JSON.stringify({
      total: 0,
      vencidos: 0,
      por_estado: [],
      por_prioridad: [],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

test("AuthGate, Sidebar y guard reutilizan /me sin ciclar al remontar", async (t) => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(getGetMeQueryKey(), SYSADMIN, { updatedAt: 1 });
  let sessionFetches = 0;
  let statsFetches = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/auth/me")) sessionFetches += 1;
    if (url.includes("/api/dashboard/stats")) {
      statsFetches += 1;
      return statsResponse();
    }
    throw new Error(`Request inesperado: ${url}`);
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const firstMount = renderAdminRoute(queryClient, SYSADMIN);
  assert.equal(
    screen.getByTestId("admin-content").textContent,
    "Administración",
  );
  await waitFor(() => assert.ok(statsFetches >= 1));
  assert.equal(sessionFetches, 0);

  firstMount.unmount();
  renderAdminRoute(queryClient, SYSADMIN);
  await flushAsyncWork();
  assert.equal(
    screen.getByTestId("admin-content").textContent,
    "Administración",
  );
  assert.equal(sessionFetches, 0);
});

test("un Operador ve 403 y nunca obtiene el acceso administrativo", async (t) => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(getGetMeQueryKey(), OPERATOR, { updatedAt: 1 });
  let sessionFetches = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/auth/me")) sessionFetches += 1;
    if (url.includes("/api/dashboard/stats")) return statsResponse();
    throw new Error(`Request inesperado: ${url}`);
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderAdminRoute(queryClient, OPERATOR);
  assert.equal(screen.queryByTestId("admin-content"), null);
  assert.ok(screen.getByRole("heading", { name: /acceso denegado/i }));
  assert.equal(screen.queryByTestId("nav-link-administración"), null);
  await flushAsyncWork();
  assert.equal(sessionFetches, 0);
});

test("una /me stale con error falla cerrada sin revalidación adicional", async (t) => {
  const queryClient = createQueryClient();
  const sessionKey = getGetMeQueryKey();
  queryClient.setQueryData(sessionKey, SYSADMIN, { updatedAt: 1 });
  await assert.rejects(
    queryClient.fetchQuery({
      queryKey: sessionKey,
      queryFn: () => Promise.reject(new TypeError("offline")),
      staleTime: 0,
    }),
  );
  assert.deepEqual(queryClient.getQueryData(sessionKey), SYSADMIN);
  assert.equal(queryClient.getQueryState(sessionKey)?.status, "error");

  let sessionFetches = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/auth/me")) sessionFetches += 1;
    if (url.includes("/api/dashboard/stats")) return statsResponse();
    throw new Error(`Request inesperado: ${url}`);
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderWithProviders(queryClient, <ProtectedAdminContent />);
  assert.equal(screen.queryByTestId("admin-content"), null);
  assert.ok(screen.getByRole("heading", { name: /acceso denegado/i }));
  assert.equal(screen.queryByTestId("nav-link-administración"), null);
  await flushAsyncWork();
  assert.equal(sessionFetches, 0);
});
