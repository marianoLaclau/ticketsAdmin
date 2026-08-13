import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  getGetMeQueryKey,
  type AuthUser,
  type TicketDetail as TicketDetailData,
} from "@workspace/api-client-react";
import { AuthGate } from "../src/features/auth/AuthGate.tsx";
import { SysAdminRouteGuard } from "../src/features/auth/SysAdminRouteGuard.tsx";
import { Sidebar } from "../src/components/layout/Sidebar.tsx";
import TicketDetailPage from "../src/pages/TicketDetail.tsx";

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
const CONTROLLER: AuthUser = {
  ...SYSADMIN,
  id: 88,
  email: "controller@example.test",
  rol: "Controller",
};
const TICKET: TicketDetailData = {
  id: 226,
  version: 1,
  conversation_id: "conversation-226",
  hora: "10:25",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "1160000226",
  dni: "30111222",
  empresa: "GSB",
  estado_empleado: "Activo",
  email: "ana@example.test",
  motivo: "Consulta por liquidación",
  motivo_categoria: "bajas_liquidacion",
  resumen: "Solicita revisar su liquidación final.",
  notificado: true,
  estado: "en_proceso",
  prioridad: "media",
  asignado_usuario_id: SYSADMIN.id,
  asignado_a: "Ada Lovelace",
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-12T13:25:00.000Z",
  fecha_limite: "2026-08-14T13:25:00.000Z",
  fecha_resolucion: null,
  progreso: 50,
  seguimientos: [],
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

test("abrir un ticket reutiliza la sesión confirmada sin refetchear /me", async (t) => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(getGetMeQueryKey(), SYSADMIN, { updatedAt: 1 });
  const previousAddEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "addEventListener",
  );
  const previousRemoveEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "removeEventListener",
  );
  Object.defineProperties(globalThis, {
    addEventListener: {
      configurable: true,
      value: window.addEventListener.bind(window),
    },
    removeEventListener: {
      configurable: true,
      value: window.removeEventListener.bind(window),
    },
  });
  let sessionFetches = 0;
  let ticketFetches = 0;
  let seguimientoFetches = 0;
  const unexpectedSessionRequest = new Promise<Response>(() => undefined);

  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/auth/me")) {
      sessionFetches += 1;
      return unexpectedSessionRequest;
    }
    if (url.includes("/api/tickets/226/seguimientos")) {
      seguimientoFetches += 1;
      return jsonResponse([]);
    }
    if (url.includes("/api/tickets/226")) {
      ticketFetches += 1;
      return jsonResponse(TICKET);
    }
    throw new Error(`Request inesperado: ${url}`);
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
    if (previousAddEventListener) {
      Object.defineProperty(
        globalThis,
        "addEventListener",
        previousAddEventListener,
      );
    } else {
      Reflect.deleteProperty(globalThis, "addEventListener");
    }
    if (previousRemoveEventListener) {
      Object.defineProperty(
        globalThis,
        "removeEventListener",
        previousRemoveEventListener,
      );
    } else {
      Reflect.deleteProperty(globalThis, "removeEventListener");
    }
  });

  const location = memoryLocation({ path: "/tickets/226" });
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook}>
          <AuthGate
            acceptedUserId={SYSADMIN.id}
            onAcceptUserId={() => undefined}
            onConfirmedSessionLoss={() => undefined}
            passwordChangeContent={<p>Cambiar contraseña</p>}
          >
            <Route path="/tickets/:id">
              <TicketDetailPage />
            </Route>
          </AuthGate>
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  );

  await waitFor(() => {
    assert.equal(
      screen.getByRole("heading", { name: TICKET.motivo }).textContent,
      TICKET.motivo,
    );
  });
  await flushAsyncWork();

  assert.equal(sessionFetches, 0);
  assert.ok(ticketFetches >= 1);
  assert.ok(seguimientoFetches >= 1);
});

test("Controller consulta Dashboard y Tickets sin acciones de gestión ni Administración", async (t) => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(getGetMeQueryKey(), CONTROLLER, { updatedAt: 1 });
  const previousAddEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "addEventListener",
  );
  const previousRemoveEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "removeEventListener",
  );
  Object.defineProperties(globalThis, {
    addEventListener: {
      configurable: true,
      value: window.addEventListener.bind(window),
    },
    removeEventListener: {
      configurable: true,
      value: window.removeEventListener.bind(window),
    },
  });
  let sessionFetches = 0;

  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/auth/me")) sessionFetches += 1;
    if (url.includes("/api/dashboard/stats")) return statsResponse();
    if (url.includes("/api/tickets/226/seguimientos")) {
      return jsonResponse([]);
    }
    if (url.includes("/api/tickets/226")) return jsonResponse(TICKET);
    throw new Error(`Request inesperado: ${url}`);
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
    if (previousAddEventListener) {
      Object.defineProperty(
        globalThis,
        "addEventListener",
        previousAddEventListener,
      );
    } else {
      Reflect.deleteProperty(globalThis, "addEventListener");
    }
    if (previousRemoveEventListener) {
      Object.defineProperty(
        globalThis,
        "removeEventListener",
        previousRemoveEventListener,
      );
    } else {
      Reflect.deleteProperty(globalThis, "removeEventListener");
    }
  });

  const location = memoryLocation({ path: "/tickets/226" });
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook}>
          <AuthGate
            acceptedUserId={CONTROLLER.id}
            onAcceptUserId={() => undefined}
            onConfirmedSessionLoss={() => undefined}
            passwordChangeContent={<p>Cambiar contraseña</p>}
          >
            <Sidebar />
            <Route path="/tickets/:id">
              <TicketDetailPage />
            </Route>
          </AuthGate>
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  );

  await waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: TICKET.motivo }));
  });

  assert.ok(screen.getByRole("link", { name: /dashboard/i }));
  assert.ok(screen.getByRole("link", { name: /tickets/i }));
  assert.equal(screen.queryByRole("link", { name: /administración/i }), null);
  assert.ok(screen.getByText("Datos del Contacto"));
  assert.ok(screen.getByText("Historial y Seguimiento"));
  assert.equal(screen.queryByRole("button", { name: /editar estado/i }), null);
  assert.equal(
    screen.queryByRole("button", { name: /editar datos del contacto/i }),
    null,
  );
  assert.equal(
    screen.queryByRole("textbox", { name: /nueva nota de seguimiento/i }),
    null,
  );
  assert.equal(screen.queryByRole("button", { name: /agregar nota/i }), null);
  await flushAsyncWork();
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
