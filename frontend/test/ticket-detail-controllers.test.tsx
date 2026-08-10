import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Ticket, type TicketDetail } from "@workspace/api-client-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { TicketDataEditDialog } from "../src/components/tickets/TicketDataEditDialog.tsx";
import { TicketManagementDialog } from "../src/features/ticket-detail/TicketManagementDialog.tsx";
import { useTicketDetailEditing } from "../src/features/ticket-detail/useTicketDetailEditing.ts";
import { useTicketDetailOperationGuard } from "../src/features/ticket-detail/useTicketDetailOperationGuard.ts";
import { useTicketSeguimiento } from "../src/features/ticket-detail/useTicketSeguimiento.ts";
import { useToast } from "../src/hooks/use-toast.ts";
import { ticketToManagementForm } from "../src/lib/ticket-edit.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

class TestResizeObserver implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
  writable: true,
});

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
const secondTicketDetail: TicketDetail = {
  ...ticketDetail,
  id: 42,
  version: 1,
  conversation_id: "conversation-42",
  nombre: "Bruno",
  notas: "Ticket B",
};
const ticketQueryKey = ["/api/tickets", ticket.id, "test-detail"] as const;
const secondTicketQueryKey = [
  "/api/tickets",
  secondTicketDetail.id,
  "test-detail",
] as const;

interface EditingBoundaryProps {
  ticket: TicketDetail;
  ticketQueryKey: readonly unknown[];
}

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

test("desmontar el detalle invalida operaciones y callbacks pendientes", () => {
  const view = renderHook(() =>
    useTicketDetailOperationGuard<"update">(ticket.id),
  );
  const guard = view.result.current;
  const operation = guard.start("update", ticket.id);

  assert.ok(operation);
  assert.equal(guard.isCurrent(operation), true);
  assert.equal(guard.hasPendingOperation(), true);

  view.unmount();

  assert.equal(guard.isCurrent(operation), false);
  assert.equal(guard.hasPendingOperation(), false);
  assert.equal(guard.start("update", ticket.id), null);
});

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
        adminRequest: { headers: { "x-admin-intent": "1" } },
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
  assert.equal(observed[0]?.headers.get("x-admin-intent"), "1");
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
        adminRequest: { headers: { "x-admin-intent": "must-not-leak" } },
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
  assert.equal(observed[0]?.headers.get("x-admin-intent"), null);

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
        adminRequest: { headers: { "x-admin-intent": "1" } },
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
  assert.equal(observed[0]?.headers.get("x-admin-intent"), "1");
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

