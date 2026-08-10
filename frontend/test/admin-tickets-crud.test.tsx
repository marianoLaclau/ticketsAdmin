import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import {
  type Ticket,
  type TicketListResponse,
} from "@workspace/api-client-react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useAdminTicketsCrud } from "../src/features/admin-tickets/useAdminTicketsCrud.ts";
import type { AdminAccessState } from "../src/lib/admin-access-state.ts";

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
  prioridad: "alta",
  asignado_usuario_id: 7,
  asignado_a: "Operadora Uno",
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-08T13:25:00.000Z",
  fecha_limite: "2026-08-11T13:25:00.000Z",
  fecha_resolucion: null,
  progreso: 50,
};

const mutationRequest: RequestInit = {
  headers: { "x-test-request": "mutation" },
};
const queryRequest: RequestInit = {
  headers: { "x-test-query": "detail" },
};

interface CrudProps {
  adminAccessState: AdminAccessState;
  accessVersion: number;
  accessGeneration: number;
  currentListQueryKey: QueryKey;
}

interface ObservedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
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

function seedList(queryClient: QueryClient, queryKey: QueryKey): void {
  queryClient.setQueryData<TicketListResponse>(queryKey, {
    tickets: [ticket],
    total: 1,
    page: 1,
    limit: 10,
  });
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

test("conserva payloads, requests, caché e invalidaciones del CRUD", async (t) => {
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.method === "POST") {
        return jsonResponse(
          {
            ...ticket,
            id: 50,
            version: 1,
            conversation_id: "manual-test",
            nombre: "María",
            apellido: "López",
            motivo: "Alta manual",
            telefono: null,
            dni: null,
            empresa: null,
            estado_empleado: null,
            email: null,
            resumen: null,
            audio_url: null,
            notas: null,
          } satisfies Ticket,
          201,
        );
      }
      if (request.method === "PATCH") {
        return jsonResponse({ ...ticket, version: 4, nombre: "Ana editada" });
      }
      if (request.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(
        `Solicitud inesperada en la prueba: ${request.method} ${request.url}`,
      );
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "crud-current"] as const;
  seedList(queryClient, listQueryKey);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  const refetchCurrentList = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    (props: CrudProps) =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        ...props,
        refetchCurrentList,
      }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: {
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
      },
    },
  );

  act(() => {
    view.result.current.abrirCrear();
    view.result.current.setForm((current) => ({
      ...current,
      conversation_id: "  manual-test  ",
      hora: " 09:30 ",
      nombre: " María ",
      apellido: " López ",
      motivo: " Alta manual ",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.equal(observed.length, 1));
  await waitFor(() => assert.equal(view.result.current.dialogAbierto, false));
  assert.deepEqual(observed[0]?.body, {
    conversation_id: "manual-test",
    hora: "09:30",
    nombre: "María",
    apellido: "López",
    motivo: "Alta manual",
    estado: "nuevo",
    prioridad: "media",
  });
  assert.equal(observed[0]?.url, "/api/admin/tickets");
  assert.equal(observed[0]?.headers.get("x-test-request"), "mutation");
  assert.equal(invalidateQueries.mock.callCount(), 1);

  act(() => view.result.current.abrirEditar(ticket));
  act(() => view.result.current.guardarRegistro());
  assert.equal(observed.length, 1, "un PATCH vacío no se despacha");
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(invalidateQueries.mock.callCount(), 1);

  act(() => {
    view.result.current.abrirEditar(ticket);
    view.result.current.setForm((current) => ({
      ...current,
      nombre: " Ana editada ",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.equal(observed.length, 2));
  await waitFor(() => assert.equal(view.result.current.isSaving, false));
  assert.deepEqual(observed[1]?.body, {
    nombre: "Ana editada",
    expected_version: 3,
  });
  assert.equal(observed[1]?.method, "PATCH");
  assert.equal(observed[1]?.url, "/api/tickets/41?incluir_vacios=true");
  assert.equal(observed[1]?.headers.get("x-test-request"), "mutation");
  assert.equal(invalidateQueries.mock.callCount(), 2);
  assert.deepEqual(
    queryClient.getQueryData<TicketListResponse>(listQueryKey)?.tickets[0],
    { ...ticket, version: 4, nombre: "Ana editada" },
  );

  act(() => view.result.current.abrirEliminar(ticket));
  act(() => view.result.current.confirmarEliminar());
  await waitFor(() => assert.equal(observed.length, 3));
  await waitFor(() => assert.equal(view.result.current.aEliminar, null));
  assert.equal(observed[2]?.method, "DELETE");
  assert.equal(observed[2]?.url, "/api/tickets/41");
  assert.equal(observed[2]?.headers.get("x-test-request"), "mutation");
  assert.equal(invalidateQueries.mock.callCount(), 3);
  assert.equal(refetchCurrentList.mock.callCount(), 0);
});

test("conserva el borrador ante conflicto y reintenta con la versión recargada", async (t) => {
  const observed: ObservedRequest[] = [];
  const latestTicket: Ticket = {
    ...ticket,
    version: 5,
    nombre: "Versión del servidor",
  };
  let patchAttempt = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.method === "PATCH") {
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
          nombre: "Reintento local",
        });
      }
      if (
        request.method === "GET" &&
        request.url.startsWith("/api/tickets/41")
      ) {
        return jsonResponse(latestTicket);
      }
      throw new Error(
        `Solicitud inesperada en la prueba: ${request.method} ${request.url}`,
      );
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "conflict-current"] as const;
  seedList(queryClient, listQueryKey);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  const refetchCurrentList = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => {
    view.result.current.abrirEditar(ticket);
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Borrador local",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() =>
    assert.equal(view.result.current.hasVersionConflict, true),
  );
  assert.equal(view.result.current.dialogAbierto, true);
  assert.equal(view.result.current.form.nombre, "Borrador local");
  assert.deepEqual(observed[0]?.body, {
    nombre: "Borrador local",
    expected_version: 3,
  });
  assert.equal(invalidateQueries.mock.callCount(), 0);

  await act(async () => {
    await view.result.current.resolverConflictoDeVersion();
  });
  assert.equal(refetchCurrentList.mock.callCount(), 1);
  assert.equal(view.result.current.isReloadingTicket, false);
  assert.equal(view.result.current.hasVersionConflict, false);
  assert.equal(view.result.current.form.nombre, "Versión del servidor");
  const detailRequest = observed.find(({ method }) => method === "GET");
  assert.equal(detailRequest?.url, "/api/tickets/41?incluir_vacios=true");
  assert.equal(detailRequest?.headers.get("x-test-query"), "detail");

  act(() =>
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Reintento local",
    })),
  );
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.equal(patchAttempt, 2));
  await waitFor(() => assert.equal(view.result.current.dialogAbierto, false));
  const patchRequests = observed.filter(({ method }) => method === "PATCH");
  assert.deepEqual(patchRequests[1]?.body, {
    nombre: "Reintento local",
    expected_version: 5,
  });
  assert.equal(invalidateQueries.mock.callCount(), 1);
  assert.equal(
    queryClient.getQueryData<TicketListResponse>(listQueryKey)?.tickets[0]
      ?.version,
    6,
  );
});

