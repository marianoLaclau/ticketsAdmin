import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  type AdminRole,
  type AdminRoleListResponse,
} from "@workspace/api-client-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "../src/components/ui/tabs.tsx";
import { AdminRolesTab } from "../src/features/admin-directory/AdminRolesTab.tsx";
import type { AdminCredentialState } from "../src/lib/admin-credential-state.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const role: AdminRole = {
  id: 9,
  nombre: "Legal personalizado",
  descripcion: "Gestión interna",
  activo: true,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-01T12:00:00.000Z",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function seedRoles(queryClient: QueryClient, accessVersion: number): void {
  const params = { page: 1, limit: 100 };
  queryClient.setQueryData<AdminRoleListResponse>(
    [...getListAdminRolesQueryKey(params), "admin-access", accessVersion],
    { roles: [role], total: 1, page: 1, limit: 100 },
  );
}

interface HarnessProps {
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
}

function RolesHarness({
  adminAccessState,
  accessVersion,
  accessGeneration,
}: HarnessProps) {
  return (
    <Tabs value="roles">
      <AdminRolesTab
        request={{ headers: { "x-admin-key": "test-only" } }}
        queryRequest={{ headers: { "x-admin-key": "test-only" } }}
        adminAccessState={adminAccessState}
        accessVersion={accessVersion}
        accessGeneration={accessGeneration}
        urlState={{}}
        updateUrlState={() => undefined}
      />
    </Tabs>
  );
}

test("descarta borradores y confirmaciones al cambiar el acceso administrativo", async (t) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  for (const accessVersion of [1, 2, 3]) {
    seedRoles(queryClient, accessVersion);
  }
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const renderHarness = (props: HarnessProps) => (
    <QueryClientProvider client={queryClient}>
      <RolesHarness {...props} />
    </QueryClientProvider>
  );
  const view = render(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 1,
      accessGeneration: 0,
    }),
  );
  const browser = userEvent.setup();

  await browser.click(screen.getByRole("button", { name: "Nuevo rol" }));
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "Borrador reservado" },
  });

  view.rerender(
    renderHarness({
      adminAccessState: "pending",
      accessVersion: 1,
      accessGeneration: 1,
    }),
  );
  assert.equal(screen.queryByRole("dialog"), null);

  view.rerender(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 2,
      accessGeneration: 1,
    }),
  );
  await browser.click(screen.getByRole("button", { name: "Nuevo rol" }));
  assert.equal(
    (screen.getByLabelText("Nombre *") as HTMLInputElement).value,
    "",
  );
  await browser.click(screen.getByRole("button", { name: "Cancelar" }));

  await browser.click(
    screen.getByRole("button", { name: `Eliminar rol ${role.nombre}` }),
  );
  assert.match(
    screen.getByRole("alertdialog").textContent ?? "",
    /Eliminar el rol “Legal personalizado”/,
  );

  view.rerender(
    renderHarness({
      adminAccessState: "pending",
      accessVersion: 2,
      accessGeneration: 2,
    }),
  );
  assert.equal(screen.queryByRole("alertdialog"), null);

  view.rerender(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 3,
      accessGeneration: 2,
    }),
  );
  assert.equal(screen.queryByRole("alertdialog"), null);
});