test("la UI de gestión bloquea todos sus campos durante PATCH y recarga", (t) => {
  t.after(cleanup);
  for (const pending of ["save", "reload"] as const) {
    render(
      <TicketManagementDialog
        open
        form={ticketToManagementForm(ticket, "2026-08-11T10:25")}
        canCloseTickets
        showTechnicalDeadline
        isReloadingConflict={pending === "reload"}
        hasVersionConflict={pending === "reload"}
        isSaving={pending === "save"}
        onOpenChange={() => undefined}
        onReloadLatest={() => undefined}
        onStateChange={() => undefined}
        onPriorityChange={() => undefined}
        onProgressChange={() => undefined}
        onDeadlineChange={() => undefined}
        onNotesChange={() => undefined}
        onSave={() => undefined}
      />,
    );

    assert.equal(
      (
        screen.getByRole("button", {
          name: "Editar Estado",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    for (const select of screen.getAllByRole("combobox")) {
      assert.equal((select as HTMLButtonElement).disabled, true);
    }
    assert.equal(
      screen.getByRole("slider").hasAttribute("data-disabled"),
      true,
    );
    assert.equal(
      (
        document.querySelector(
          'input[type="datetime-local"]',
        ) as HTMLInputElement
      ).disabled,
      true,
    );
    assert.equal(
      (
        screen.getByPlaceholderText(
          "Notas visibles solo para agentes...",
        ) as HTMLTextAreaElement
      ).disabled,
      true,
    );
    assert.equal(
      (screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
        .disabled,
      false,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: pending === "save" ? "Guardando..." : "Guardar Cambios",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    if (pending === "reload") {
      assert.ok(screen.getByText("Hay una versión más reciente"));
    }
    cleanup();
  }
});

test("la gestión usa un formulario nativo y vincula sus ayudas", (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn();
  const onOpenChange = t.mock.fn();

  render(
    <TicketManagementDialog
      open
      form={ticketToManagementForm(ticket, "2026-08-11T10:25")}
      canCloseTickets={false}
      showTechnicalDeadline
      isReloadingConflict={false}
      hasVersionConflict={false}
      isSaving={false}
      onOpenChange={onOpenChange}
      onReloadLatest={() => undefined}
      onStateChange={() => undefined}
      onPriorityChange={() => undefined}
      onProgressChange={() => undefined}
      onDeadlineChange={() => undefined}
      onNotesChange={() => undefined}
      onSave={onSave}
    />,
  );

  const dialog = screen.getByRole("dialog");
  const form = dialog.querySelector("form");
  assert.ok(form);

  const stateSelect = screen.getAllByRole("combobox")[0];
  const stateHelp = screen.getByText(
    "Solo puede ser cerrado por un administrador",
  );
  assert.equal(stateSelect?.getAttribute("aria-describedby"), stateHelp.id);

  const deadline = screen.getByLabelText("Fecha Límite");
  const deadlineHelp = screen.getByText(
    "Campo técnico protegido por la llave de administración.",
  );
  assert.equal(deadline.getAttribute("aria-describedby"), deadlineHelp.id);
  assert.equal(
    screen.getByRole("slider").getAttribute("aria-valuetext"),
    "50 por ciento",
  );

  const cancelButton = screen.getByRole("button", { name: "Cancelar" });
  const saveButton = screen.getByRole("button", { name: "Guardar Cambios" });
  assert.equal(cancelButton.getAttribute("type"), "button");
  assert.equal(saveButton.getAttribute("type"), "submit");

  fireEvent.submit(form);
  assert.equal(onSave.mock.callCount(), 1);
  fireEvent.click(cancelButton);
  assert.deepEqual(onOpenChange.mock.calls[0]?.arguments, [false]);
});

test("la UI funcional bloquea todos sus campos durante PATCH y recarga", (t) => {
  t.after(cleanup);
  for (const pending of ["save", "reload"] as const) {
    render(
      <TicketDataEditDialog
        ticket={ticket}
        open
        onOpenChange={() => undefined}
        isSaving={pending === "save"}
        hasVersionConflict={pending === "reload"}
        isReloadingConflict={pending === "reload"}
        onReloadLatest={async () => ticket}
        onVersionConflictResolved={() => undefined}
        onSave={() => undefined}
      />,
    );

    for (const field of screen.getAllByRole("textbox")) {
      assert.equal(
        (field as HTMLInputElement | HTMLTextAreaElement).disabled,
        true,
      );
    }
    assert.equal(
      (screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
        .disabled,
      pending === "save",
    );
    cleanup();
  }
});

test("cambiar de ticket resetea editores y descarta un PATCH tardío", async (t) => {
  let resolvePatchA: ((response: Response) => void) | undefined;
  let resolvePatchB: ((response: Response) => void) | undefined;
  let patchRequests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL): Promise<Response> => {
      patchRequests += 1;
      const url = input instanceof Request ? input.url : String(input);
      return new Promise<Response>((resolve) => {
        if (url.includes("/41")) resolvePatchA = resolve;
        else resolvePatchB = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(ticketQueryKey, ticketDetail);
  queryClient.setQueryData(secondTicketQueryKey, secondTicketDetail);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const view = renderHook(
    (props: EditingBoundaryProps) =>
      useTicketDetailEditing({
        ticketId: props.ticket.id,
        ticket: props.ticket,
        ticketQueryKey: props.ticketQueryKey,
        adminMode: false,
        adminRequest: {},
        refetchTicket: async () => ({
          data: props.ticket,
          error: null,
          isError: false,
        }),
        refetchSeguimientos: async () => undefined,
      }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: { ticket: ticketDetail, ticketQueryKey },
    },
  );

  act(() => view.result.current.managementDialog.onOpenChange(true));
  act(() => view.result.current.managementDialog.onNotesChange("Cambio A"));
  act(() => view.result.current.managementDialog.onSave());
  await waitFor(() => assert.ok(resolvePatchA));
  await waitFor(() =>
    assert.equal(view.result.current.areEditorActionsDisabled, true),
  );

  view.rerender({
    ticket: secondTicketDetail,
    ticketQueryKey: secondTicketQueryKey,
  });
  assert.equal(view.result.current.managementDialog.open, false);
  assert.equal(view.result.current.functionalDialog.open, false);
  assert.equal(view.result.current.managementDialog.form.notas, "");
  assert.equal(view.result.current.areEditorActionsDisabled, false);

  act(() => view.result.current.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.managementDialog.onNotesChange("Borrador del ticket B"),
  );
  act(() => view.result.current.managementDialog.onSave());
  await waitFor(() => assert.ok(resolvePatchB));
  assert.equal(view.result.current.managementDialog.open, true);

  await act(async () => {
    resolvePatchA?.(
      jsonResponse({
        ...ticket,
        version: 4,
        notas: "Cambio A",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(patchRequests, 2);
  assert.equal(view.result.current.managementDialog.open, true);
  assert.equal(view.result.current.areEditorActionsDisabled, true);
  assert.equal(
    view.result.current.managementDialog.form.notas,
    "Borrador del ticket B",
  );
  assert.deepEqual(
    queryClient.getQueryData<TicketDetail>(secondTicketQueryKey),
    secondTicketDetail,
  );
  assert.equal(invalidateQueries.mock.callCount(), 0);

  await act(async () => {
    resolvePatchB?.(
      jsonResponse({
        ...secondTicketDetail,
        version: 2,
        notas: "Borrador del ticket B",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.managementDialog.open, false),
  );
  assert.equal(invalidateQueries.mock.callCount(), 1);
});

test("cerrar durante PATCH permite salir pero bloquea reaperturas y otro submit", async (t) => {
  let resolvePatch: ((response: Response) => void) | undefined;
  let patchRequests = 0;
  t.mock.method(globalThis, "fetch", async (): Promise<Response> => {
    patchRequests += 1;
    return new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
  });

  const queryClient = createQueryClient();
  queryClient.setQueryData(ticketQueryKey, ticketDetail);
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
        adminRequest: {},
        refetchTicket: async () => ({
          data: ticketDetail,
          error: null,
          isError: false,
        }),
        refetchSeguimientos: async () => undefined,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.managementDialog.onOpenChange(true));
  act(() => view.result.current.managementDialog.onPriorityChange("alta"));
  act(() => view.result.current.managementDialog.onSave());
  await waitFor(() => assert.ok(resolvePatch));

  act(() =>
    view.result.current.managementDialog.onNotesChange("No debe aplicarse"),
  );
  assert.equal(view.result.current.managementDialog.form.notas, "");

  act(() => view.result.current.managementDialog.onOpenChange(false));
  assert.equal(view.result.current.managementDialog.open, false);
  act(() => {
    view.result.current.managementDialog.onOpenChange(true);
    view.result.current.openFunctionalEditor();
    view.result.current.managementDialog.onSave();
  });
  assert.equal(view.result.current.managementDialog.open, false);
  assert.equal(view.result.current.functionalDialog.open, false);
  assert.equal(patchRequests, 1);

  await act(async () => {
    resolvePatch?.(
      jsonResponse({
        ...ticket,
        version: 4,
        prioridad: "alta",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.areEditorActionsDisabled, false),
  );

  act(() => view.result.current.openFunctionalEditor());
  assert.equal(view.result.current.functionalDialog.open, true);
});

test("un error vigente todavía se notifica si el editor fue cerrado", async (t) => {
  const errorTicket: TicketDetail = {
    ...ticketDetail,
    id: 501,
    conversation_id: "error-after-close-501",
  };
  const errorQueryKey = [
    "/api/tickets",
    errorTicket.id,
    "test-detail",
  ] as const;
  let resolvePatch: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (): Promise<Response> =>
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(errorQueryKey, errorTicket);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () => ({
      editing: useTicketDetailEditing({
        ticketId: errorTicket.id,
        ticket: errorTicket,
        ticketQueryKey: errorQueryKey,
        adminMode: false,
        adminRequest: {},
        refetchTicket: async () => ({
          data: errorTicket,
          error: null,
          isError: false,
        }),
        refetchSeguimientos: async () => undefined,
      }),
      toasts: useToast().toasts,
    }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.editing.managementDialog.onPriorityChange("alta"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.ok(resolvePatch));
  act(() => view.result.current.editing.managementDialog.onOpenChange(false));

  await act(async () => {
    resolvePatch?.(jsonResponse({ error: "Falla controlada 501" }, 500));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.ok(
      view.result.current.toasts.some(
        ({ title, variant }) =>
          title === "No se pudo actualizar el ticket #501" &&
          variant === "destructive",
      ),
    ),
  );
  assert.equal(view.result.current.editing.managementDialog.open, false);
});

test("un conflicto tras cerrar sobrevive hasta recargar y reintenta con la versión nueva", async (t) => {
  const conflictTicket: TicketDetail = {
    ...ticketDetail,
    id: 502,
    conversation_id: "conflict-after-close-502",
  };
  const latestTicket: TicketDetail = {
    ...conflictTicket,
    version: 8,
    prioridad: "alta",
  };
  const conflictQueryKey = [
    "/api/tickets",
    conflictTicket.id,
    "test-detail",
  ] as const;
  const observed: ObservedRequest[] = [];
  let resolveFirstPatch: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      observed.push(observeRequest(input, init));
      if (observed.length === 1) {
        return new Promise((resolve) => {
          resolveFirstPatch = resolve;
        });
      }
      return jsonResponse({
        ...latestTicket,
        version: 9,
        prioridad: "urgente",
      } satisfies Ticket);
    },
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(conflictQueryKey, conflictTicket);
  const refetchTicket = t.mock.fn(async () => {
    queryClient.setQueryData(conflictQueryKey, latestTicket);
    return { data: latestTicket, error: null, isError: false };
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () => ({
      editing: useTicketDetailEditing({
        ticketId: conflictTicket.id,
        ticket: conflictTicket,
        ticketQueryKey: conflictQueryKey,
        adminMode: false,
        adminRequest: {},
        refetchTicket,
        refetchSeguimientos: async () => undefined,
      }),
      toasts: useToast().toasts,
    }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.editing.managementDialog.onPriorityChange("alta"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.ok(resolveFirstPatch));
  assert.deepEqual(observed[0]?.body, {
    prioridad: "alta",
    expected_version: 3,
  });
  act(() => view.result.current.editing.managementDialog.onOpenChange(false));

  await act(async () => {
    resolveFirstPatch?.(
      jsonResponse(
        {
          code: "TICKET_VERSION_CONFLICT",
          error: "Conflicto de versión 502",
        },
        409,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.ok(
      view.result.current.toasts.some(
        ({ title, description, variant }) =>
          title === "El ticket cambió en otra sesión" &&
          variant === "warning" &&
          String(description).includes("Volvé a abrir el editor"),
      ),
    ),
  );
  assert.equal(view.result.current.editing.managementDialog.open, false);
  assert.equal(
    view.result.current.editing.managementDialog.hasVersionConflict,
    true,
  );
  await waitFor(() =>
    assert.equal(view.result.current.editing.functionalDialog.isSaving, false),
  );

  act(() => view.result.current.editing.openFunctionalEditor());
  assert.equal(view.result.current.editing.functionalDialog.open, true);
  assert.equal(
    view.result.current.editing.functionalDialog.hasVersionConflict,
    true,
    "el conflicto global bloquea también el otro editor",
  );
  act(() =>
    view.result.current.editing.functionalDialog.onSave({
      nombre: "Tampoco debe enviarse",
      expected_version: 3,
    }),
  );
  assert.equal(observed.length, 1, "el otro editor no despacha un PATCH stale");
  act(() => view.result.current.editing.functionalDialog.onOpenChange(false));

  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  assert.equal(view.result.current.editing.managementDialog.open, true);
  assert.equal(
    view.result.current.editing.managementDialog.hasVersionConflict,
    true,
  );
  act(() =>
    view.result.current.editing.managementDialog.onNotesChange(
      "No debe enviarse antes de recargar",
    ),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  assert.equal(observed.length, 1, "el conflicto bloquea otro PATCH");

  act(() => view.result.current.editing.managementDialog.onOpenChange(false));
  assert.equal(
    view.result.current.editing.managementDialog.hasVersionConflict,
    true,
    "cerrar manualmente tampoco descarta el conflicto",
  );
  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  assert.equal(
    view.result.current.editing.managementDialog.hasVersionConflict,
    true,
  );

  act(() => view.result.current.editing.managementDialog.onReloadLatest());
  await waitFor(() =>
    assert.equal(
      view.result.current.editing.managementDialog.hasVersionConflict,
      false,
    ),
  );
  assert.equal(refetchTicket.mock.callCount(), 1);
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
    expected_version: 8,
  });
});

test("A→B→A descarta ambos callbacks viejos y sólo notifica el A vigente", async (t) => {
  const ticketA: TicketDetail = {
    ...ticketDetail,
    id: 141,
    version: 1,
    conversation_id: "aba-ticket-141",
  };
  const ticketB: TicketDetail = {
    ...secondTicketDetail,
    id: 142,
    version: 1,
    conversation_id: "aba-ticket-142",
  };
  const queryKeyA = ["/api/tickets", ticketA.id, "aba"] as const;
  const queryKeyB = ["/api/tickets", ticketB.id, "aba"] as const;
  const resolveA: Array<(response: Response) => void> = [];
  let resolveB: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      return new Promise((resolve) => {
        if (url.includes("/141")) resolveA.push(resolve);
        else resolveB = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(queryKeyA, ticketA);
  queryClient.setQueryData(queryKeyB, ticketB);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    (props: EditingBoundaryProps) => ({
      editing: useTicketDetailEditing({
        ticketId: props.ticket.id,
        ticket: props.ticket,
        ticketQueryKey: props.ticketQueryKey,
        adminMode: false,
        adminRequest: {},
        refetchTicket: async () => ({
          data: props.ticket,
          error: null,
          isError: false,
        }),
        refetchSeguimientos: async () => undefined,
      }),
      toasts: useToast().toasts,
    }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: { ticket: ticketA, ticketQueryKey: queryKeyA },
    },
  );

  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.editing.managementDialog.onNotesChange("A viejo"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.equal(resolveA.length, 1));

  view.rerender({ ticket: ticketB, ticketQueryKey: queryKeyB });
  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.editing.managementDialog.onNotesChange("B viejo"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.ok(resolveB));

  view.rerender({ ticket: ticketA, ticketQueryKey: queryKeyA });
  act(() => view.result.current.editing.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.editing.managementDialog.onNotesChange("A vigente"),
  );
  act(() => view.result.current.editing.managementDialog.onSave());
  await waitFor(() => assert.equal(resolveA.length, 2));

  await act(async () => {
    resolveA[0]?.(
      jsonResponse({
        ...ticketA,
        version: 2,
        notas: "A viejo",
      } satisfies Ticket),
    );
    resolveB?.(
      jsonResponse({
        ...ticketB,
        version: 2,
        notas: "B viejo",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(view.result.current.editing.managementDialog.open, true);
  assert.equal(
    view.result.current.editing.managementDialog.form.notas,
    "A vigente",
  );
  assert.equal(view.result.current.editing.areEditorActionsDisabled, true);
  assert.equal(invalidateQueries.mock.callCount(), 0);
  assert.equal(
    view.result.current.toasts.some(({ description }) =>
      ["Ticket #141", "Ticket #142"].includes(String(description)),
    ),
    false,
  );

  await act(async () => {
    resolveA[1]?.(
      jsonResponse({
        ...ticketA,
        version: 2,
        notas: "A vigente",
      } satisfies Ticket),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.editing.managementDialog.open, false),
  );
  assert.equal(invalidateQueries.mock.callCount(), 1);
  assert.ok(
    view.result.current.toasts.some(
      ({ title, description, variant }) =>
        title === "Ticket actualizado" &&
        description === "Ticket #141" &&
        variant === "success",
    ),
  );
});

test("una recarga tardía de A no sobrescribe el editor abierto de B", async (t) => {
  let resolveReload:
    | ((result: { data: TicketDetail; error: null; isError: false }) => void)
    | undefined;
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(
      {
        code: "TICKET_VERSION_CONFLICT",
        error: "Conflicto de versión",
      },
      409,
    ),
  );

  const queryClient = createQueryClient();
  queryClient.setQueryData(ticketQueryKey, ticketDetail);
  queryClient.setQueryData(secondTicketQueryKey, secondTicketDetail);
  const refetchSeguimientos = t.mock.fn(async () => undefined);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    (props: EditingBoundaryProps) =>
      useTicketDetailEditing({
        ticketId: props.ticket.id,
        ticket: props.ticket,
        ticketQueryKey: props.ticketQueryKey,
        adminMode: false,
        adminRequest: {},
        refetchTicket: () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          }),
        refetchSeguimientos,
      }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: { ticket: ticketDetail, ticketQueryKey },
    },
  );

  act(() => view.result.current.managementDialog.onOpenChange(true));
  act(() => view.result.current.managementDialog.onPriorityChange("alta"));
  act(() => view.result.current.managementDialog.onSave());
  await waitFor(() =>
    assert.equal(view.result.current.managementDialog.hasVersionConflict, true),
  );
  act(() => view.result.current.managementDialog.onReloadLatest());
  await waitFor(() => assert.ok(resolveReload));
  await waitFor(() =>
    assert.equal(view.result.current.isReloadingConflict, true),
  );
  act(() => {
    view.result.current.managementDialog.onPriorityChange("urgente");
    view.result.current.managementDialog.onNotesChange("No debe aplicarse");
  });
  assert.equal(view.result.current.managementDialog.form.prioridad, "alta");
  assert.equal(view.result.current.managementDialog.form.notas, "");

  view.rerender({
    ticket: secondTicketDetail,
    ticketQueryKey: secondTicketQueryKey,
  });
  assert.equal(view.result.current.isReloadingConflict, false);
  act(() => view.result.current.managementDialog.onOpenChange(true));
  act(() =>
    view.result.current.managementDialog.onNotesChange("B no se reemplaza"),
  );

  await act(async () => {
    resolveReload?.({
      data: { ...ticketDetail, version: 8, prioridad: "urgente" },
      error: null,
      isError: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(refetchSeguimientos.mock.callCount(), 1);
  assert.equal(view.result.current.managementDialog.open, true);
  assert.equal(
    view.result.current.managementDialog.form.notas,
    "B no se reemplaza",
  );
  assert.equal(view.result.current.managementDialog.hasVersionConflict, false);
});

test("seguimiento bloquea doble submit y preserva texto escrito durante el request", async (t) => {
  let resolvePost: ((response: Response) => void) | undefined;
  let postRequests = 0;
  t.mock.method(globalThis, "fetch", async (): Promise<Response> => {
    postRequests += 1;
    return new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
  });

  const queryClient = createQueryClient();
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    () =>
      useTicketSeguimiento({
        ticketId: ticket.id,
        adminMode: false,
        adminRequest: {},
      }),
    { wrapper: createWrapper(queryClient) },
  );

  act(() => {
    view.result.current.historyCard.onDraftChange("Nota enviada");
    view.result.current.historyCard.onSubmit();
    view.result.current.historyCard.onSubmit();
  });
  await waitFor(() => assert.ok(resolvePost));
  assert.equal(postRequests, 1);

  act(() =>
    view.result.current.historyCard.onDraftChange("Texto nuevo preservado"),
  );
  await act(async () => {
    resolvePost?.(jsonResponse({ id: 1 }, 201));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    assert.equal(view.result.current.historyCard.isSubmitting, false),
  );

  assert.equal(view.result.current.historyCard.draft, "Texto nuevo preservado");
  assert.equal(invalidateQueries.mock.callCount(), 1);
});

test("seguimiento de A no limpia ni notifica después de cambiar a B", async (t) => {
  let resolvePostA: ((response: Response) => void) | undefined;
  let resolvePostB: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      return new Promise<Response>((resolve) => {
        if (url.includes("/41/")) resolvePostA = resolve;
        else resolvePostB = resolve;
      });
    },
  );

  const queryClient = createQueryClient();
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = renderHook(
    ({ ticketId }: { ticketId: number }) =>
      useTicketSeguimiento({
        ticketId,
        adminMode: false,
        adminRequest: {},
      }),
    {
      wrapper: createWrapper(queryClient),
      initialProps: { ticketId: ticket.id },
    },
  );

  act(() => view.result.current.historyCard.onDraftChange("Nota de A"));
  act(() => view.result.current.historyCard.onSubmit());
  await waitFor(() => assert.ok(resolvePostA));

  view.rerender({ ticketId: secondTicketDetail.id });
  assert.equal(view.result.current.historyCard.draft, "");
  act(() => view.result.current.historyCard.onDraftChange("Nota de B"));
  act(() => view.result.current.historyCard.onSubmit());
  await waitFor(() => assert.ok(resolvePostB));

  await act(async () => {
    resolvePostA?.(jsonResponse({ id: 1 }, 201));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(view.result.current.historyCard.draft, "Nota de B");
  assert.equal(view.result.current.historyCard.isSubmitting, true);
  assert.equal(invalidateQueries.mock.callCount(), 0);

  await act(async () => {
    resolvePostB?.(jsonResponse({ id: 2 }, 201));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() => assert.equal(view.result.current.historyCard.draft, ""));
  assert.equal(invalidateQueries.mock.callCount(), 1);
});
