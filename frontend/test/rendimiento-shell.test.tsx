import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import { RendimientoRouteGuard } from "../src/features/auth/RendimientoRouteGuard.tsx";
import Rendimiento from "../src/pages/Rendimiento.tsx";
import { assertNoAxeViolations } from "./axe.ts";

const BASE_USER: AuthUser = {
  id: 1,
  nombre: "Ada",
  apellido: "Lovelace",
  email: "ada@example.test",
  rol: "SysAdmin",
  debe_cambiar_password: false,
};

function renderGuardForRole(rol: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  const user: AuthUser = { ...BASE_USER, rol };
  queryClient.setQueryData(getGetMeQueryKey(), user);

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RendimientoRouteGuard>
        <p>Contenido ejecutivo autorizado</p>
      </RendimientoRouteGuard>
    </QueryClientProvider>,
  );

  return { queryClient, view };
}

test("autoriza Rendimiento únicamente para SysAdmin y Controller", (t) => {
  t.after(cleanup);

  for (const rol of ["SysAdmin", "Controller"]) {
    const { queryClient, view } = renderGuardForRole(rol);
    assert.ok(screen.getByText("Contenido ejecutivo autorizado"));
    view.unmount();
    queryClient.clear();
  }

  for (const rol of ["Administrador", "Operador", "Mesa personalizada"]) {
    const { queryClient, view } = renderGuardForRole(rol);
    assert.equal(screen.queryByText("Contenido ejecutivo autorizado"), null);
    assert.ok(screen.getByRole("heading", { name: "Acceso denegado" }));
    view.unmount();
    queryClient.clear();
  }
});

test("presenta cuatro vistas honestas, accesibles y adaptables", async (t) => {
  t.after(cleanup);
  render(
    <main>
      <Rendimiento />
    </main>,
  );

  assert.equal(
    screen.getByRole("heading", { name: "Rendimiento" }).tagName,
    "H1",
  );
  assert.ok(screen.getByText("Acceso dirección · En preparación"));
  assert.equal(screen.queryByText("Sin métricas provisorias"), null);

  const tabList = screen.getByRole("tablist");
  assert.match(tabList.className, /grid-cols-2/);
  assert.match(tabList.className, /lg:grid-cols-4/);
  assert.match(tabList.className, /w-full/);

  const expectedViews = [
    ["Resumen equipo", "Resumen del equipo"],
    ["Personas", "Rendimiento individual"],
    ["Reiteraciones", "Contactos reiterados"],
    ["Calidad de datos", "Calidad y cobertura"],
  ] as const;
  const user = userEvent.setup();

  for (const [tabName, heading] of expectedViews) {
    const tab = screen.getByRole("tab", { name: tabName });
    await user.click(tab);
    assert.equal(tab.getAttribute("aria-selected"), "true");
    assert.ok(screen.getByRole("heading", { name: heading }));
    assert.ok(screen.getByText("Próxima etapa"));
  }

  assert.equal(screen.queryByRole("button", { name: /exportar/i }), null);
  await assertNoAxeViolations();
});