test("serializa las mutaciones para no cerrar un editor reabierto", async (t) => {
  let resolveCreateRole: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCreateRole = resolve;
        });
      }
      if (url.includes("/api/admin/roles")) {
        return new Response(
          JSON.stringify({ roles: [role], total: 1, page: 1, limit: 100 }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Solicitud inesperada en la prueba: ${method} ${url}`);
    },
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  seedRoles(queryClient, 1);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RolesHarness
        adminAccessState="ready"
        accessVersion={1}
        accessGeneration={0}
      />
    </QueryClientProvider>,
  );
  const browser = userEvent.setup();
  const newRoleButton = screen.getByRole("button", { name: "Nuevo rol" });

  await browser.click(newRoleButton);
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "Rol en creación" },
  });
  await browser.click(screen.getByRole("button", { name: "Guardar rol" }));
  await waitFor(() => assert.ok(resolveCreateRole));

  await browser.click(screen.getByRole("button", { name: "Cancelar" }));
  const editRoleButton = screen.getByRole("button", {
    name: `Editar rol ${role.nombre}`,
  });
  assert.equal(newRoleButton.hasAttribute("disabled"), true);
  assert.equal(editRoleButton.hasAttribute("disabled"), true);
  await browser.click(newRoleButton);
  assert.equal(screen.queryByRole("dialog"), null);

  resolveCreateRole?.(
    new Response(
      JSON.stringify({
        ...role,
        id: 10,
        nombre: "Rol en creación",
        descripcion: null,
      } satisfies AdminRole),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    ),
  );
  await waitFor(() =>
    assert.equal(newRoleButton.hasAttribute("disabled"), false),
  );
  await browser.click(newRoleButton);
  assert.equal(
    (screen.getByLabelText("Nombre *") as HTMLInputElement).value,
    "",
  );
});

test("ignora una creación tardía después de cambiar la frontera administrativa", async (t) => {
  const pendingPosts: Array<(response: Response) => void> = [];
  const roleDirectoryRequests: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST") {
        return new Promise<Response>((resolve) => pendingPosts.push(resolve));
      }
      if (url.includes("/api/admin/roles")) {
        roleDirectoryRequests.push(url);
        return jsonResponse({ roles: [role], total: 1, page: 1, limit: 100 });
      }
      throw new Error(`Solicitud inesperada en la prueba: ${method} ${url}`);
    },
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  seedRoles(queryClient, 1);
  seedRoles(queryClient, 2);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const renderHarness = (props: HarnessProps) => (
    <QueryClientProvider client={queryClient}>
      <RolesHarness {...props} />
    </QueryClientProvider>
  );
  const view = render(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 1,
      accessGeneration: 0,
    }),
  );
  const browser = userEvent.setup();

  await browser.click(screen.getByRole("button", { name: "Nuevo rol" }));
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "Solicitud anterior" },
  });
  await browser.click(screen.getByRole("button", { name: "Guardar rol" }));
  await waitFor(() => assert.equal(pendingPosts.length, 1));

  view.rerender(
    renderHarness({
      adminAccessState: "pending",
      accessVersion: 1,
      accessGeneration: 1,
    }),
  );
  view.rerender(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 2,
      accessGeneration: 1,
    }),
  );

  const newRoleButton = screen.getByRole("button", { name: "Nuevo rol" });
  await waitFor(() =>
    assert.equal(newRoleButton.hasAttribute("disabled"), false),
  );
  await browser.click(newRoleButton);
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "Borrador vigente" },
  });
  roleDirectoryRequests.length = 0;

  await act(async () => {
    pendingPosts[0]?.(
      jsonResponse(
        {
          ...role,
          id: 10,
          nombre: "Solicitud anterior",
          descripcion: null,
        } satisfies AdminRole,
        201,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(screen.getByRole("dialog"));
  assert.equal(
    (screen.getByLabelText("Nombre *") as HTMLInputElement).value,
    "Borrador vigente",
  );
  assert.equal(roleDirectoryRequests.length, 0);
});

test("conserva payloads e invalidaciones observables en todo el CRUD", async (t) => {
  const mutationRequests: Array<{
    method: string;
    url: string;
    body: unknown;
  }> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && url.includes("/api/admin/roles")) {
        return jsonResponse({ roles: [role], total: 1, page: 1, limit: 100 });
      }
      if (url.includes("/api/admin/roles")) {
        const body =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as unknown)
            : undefined;
        mutationRequests.push({ method, url, body });
        if (method === "DELETE") return new Response(null, { status: 204 });
        return jsonResponse(
          {
            ...role,
            ...(body && typeof body === "object" ? body : {}),
            id: method === "POST" ? 10 : role.id,
          } satisfies AdminRole,
          method === "POST" ? 201 : 200,
        );
      }
      throw new Error(`Solicitud inesperada en la prueba: ${method} ${url}`);
    },
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  seedRoles(queryClient, 1);
  const invalidateQueries = t.mock.method(queryClient, "invalidateQueries");
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RolesHarness
        adminAccessState="ready"
        accessVersion={1}
        accessGeneration={0}
      />
    </QueryClientProvider>,
  );
  const browser = userEvent.setup();

  await browser.click(screen.getByRole("button", { name: "Nuevo rol" }));
  await browser.click(screen.getByRole("button", { name: "Guardar rol" }));
  assert.equal(mutationRequests.length, 0, "un nombre vacío no despacha");
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "  Finanzas internas  " },
  });
  fireEvent.change(screen.getByLabelText("Descripción"), {
    target: { value: "   " },
  });
  await browser.click(screen.getByRole("button", { name: "Guardar rol" }));
  await waitFor(() => assert.equal(mutationRequests.length, 1));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.deepEqual(mutationRequests[0], {
    method: "POST",
    url: "/api/admin/roles",
    body: {
      nombre: "Finanzas internas",
      descripcion: null,
      activo: true,
    },
  });
  await waitFor(() => assert.equal(invalidateQueries.mock.callCount(), 2));

  await browser.click(
    screen.getByRole("button", { name: `Editar rol ${role.nombre}` }),
  );
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "  Legal actualizado  " },
  });
  fireEvent.change(screen.getByLabelText("Descripción"), {
    target: { value: "  Consulta prioritaria  " },
  });
  await browser.click(screen.getByRole("switch", { name: "Rol activo" }));
  await browser.click(screen.getByRole("button", { name: "Guardar rol" }));
  await waitFor(() => assert.equal(mutationRequests.length, 2));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.deepEqual(mutationRequests[1], {
    method: "PATCH",
    url: `/api/admin/roles/${role.id}`,
    body: {
      nombre: "Legal actualizado",
      descripcion: "Consulta prioritaria",
      activo: false,
    },
  });
  await waitFor(() => assert.equal(invalidateQueries.mock.callCount(), 4));

  await browser.click(
    screen.getByRole("switch", { name: `Desactivar rol ${role.nombre}` }),
  );
  await waitFor(() => assert.equal(mutationRequests.length, 3));
  assert.deepEqual(mutationRequests[2], {
    method: "PATCH",
    url: `/api/admin/roles/${role.id}`,
    body: { activo: false },
  });
  await waitFor(() => assert.equal(invalidateQueries.mock.callCount(), 6));

  await browser.click(
    screen.getByRole("button", { name: `Eliminar rol ${role.nombre}` }),
  );
  await browser.click(screen.getByRole("button", { name: "Eliminar rol" }));
  await waitFor(() => assert.equal(mutationRequests.length, 4));
  assert.deepEqual(mutationRequests[3], {
    method: "DELETE",
    url: `/api/admin/roles/${role.id}`,
    body: undefined,
  });
  await waitFor(() => assert.equal(invalidateQueries.mock.callCount(), 7));

  assert.deepEqual(
    invalidateQueries.mock.calls.map((call) => call.arguments[0]?.queryKey),
    [
      getListAdminRolesQueryKey(),
      getListAdminUsersQueryKey(),
      getListAdminRolesQueryKey(),
      getListAdminUsersQueryKey(),
      getListAdminRolesQueryKey(),
      getListAdminUsersQueryKey(),
      getListAdminRolesQueryKey(),
    ],
  );
});
