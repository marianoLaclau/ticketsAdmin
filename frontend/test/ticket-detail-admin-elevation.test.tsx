import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetAdminElevationQueryKey,
  getGetMeQueryKey,
  type AuthUser,
  type TicketDetail as TicketDetailData,
} from "@workspace/api-client-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import TicketDetail from "../src/pages/TicketDetail.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();
Object.defineProperty(globalThis, "addEventListener", {
  configurable: true,
  value: window.addEventListener.bind(window),
  writable: true,
});
Object.defineProperty(globalThis, "removeEventListener", {
  configurable: true,
  value: window.removeEventListener.bind(window),
  writable: true,
});

const SYSADMIN: AuthUser = {
  id: 42,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "SysAdmin",
  debe_cambiar_password: false,
};

const TICKET: TicketDetailData = {
  id: 41,
  version: 3,
  conversation_id: "conversation-41",
  hora: "10:25",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "1160000041",
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
  asignado_usuario_id: 7,
  asignado_a: "Operadora Uno",
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-08T13:25:00.000Z",
  fecha_limite: "2026-08-11T13:25:00.000Z",
  fecha_resolucion: null,
  progreso: 50,
  seguimientos: [],
};

interface ObservedRequest {
  readonly url: string;
  readonly headers: Headers;
}

function observeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): ObservedRequest {
  return {
    url: input instanceof Request ? input.url : String(input),
    headers: new Headers(init?.headers),
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createQueryClient({
  seedUser = true,
  staleTime = Number.POSITIVE_INFINITY,
}: {
  seedUser?: boolean;
  staleTime?: number;
} = {}): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  if (seedUser) queryClient.setQueryData(getGetMeQueryKey(), SYSADMIN);
  return queryClient;
}

function renderDetail(
  queryClient: QueryClient,
  path: string,
  adminMode: boolean,
) {
  const location = memoryLocation({ path });
  const routePath = adminMode ? "/admin/tickets/:id" : "/tickets/:id";

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook}>{children}</Router>
      </QueryClientProvider>
    );
  }

  return render(
    <Route path={routePath}>
      <TicketDetail adminMode={adminMode} />
    </Route>,
    { wrapper: Wrapper },
  );
}

test("el detalle operativo no consulta ni propaga elevación administrativa", async (t) => {
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.url.includes("/seguimientos")) return jsonResponse([]);
      if (request.url.startsWith("/api/tickets/41")) {
        return jsonResponse(TICKET);
      }
      throw new Error(`Request inesperado: ${request.url}`);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderDetail(queryClient, "/tickets/41", false);

  await screen.findByRole("heading", { name: TICKET.motivo });
  await waitFor(() =>
    assert.ok(observed.some(({ url }) => url.includes("/seguimientos"))),
  );
  assert.equal(
    observed.some(({ url }) => url.includes("/auth/admin-elevation")),
    false,
  );
  assert.ok(
    observed.every(({ headers }) => headers.get("x-admin-intent") === null),
  );
});

test("sin elevación muestra un retorno seguro y no consulta el ticket admin", async (t) => {
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.url === "/api/auth/admin-elevation") {
        return jsonResponse({ active: false, expires_at: null });
      }
      throw new Error(`Request inesperado: ${request.url}`);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderDetail(queryClient, "/admin/tickets/41", true);

  await screen.findByRole("heading", {
    name: "Acceso administrativo requerido",
  });
  assert.match(
    screen.getByText(/Volvé a Administración/).textContent ?? "",
    /habilitá el acceso/,
  );
  assert.equal(
    observed.some(({ url }) => url.startsWith("/api/tickets/")),
    false,
  );
});

