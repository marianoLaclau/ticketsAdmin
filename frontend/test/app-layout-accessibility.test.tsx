import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  getGetDashboardStatsQueryKey,
  getGetMeQueryKey,
  type AuthUser,
} from "@workspace/api-client-react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppLayout } from "../src/components/layout/AppLayout.tsx";

const USER: AuthUser = {
  id: 17,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "Operador",
  debe_cambiar_password: false,
};

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;

  close() {}
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

  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: MockEventSource,
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

test("el enlace de salto apunta al main y le transfiere el foco", (t) => {
  installBrowserStubs(t);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
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

  const location = memoryLocation({ path: "/tickets" });
  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <AppLayout>
          <h1>Tickets</h1>
        </AppLayout>
      </Router>
    </QueryClientProvider>,
  );

  const skipLink = screen.getByRole("link", {
    name: "Ir al contenido principal",
  });
  const main = screen.getByRole("main");

  assert.equal(skipLink.getAttribute("href"), "#contenido-principal");
  assert.equal(main.id, "contenido-principal");
  assert.equal(main.tabIndex, -1);
  assert.ok(main.contains(screen.getByRole("heading", { name: "Tickets" })));

  skipLink.focus();
  assert.equal(document.activeElement, skipLink);
  fireEvent.click(skipLink);
  assert.equal(document.activeElement, main);
});
