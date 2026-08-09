import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Ticket, type TicketDetail } from "@workspace/api-client-react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useTicketDetailEditing } from "../src/features/ticket-detail/useTicketDetailEditing.ts";
import { useTicketSeguimiento } from "../src/features/ticket-detail/useTicketSeguimiento.ts";
import { useToast } from "../src/hooks/use-toast.ts";

const ticket: Ticket = {
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
};

const ticketDetail: TicketDetail = { ...ticket, seguimientos: [] };
const ticketQueryKey = ["/api/tickets", ticket.id, "test-detail"] as const;

interface ObservedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
}

function observeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): ObservedRequest {
  return {
    method: (init?.method ?? "GET").toUpperCase(),
    url: input instanceof Request ? input.url : String(input),
    body:
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : undefined,
    headers: new Headers(init?.headers),
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

test("gestión conserva PATCH mínimo, admin request y reintento CAS recargado", async (t) => {
  const observed: ObservedRequest[] = [];
  const latestTicket: TicketDetail = {
    ...ticketDetail,
    version: 5,
    prioridad: "alta",
  };
  let patchAttempt = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = observeRequest(input, init);
      observed.push(request);
      patchAttempt += 1;
      if (patchAttempt === 1) {
        return jsonResponse(
          {
            code: "TICKET_VERSION_CONFLICT",
            error: "Conflicto de versión",
          },
          409,
        );
      }
      return jsonResponse({
        ...latestTicket,
        version: 6,
        prioridad: "urgente",
      } satisfies Ticket);
    },
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(ticketQueryKey, ticketDetail);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  const refetchTicket = t.mock.fn(async () => {
    queryClient.setQueryData(ticketQueryKey, latestTicket);
    return { data: latestTicket, error: null, isError: false };
  });
  const refetchSeguimientos = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const view = renderHook(
    () => ({
      editing: useTicketDetailEditing({
        ticketId: ticket.id,
        ticket: ticketDetail,
        ticketQueryKey,
        adminMode: true,
        adminRequest: { headers: { "x-admin-key": "admin-test" } },
        refetchTicket,
        refetchSeguimientos,
      }),
      toasts: useToast().toasts,
    }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() => view.result.current.editing.managementDialog.onSave());
  assert.equal(observed.length, 0, "un PATCH vacío no se despacha");
  assert.equal(view.result.current.editing.managementDialog.open, false);

  act(() => {
    view.result.current.editing.managementDialog.onOpenChange(true);
    view.result.current.editing.managementDialog.onPriorityChange("alta");
  });
  act(() => view.result.current.editing.managementDialog.onSave());

  await waitFor(() => assert.equal(observed.length, 1));
  await waitFor(() =>
    assert.equal(
      view.result.current.editing.managementDialog.hasVersionConflict,
      true,
    ),
  );
  assert.deepEqual(observed[0]?.body, {
    prioridad: "alta",
    expected_version: 3,
  });
  assert.equal(observed[0]?.url, "/api/tickets/41?incluir_vacios=true");
  assert.equal(observed[0]?.headers.get("x-admin-key"), "admin-test");
  assert.equal(
    view.result.current.editing.managementDialog.form.prioridad,
    "alta",
    "el conflicto conserva el borrador",
  );
  assert.ok(
    view.result.current.toasts.some(
      ({ title, description }) =>
        title === "El ticket cambió en otra sesión" &&
        String(description).includes("Conservamos lo que escribiste."),
    ),
  );

  act(() => view.result.current.editing.managementDialog.onReloadLatest());
  await waitFor(() =>
    assert.equal(
      view.result.current.editing.managementDialog.hasVersionConflict,
      false,
    ),
  );
  assert.equal(refetchTicket.mock.callCount(), 1);
  assert.equal(refetchSeguimientos.mock.callCount(), 1);
  assert.equal(
    view.result.current.editing.managementDialog.form.prioridad,
    "alta",
  );

  act(() =>
    view.result.current.editing.managementDialog.onPriorityChange("urgente"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.equal(observed.length, 2));
  await waitFor(() =>
    assert.equal(view.result.current.editing.managementDialog.open, false),
  );

  assert.deepEqual(observed[1]?.body, {
    prioridad: "urgente",
    expected_version: 5,
  });
  assert.equal(invalidateQueries.mock.callCount(), 1);
  assert.equal(
    queryClient.getQueryData<TicketDetail>(ticketQueryKey)?.version,
    6,
  );
});

test("datos operativos no degradan una revisión SSE más nueva", async (t) => {
  let resolvePatch: ((response: Response) => void) | undefined;
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      observed.push(observeRequest(input, init));
      return new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(ticketQueryKey, ticketDetail);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useTicketDetailEditing({
        ticketId: ticket.id,
        ticket: ticketDetail,
        ticketQueryKey,
        adminMode: false,
        adminRequest: { headers: { "x-admin-key": "must-not-leak" } },
        refetchTicket: async () => ({
          data: ticketDetail,
          error: null,
          isError: false,
        }),
        refetchSeguimientos: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.openFunctionalEditor());
  act(() =>
    view.result.current.functionalDialog.onSave({
      nombre: "Respuesta PATCH",
      expected_version: 3,
    }),
  );
  await waitFor(() => assert.ok(resolvePatch));
  assert.deepEqual(observed[0]?.body, {
    nombre: "Respuesta PATCH",
    expected_version: 3,
  });
  assert.equal(observed[0]?.url, "/api/tickets/41");
  assert.equal(observed[0]?.headers.get("x-admin-key"), null);

  const newerTicket: TicketDetail = {
    ...ticketDetail,
    version: 5,
    nombre: "Actualización SSE",
  };
  queryClient.setQueryData(ticketQueryKey, newerTicket);
  await act(async () => {
    resolvePatch?.(
      jsonResponse({
        ...ticket,
        version: 4,
        nombre: "Respuesta PATCH",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.functionalDialog.isSaving, false),
  );

  assert.deepEqual(
    queryClient.getQueryData<TicketDetail>(ticketQueryKey),
    newerTicket,
  );
  assert.equal(view.result.current.functionalDialog.open, false);
  assert.equal(invalidateQueries.mock.callCount(), 1);
});

test("seguimiento normaliza el draft y conserva el contrato admin", async (t) => {
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      observed.push(observeRequest(input, init));
      return jsonResponse({ id: 1 }, 201);
    },
  );

  const queryClient = createQueryClient();
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () => ({
      seguimiento: useTicketSeguimiento({
        ticketId: ticket.id,
        adminMode: true,
        adminRequest: { headers: { "x-admin-key": "admin-test" } },
      }),
      toasts: useToast().toasts,
    }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.seguimiento.historyCard.onDraftChange("   "));
  act(() => view.result.current.seguimiento.historyCard.onSubmit());
  assert.equal(observed.length, 0);

  const note = "x".repeat(95);
  act(() =>
    view.result.current.seguimiento.historyCard.onDraftChange(`  ${note}  `),
  );
  act(() => view.result.current.seguimiento.historyCard.onSubmit());
  await waitFor(() => assert.equal(observed.length, 1));
  await waitFor(() =>
    assert.equal(view.result.current.seguimiento.historyCard.draft, ""),
  );

  assert.equal(observed[0]?.method, "POST");
  assert.equal(
    observed[0]?.url,
    "/api/tickets/41/seguimientos?incluir_vacios=true",
  );
  assert.equal(observed[0]?.headers.get("x-admin-key"), "admin-test");
  assert.deepEqual(observed[0]?.body, { nota: note });
  assert.equal(invalidateQueries.mock.callCount(), 1);
  assert.ok(
    view.result.current.toasts.some(
      ({ title, description }) =>
        title === "Seguimiento agregado" &&
        description === `${note.slice(0, 90)}…`,
    ),
  );
});