test("con staleTime cero verifica identidad una vez y mantiene estable el borrador", async (t) => {
  let meRequests = 0;
  let elevationRequests = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "/api/auth/me") {
      meRequests += 1;
      return jsonResponse(SYSADMIN);
    }
    if (url === "/api/auth/admin-elevation") {
      elevationRequests += 1;
      return jsonResponse({
        active: true,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (url.includes("/seguimientos")) return jsonResponse([]);
    if (url.startsWith("/api/tickets/41")) return jsonResponse(TICKET);
    throw new Error(`Request inesperado: ${url}`);
  });

  const queryClient = createQueryClient({ seedUser: false, staleTime: 0 });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderDetail(queryClient, "/admin/tickets/41", true);

  await screen.findByRole("heading", { name: TICKET.motivo });
  const draft = screen.getByPlaceholderText(
    "Agregar una nota de seguimiento o actualización...",
  ) as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "Borrador estable" } });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  assert.equal(meRequests, 1);
  assert.equal(elevationRequests, 1);
  assert.equal(
    screen.getByPlaceholderText(
      "Agregar una nota de seguimiento o actualización...",
    ),
    draft,
  );
  assert.equal(draft.value, "Borrador estable");
});

test("la frontera de elevación remonta el detalle y aísla caché y borradores", async (t) => {
  const observed: ObservedRequest[] = [];
  let elevationRequests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.url === "/api/auth/admin-elevation") {
        elevationRequests += 1;
        return jsonResponse({
          active: true,
          expires_at: new Date(
            Date.now() + elevationRequests * 60_000,
          ).toISOString(),
        });
      }
      if (request.url.includes("/seguimientos")) return jsonResponse([]);
      if (request.url.startsWith("/api/tickets/41")) {
        return jsonResponse(TICKET);
      }
      throw new Error(`Request inesperado: ${request.url}`);
    },
  );

  const queryClient = createQueryClient();
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  renderDetail(queryClient, "/admin/tickets/41", true);

  await screen.findByRole("heading", { name: TICKET.motivo });
  const draft = screen.getByPlaceholderText(
    "Agregar una nota de seguimiento o actualización...",
  );
  fireEvent.change(draft, { target: { value: "Borrador sensible" } });
  assert.equal((draft as HTMLTextAreaElement).value, "Borrador sensible");

  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: [...getGetAdminElevationQueryKey(), "user", SYSADMIN.id],
      exact: true,
    });
  });

  await waitFor(() => assert.equal(elevationRequests, 2));
  await waitFor(() => {
    const currentDraft = screen.getByPlaceholderText(
      "Agregar una nota de seguimiento o actualización...",
    ) as HTMLTextAreaElement;
    assert.equal(currentDraft.value, "");
  });

  const adminTicketQueries = queryClient
    .getQueryCache()
    .getAll()
    .map(({ queryKey }) => queryKey)
    .filter(
      (queryKey) =>
        queryKey[0] === "/api/tickets" && queryKey.includes("admin-access"),
    );
  const accessVersions = new Set(
    adminTicketQueries
      .map((queryKey) => {
        const boundaryIndex = queryKey.indexOf("admin-access");
        return queryKey[boundaryIndex + 1];
      })
      .filter((value): value is number => typeof value === "number"),
  );
  assert.equal(accessVersions.size, 2);
  for (const accessVersion of accessVersions) {
    const versionQueries = adminTicketQueries.filter((queryKey) => {
      const boundaryIndex = queryKey.indexOf("admin-access");
      return queryKey[boundaryIndex + 1] === accessVersion;
    });
    assert.ok(
      versionQueries.some((queryKey) => queryKey.at(-1) === accessVersion),
    );
    assert.ok(
      versionQueries.some((queryKey) => queryKey.at(-1) === "seguimientos"),
    );
  }

  const adminTicketRequests = observed.filter(({ url }) =>
    url.startsWith("/api/tickets/41"),
  );
  assert.equal(
    adminTicketRequests.filter(({ url }) => url.includes("/seguimientos"))
      .length,
    2,
  );
  assert.equal(
    adminTicketRequests.filter(({ url }) => !url.includes("/seguimientos"))
      .length,
    2,
  );
  assert.ok(
    adminTicketRequests.every(
      ({ headers }) => headers.get("x-admin-intent") === "1",
    ),
  );
});
