import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AdminHeader } from "../src/components/admin/AdminHeader.tsx";

interface FetchCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

function renderAdminHeader() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  const location = memoryLocation({ path: "/admin" });

  function Harness() {
    const [adminKey, setAdminKey] = useState("");

    return (
      <AdminHeader
        title="Administración"
        description="Gestioná tickets, roles y usuarios."
        adminKey={adminKey}
        onAdminKeyChange={setAdminKey}
      />
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <Harness />
      </Router>
    </QueryClientProvider>,
  );

  return queryClient;
}

test("verifica la llave administrativa sin exponerla fuera del header", async (t) => {
  const secret = "llave-super-secreta";
  const fetchCalls: FetchCall[] = [];

  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      fetchCalls.push({ input, init });
      return new Response(
        JSON.stringify({ roles: [], total: 0, page: 1, limit: 1 }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  );

  let queryClient: QueryClient | undefined;
  t.after(() => {
    cleanup();
    queryClient?.clear();
  });
  queryClient = renderAdminHeader();

  assert.match(
    screen.getByRole("status").textContent ?? "",
    /Falta la llave de administración/,
  );
  assert.equal(fetchCalls.length, 0);
  assert.equal(fetchMock.mock.callCount(), 0);

  const input = screen.getByLabelText("Llave de administración");
  assert.equal(input.getAttribute("type"), "password");

  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", {
      name: "Mostrar llave de administración",
    }),
  );
  assert.equal(input.getAttribute("type"), "text");
  assert.equal(
    screen
      .getByRole("button", { name: "Ocultar llave de administración" })
      .getAttribute("aria-pressed"),
    "true",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Ocultar llave de administración",
    }),
  );
  assert.equal(input.getAttribute("type"), "password");

  const navigation = screen.getByRole("navigation", {
    name: "Secciones de administración",
  });
  assert.equal(
    within(navigation)
      .getByRole("link", { name: "Tickets" })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    within(navigation)
      .getByRole("link", { name: "Roles y usuarios" })
      .hasAttribute("aria-current"),
    false,
  );

  fireEvent.change(input, { target: { value: secret } });
  assert.match(
    screen.getByRole("status").textContent ?? "",
    /Preparando verificación/,
  );
  assert.equal(fetchCalls.length, 0);

  await waitFor(
    () => {
      assert.match(
        screen.getByRole("status").textContent ?? "",
        /Llave activa.*acceso habilitado/,
      );
    },
    { timeout: 2_000 },
  );

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchMock.mock.callCount(), 1);
  const request = fetchCalls[0];
  assert.ok(request);

  const requestUrl =
    request.input instanceof Request
      ? request.input.url
      : String(request.input);
  const requestHeaders = new Headers(request.init?.headers);

  assert.equal(requestUrl, "/api/admin/roles?page=1&limit=1");
  assert.equal(requestHeaders.get("x-admin-key"), secret);
  assert.equal(requestUrl.includes(secret), false);

  const cachedQueryKeys = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey);
  assert.equal(JSON.stringify(cachedQueryKeys).includes(secret), false);
});