test("purga la frontera y descarta el éxito tardío de otra generación", async (t) => {
  let resolveCreate: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      throw new Error(`Solicitud inesperada en la prueba: ${method}`);
    },
  );

  const queryClient = createQueryClient();
  const firstListKey = ["/api/tickets", "boundary-1"] as const;
  const secondListKey = ["/api/tickets", "boundary-2"] as const;
  seedList(queryClient, firstListKey);
  seedList(queryClient, secondListKey);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  const refetchCurrentList = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    (props: CrudProps) =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        ...props,
        refetchCurrentList,
      }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: {
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: firstListKey,
      },
    },
  );

  act(() => {
    view.result.current.abrirCrear();
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Solicitud anterior",
      motivo: "Alta anterior",
    }));
    view.result.current.abrirEliminar(ticket);
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.ok(resolveCreate));

  view.rerender({
    adminAccessState: "pending",
    accessVersion: 1,
    accessGeneration: 1,
    currentListQueryKey: firstListKey,
  });
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(view.result.current.aEliminar, null);
  assert.equal(view.result.current.editandoId, null);
  assert.equal(view.result.current.hasVersionConflict, false);

  view.rerender({
    adminAccessState: "ready",
    accessVersion: 2,
    accessGeneration: 1,
    currentListQueryKey: secondListKey,
  });
  act(() => {
    view.result.current.abrirCrear();
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Borrador vigente",
    }));
  });

  await act(async () => {
    resolveCreate?.(
      jsonResponse(
        {
          ...ticket,
          id: 51,
          version: 1,
          nombre: "Solicitud anterior",
          motivo: "Alta anterior",
        } satisfies Ticket,
        201,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(view.result.current.dialogAbierto, true);
  assert.equal(view.result.current.form.nombre, "Borrador vigente");
  assert.equal(invalidateQueries.mock.callCount(), 0);
  assert.deepEqual(
    queryClient.getQueryData<TicketListResponse>(secondListKey)?.tickets,
    [ticket],
  );
});

test("una recarga tardía no contamina un editor abierto después", async (t) => {
  let resolveDetail: ((response: Response) => void) | undefined;
  const observed: ObservedRequest[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = observeRequest(input, init);
      observed.push(request);
      if (request.method === "GET") {
        return new Promise<Response>((resolve) => {
          resolveDetail = resolve;
        });
      }
      throw new Error(
        `Solicitud inesperada en la prueba: ${request.method} ${request.url}`,
      );
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "reload-current"] as const;
  seedList(queryClient, listQueryKey);
  const refetchCurrentList = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.abrirEditar(ticket));
  act(() => void view.result.current.resolverConflictoDeVersion());
  await waitFor(() => assert.ok(resolveDetail));
  assert.equal(view.result.current.isReloadingTicket, true);

  act(() => view.result.current.cambiarEstadoDialogo(false));
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(view.result.current.areCrudActionsDisabled, true);

  act(() => view.result.current.abrirCrear());
  assert.equal(view.result.current.dialogAbierto, false);

  await act(async () => {
    resolveDetail?.(
      jsonResponse({
        ...ticket,
        version: 9,
        nombre: "Respuesta tardía",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, false),
  );
  act(() => {
    view.result.current.abrirCrear();
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Nuevo borrador",
    }));
  });

  assert.equal(refetchCurrentList.mock.callCount(), 1);
  assert.equal(view.result.current.dialogAbierto, true);
  assert.equal(view.result.current.editandoId, null);
  assert.equal(view.result.current.form.nombre, "Nuevo borrador");
  assert.equal(view.result.current.isReloadingTicket, false);
  assert.equal(
    queryClient.getQueryData<TicketListResponse>(listQueryKey)?.tickets[0]
      ?.version,
    ticket.version,
  );
  assert.equal(observed[0]?.headers.get("x-test-query"), "detail");
});

test("serializa un alta pendiente dentro de la misma generación", async (t) => {
  let resolveCreate: ((response: Response) => void) | undefined;
  let createRequests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "POST") {
        throw new Error(`Solicitud inesperada en la prueba: ${method}`);
      }
      createRequests += 1;
      return new Promise<Response>((resolve) => {
        resolveCreate = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "pending-create"] as const;
  seedList(queryClient, listQueryKey);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => {
    view.result.current.abrirCrear();
    view.result.current.setForm((current) => ({
      ...current,
      conversation_id: "pending-create",
      hora: "11:30",
      nombre: "Alta pendiente",
      motivo: "Prueba de serialización",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.ok(resolveCreate));
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, true),
  );

  act(() => view.result.current.cambiarEstadoDialogo(false));
  assert.equal(view.result.current.dialogAbierto, false);
  act(() => {
    view.result.current.cambiarEstadoDialogo(true);
    view.result.current.abrirCrear();
    view.result.current.abrirEditar(ticket);
    view.result.current.abrirEliminar(ticket);
    view.result.current.guardarRegistro();
  });
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(view.result.current.editandoId, null);
  assert.equal(view.result.current.aEliminar, null);
  assert.equal(createRequests, 1);

  await act(async () => {
    resolveCreate?.(
      jsonResponse(
        {
          ...ticket,
          id: 52,
          version: 1,
          conversation_id: "pending-create",
          nombre: "Alta pendiente",
        } satisfies Ticket,
        201,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, false),
  );

  act(() => view.result.current.abrirCrear());
  assert.equal(view.result.current.dialogAbierto, true);
  assert.equal(view.result.current.editandoId, null);
});

test("serializa una actualización pendiente dentro de la misma generación", async (t) => {
  let resolveUpdate: ((response: Response) => void) | undefined;
  let updateRequests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "PATCH") {
        throw new Error(`Solicitud inesperada en la prueba: ${method}`);
      }
      updateRequests += 1;
      return new Promise<Response>((resolve) => {
        resolveUpdate = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "pending-update"] as const;
  seedList(queryClient, listQueryKey);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => {
    view.result.current.abrirEditar(ticket);
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Cambio pendiente",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.ok(resolveUpdate));
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, true),
  );

  act(() => view.result.current.cambiarEstadoDialogo(false));
  assert.equal(view.result.current.dialogAbierto, false);
  act(() => {
    view.result.current.cambiarEstadoDialogo(true);
    view.result.current.abrirCrear();
    view.result.current.abrirEditar(ticket);
    view.result.current.abrirEliminar(ticket);
    view.result.current.guardarRegistro();
  });
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(view.result.current.aEliminar, null);
  assert.equal(updateRequests, 1);

  await act(async () => {
    resolveUpdate?.(
      jsonResponse({
        ...ticket,
        version: 4,
        nombre: "Cambio pendiente",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, false),
  );

  act(() => view.result.current.abrirCrear());
  assert.equal(view.result.current.dialogAbierto, true);
  assert.equal(view.result.current.editandoId, null);
});

test("serializa una eliminación pendiente dentro de la misma generación", async (t) => {
  let resolveDelete: ((response: Response) => void) | undefined;
  let deleteRequests = 0;
  const secondTicket = {
    ...ticket,
    id: 42,
    version: 1,
    conversation_id: "conversation-42",
    nombre: "Segundo ticket",
  } satisfies Ticket;
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "DELETE") {
        throw new Error(`Solicitud inesperada en la prueba: ${method}`);
      }
      deleteRequests += 1;
      return new Promise<Response>((resolve) => {
        resolveDelete = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "pending-delete"] as const;
  seedList(queryClient, listQueryKey);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.abrirEliminar(ticket));
  act(() => view.result.current.confirmarEliminar());
  await waitFor(() => assert.ok(resolveDelete));
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, true),
  );
  assert.equal(view.result.current.isDeleting, true);

  act(() => view.result.current.descartarEliminacion());
  assert.equal(view.result.current.aEliminar, null);
  act(() => {
    view.result.current.abrirCrear();
    view.result.current.abrirEditar(ticket);
    view.result.current.abrirEliminar(secondTicket);
    view.result.current.confirmarEliminar();
  });
  assert.equal(view.result.current.dialogAbierto, false);
  assert.equal(view.result.current.aEliminar, null);
  assert.equal(deleteRequests, 1);

  await act(async () => {
    resolveDelete?.(new Response(null, { status: 204 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.areCrudActionsDisabled, false),
  );

  act(() => view.result.current.abrirEliminar(secondTicket));
  assert.deepEqual(view.result.current.aEliminar, secondTicket);
});

test("una respuesta versión 4 no reemplaza la revisión 5 de la caché", async (t) => {
  let resolveUpdate: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "PATCH") {
        throw new Error(`Solicitud inesperada en la prueba: ${method}`);
      }
      return new Promise<Response>((resolve) => {
        resolveUpdate = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  const listQueryKey = ["/api/tickets", "newer-cache"] as const;
  seedList(queryClient, listQueryKey);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useAdminTicketsCrud({
        request: mutationRequest,
        queryRequest,
        adminAccessState: "ready",
        accessVersion: 1,
        accessGeneration: 0,
        currentListQueryKey: listQueryKey,
        refetchCurrentList: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => {
    view.result.current.abrirEditar(ticket);
    view.result.current.setForm((current) => ({
      ...current,
      nombre: "Respuesta PATCH",
    }));
  });
  act(() => view.result.current.guardarRegistro());
  await waitFor(() => assert.ok(resolveUpdate));

  const newerTicket = {
    ...ticket,
    version: 5,
    nombre: "Actualización SSE",
  } satisfies Ticket;
  queryClient.setQueryData<TicketListResponse>(listQueryKey, {
    tickets: [newerTicket],
    total: 1,
    page: 1,
    limit: 10,
  });

  await act(async () => {
    resolveUpdate?.(
      jsonResponse({
        ...ticket,
        version: 4,
        nombre: "Respuesta PATCH",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() => assert.equal(view.result.current.isSaving, false));

  assert.deepEqual(
    queryClient.getQueryData<TicketListResponse>(listQueryKey)?.tickets[0],
    newerTicket,
  );
  assert.equal(invalidateQueries.mock.callCount(), 1);
});
