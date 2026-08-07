import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  type AdminRole,
  type AdminRoleListResponse,
  type AdminUser,
  type AdminUserListResponse,
} from "@workspace/api-client-react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "../src/components/ui/tabs.tsx";
import { AdminUsersTab } from "../src/features/admin-directory/AdminUsersTab.tsx";
import type { AdminCredentialState } from "../src/lib/admin-credential-state.ts";
import type { AdminDirectoryUsersUrlState } from "../src/lib/admin-directory-url.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const role: AdminRole = {
  id: 1,
  nombre: "Operador",
  descripcion: "Atención diaria",
  activo: true,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-01T12:00:00.000Z",
};

const existingUser: AdminUser = {
  id: 7,
  nombre: "Ana",
  apellido: "Pérez",
  username: "ana.perez",
  email: "ana@example.test",
  role_id: role.id,
  activo: true,
  debe_cambiar_password: false,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-01T12:00:00.000Z",
};

const urlState: AdminDirectoryUsersUrlState = { page: 1, limit: 10 };

function seedDirectoryQueries(
  queryClient: QueryClient,
  accessVersion: number,
): void {
  const roleParams = { page: 1, limit: 100 };
  const userParams = { page: 1, limit: 10 };

  queryClient.setQueryData<AdminRoleListResponse>(
    [...getListAdminRolesQueryKey(roleParams), "admin-access", accessVersion],
    { roles: [role], total: 1, page: 1, limit: 100 },
  );
  queryClient.setQueryData<AdminUserListResponse>(
    [...getListAdminUsersQueryKey(userParams), "admin-access", accessVersion],
    { users: [existingUser], total: 1, page: 1, limit: 10 },
  );
}

interface HarnessProps {
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
}

function DirectoryHarness({
  adminAccessState,
  accessVersion,
  accessGeneration,
}: HarnessProps) {
  return (
    <Tabs value="users">
      <AdminUsersTab
        request={{ headers: { "x-admin-key": "test-only" } }}
        queryRequest={{ headers: { "x-admin-key": "test-only" } }}
        adminAccessState={adminAccessState}
        accessVersion={accessVersion}
        accessGeneration={accessGeneration}
        urlState={urlState}
        updateUrlState={() => undefined}
      />
    </Tabs>
  );
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("purga formularios y contraseñas al cambiar la frontera administrativa", async (t) => {
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
    seedDirectoryQueries(queryClient, accessVersion);
  }
  t.after(() => {
    cleanup();
    queryClient.clear();
  });

  const renderHarness = (props: HarnessProps) => (
    <QueryClientProvider client={queryClient}>
      <DirectoryHarness {...props} />
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

  await browser.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  fireEvent.change(screen.getByLabelText("Contraseña temporal *"), {
    target: { value: "Secreto temporal muy seguro 2026" },
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
  assert.equal(screen.queryByRole("dialog"), null);
  await browser.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  assert.equal(
    (screen.getByLabelText("Contraseña temporal *") as HTMLInputElement).value,
    "",
  );
  await browser.click(screen.getByRole("button", { name: "Cancelar" }));

  await browser.click(
    screen.getByRole("button", {
      name: "Asignar contraseña temporal a ana.perez",
    }),
  );
  fireEvent.change(screen.getByLabelText("Nueva contraseña temporal"), {
    target: { value: "Otro secreto temporal seguro 2026" },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal"), {
    target: { value: "Otro secreto temporal seguro 2026" },
  });

  view.rerender(
    renderHarness({
      adminAccessState: "pending",
      accessVersion: 2,
      accessGeneration: 2,
    }),
  );
  assert.equal(screen.queryByRole("dialog"), null);

  view.rerender(
    renderHarness({
      adminAccessState: "ready",
      accessVersion: 3,
      accessGeneration: 2,
    }),
  );
  assert.equal(screen.queryByRole("dialog"), null);
  await browser.click(
    screen.getByRole("button", {
      name: "Asignar contraseña temporal a ana.perez",
    }),
  );
  assert.equal(
    (screen.getByLabelText("Nueva contraseña temporal") as HTMLInputElement)
      .value,
    "",
  );
  assert.equal(
    (screen.getByLabelText("Repetir contraseña temporal") as HTMLInputElement)
      .value,
    "",
  );
});

test("impide reabrir un diálogo mientras su mutación sigue pendiente", async (t) => {
  const pendingPosts: Array<(response: Response) => void> = [];
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
        return jsonResponse({ roles: [role], total: 1, page: 1, limit: 100 });
      }
      if (url.includes("/api/admin/users")) {
        return jsonResponse({
          users: [existingUser],
          total: 1,
          page: 1,
          limit: 10,
        });
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
  seedDirectoryQueries(queryClient, 1);
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DirectoryHarness
        adminAccessState="ready"
        accessVersion={1}
        accessGeneration={0}
      />
    </QueryClientProvider>,
  );
  const browser = userEvent.setup();
  const newUserButton = screen.getByRole("button", { name: "Nuevo usuario" });

  await browser.click(newUserButton);
  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "María" },
  });
  fireEvent.change(screen.getByLabelText("Nombre de usuario *"), {
    target: { value: "maria" },
  });
  fireEvent.change(screen.getByLabelText("Email *"), {
    target: { value: "maria@example.test" },
  });
  const validPassword = "Frase administrativa segura 2026";
  fireEvent.change(screen.getByLabelText("Contraseña temporal *"), {
    target: { value: validPassword },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal *"), {
    target: { value: validPassword },
  });
  await browser.click(screen.getByRole("button", { name: "Guardar usuario" }));
  await waitFor(() => assert.equal(pendingPosts.length, 1));

  await browser.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.equal(newUserButton.hasAttribute("disabled"), true);
  await browser.click(newUserButton);
  assert.equal(screen.queryByRole("dialog"), null);

  pendingPosts[0]?.(
    jsonResponse(
      {
        ...existingUser,
        id: 8,
        nombre: "María",
        apellido: null,
        username: "maria",
        email: "maria@example.test",
        debe_cambiar_password: true,
      } satisfies AdminUser,
      201,
    ),
  );
  await waitFor(() =>
    assert.equal(newUserButton.hasAttribute("disabled"), false),
  );

  const resetButton = screen.getByRole("button", {
    name: "Asignar contraseña temporal a ana.perez",
  });
  await browser.click(resetButton);
  fireEvent.change(screen.getByLabelText("Nueva contraseña temporal"), {
    target: { value: validPassword },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal"), {
    target: { value: validPassword },
  });
  await browser.click(
    screen.getByRole("button", { name: "Asignar contraseña" }),
  );
  await waitFor(() => assert.equal(pendingPosts.length, 2));

  await browser.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.equal(resetButton.hasAttribute("disabled"), true);
  await browser.click(resetButton);
  assert.equal(screen.queryByRole("dialog"), null);

  pendingPosts[1]?.(new Response(null, { status: 204 }));
  await waitFor(() =>
    assert.equal(resetButton.hasAttribute("disabled"), false),
  );
  await browser.click(resetButton);
  assert.equal(
    (screen.getByLabelText("Nueva contraseña temporal") as HTMLInputElement)
      .value,
    "",
  );

  view.unmount();
});
