import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  getGetDashboardStatsQueryKey,
  getGetMeQueryKey,
  type AuthUser,
} from "@workspace/api-client-react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppLayout } from "../src/components/layout/AppLayout.tsx";
import { Toaster } from "../src/components/ui/toaster.tsx";
import { toast as showToast, useToast } from "../src/hooks/use-toast.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const USER: AuthUser = {
  id: 17,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "Operador",
  debe_cambiar_password: false,
};

class TestEventSource {
  static latest: TestEventSource | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(_url: string | URL) {
    TestEventSource.latest = this;
  }

  close() {}

  emit(data: unknown): void {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}

function installBrowserStubs(t: test.TestContext): void {
  const eventSourceDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "EventSource",
  );
  const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "matchMedia",
  );

  TestEventSource.latest = null;
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: TestEventSource,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });

  t.after(() => {
    TestEventSource.latest = null;
    if (eventSourceDescriptor) {
      Object.defineProperty(globalThis, "EventSource", eventSourceDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "EventSource");
    }
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
}

test("los eventos SSE informativos no interrumpen al lector de pantalla", (t) => {
  installBrowserStubs(t);
  const observedTypes = new Map<string, string | undefined>();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(getGetMeQueryKey(), USER);
  queryClient.setQueryData(getGetDashboardStatsQueryKey(), {
    total: 0,
    vencidos: 0,
    por_estado: [],
    por_prioridad: [],
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  function ToastObserver() {
    const { toasts } = useToast();
    for (const currentToast of toasts) {
      if (typeof currentToast.title === "string") {
        observedTypes.set(currentToast.title, currentToast.type);
      }
    }
    return null;
  }

  const location = memoryLocation({ path: "/tickets" });
  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <AppLayout>
          <h1>Tickets</h1>
          <ToastObserver />
        </AppLayout>
      </Router>
    </QueryClientProvider>,
  );

  const source = TestEventSource.latest;
  assert.ok(source);
  act(() => {
    source.emit({
      tipo: "ticket_creado",
      ticket_id: 501,
      nombre: "Ada",
      motivo: "Consulta",
    });
    source.emit({
      tipo: "tickets_importados",
      cantidad: 2,
      cantidad_total: 2,
    });
  });

  assert.equal(observedTypes.get("Nuevo llamado recibido"), "background");
  assert.equal(observedTypes.get("Importación disponible"), "background");
});

test("el proveedor y el viewport exponen etiquetas localizadas", async (t) => {
  t.after(cleanup);

  act(() => {
    showToast({
      type: "background",
      title: "Aviso de prueba localizado",
    });
  });
  render(<Toaster />);

  assert.ok(screen.getByRole("region", { name: "Notificaciones (F8)" }));
  await waitFor(() => {
    const politeAnnouncements = Array.from(
      document.querySelectorAll('[aria-live="polite"]'),
    );
    assert.ok(
      politeAnnouncements.some((announcement) =>
        announcement.textContent?.includes(
          "Notificación Aviso de prueba localizado",
        ),
      ),
    );
  });
});
