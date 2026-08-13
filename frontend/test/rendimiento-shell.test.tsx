import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
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

function emptyQualityResponse() {
  const emptyCoverage = {
    numerador: 0,
    denominador: 0,
    porcentaje: null,
  };
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-31",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 0,
    resoluciones_evaluadas: 0,
    atribucion_desde: null,
    comparacion_individual_estado: "insuficiente",
    coberturas: {
      actor_resolucion: emptyCoverage,
      fecha_resolucion: emptyCoverage,
      plazo_resolucion: emptyCoverage,
      asignacion_estructurada: emptyCoverage,
      identidad_contacto: emptyCoverage,
      fecha_limite: emptyCoverage,
    },
  };
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

test("presenta tres vistas en preparación y Calidad con datos reales", async (t) => {
  t.after(cleanup);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(emptyQualityResponse()), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  t.after(() => queryClient.clear());
  const location = memoryLocation({ path: "/rendimiento" });

  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <main>
          <Rendimiento />
        </main>
      </Router>
    </QueryClientProvider>,
  );

  assert.equal(
    screen.getByRole("heading", { name: "Rendimiento" }).tagName,
    "H1",
  );
  assert.ok(screen.getByText("Acceso dirección"));
  assert.equal(screen.queryByText("Sin métricas provisorias"), null);
  assert.ok(screen.getByRole("form", { name: "Filtros de Rendimiento" }));

  const tabList = screen.getByRole("tablist");
  assert.match(tabList.className, /grid-cols-2/);
  assert.match(tabList.className, /lg:grid-cols-4/);
  assert.match(tabList.className, /w-full/);

  const preparationViews = [
    ["Resumen equipo", "Resumen del equipo"],
    ["Personas", "Rendimiento individual"],
    ["Reiteraciones", "Contactos reiterados"],
  ] as const;
  const user = userEvent.setup();

  for (const [tabName, heading] of preparationViews) {
    const tab = screen.getByRole("tab", { name: tabName });
    await user.click(tab);
    assert.equal(tab.getAttribute("aria-selected"), "true");
    assert.ok(screen.getByRole("heading", { name: heading }));
    assert.ok(screen.getByText("Próxima etapa"));
  }

  const qualityTab = screen.getByRole("tab", { name: "Calidad de datos" });
  await user.click(qualityTab);
  assert.equal(qualityTab.getAttribute("aria-selected"), "true");
  assert.ok(
    await screen.findByRole("heading", { name: "Calidad y cobertura" }),
  );
  assert.ok(screen.getByText("Datos auditados"));
  assert.ok(
    screen.getByRole("heading", { name: "No hay datos para estos filtros" }),
  );
  assert.equal(screen.queryByText("Próxima etapa"), null);
  assert.equal(screen.queryByRole("button", { name: /exportar/i }), null);
  await assertNoAxeViolations();
});
