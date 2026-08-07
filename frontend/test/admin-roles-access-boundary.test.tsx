import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getListAdminRolesQueryKey,
  type AdminRole,
  type AdminRoleListResponse,
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
