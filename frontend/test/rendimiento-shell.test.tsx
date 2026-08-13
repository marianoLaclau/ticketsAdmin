import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getGetMeQueryKey,
  type AuthUser,
  type RendimientoCalidadDatos,
  type RendimientoResumenEquipo,
} from "@workspace/api-client-react";
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

function summaryResponse(): RendimientoResumenEquipo {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_ingresados: 154,
    estado_actual: {
      total: 154,
      abiertos: 64,
      finalizados: 90,
      vencidos_abiertos: 12,
    },
    resolucion_con_fecha: {
      muestra: 75,
      promedio_horas: 25.5,
      mediana_horas: 18.25,
    },
    cumplimiento_plazo_auditable: {
      muestra: 72,
      cumplidos: 58,
      porcentaje: 80.6,
    },
    distribucion_estado: {
      nuevo: 20,
      en_proceso: 30,
      pendiente: 14,
      resuelto: 50,
      cerrado: 40,
    },
    distribucion_prioridad: {
      baja: 24,
      media: 72,
      alta: 40,
      urgente: 18,
    },
  };
}

function qualityResponse(): RendimientoCalidadDatos {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 154,
    resoluciones_evaluadas: 20,
    atribucion_desde: "2026-08-02T14:30:00.000Z",
    comparacion_individual_estado: "parcial",
    coberturas: {
      actor_resolucion: {
        numerador: 17,
        denominador: 20,
        porcentaje: 85,
      },
      fecha_resolucion: {
        numerador: 88,
        denominador: 90,
        porcentaje: 97.8,
      },
      plazo_resolucion: {
        numerador: 14,
        denominador: 20,
        porcentaje: 70,
      },
      asignacion_estructurada: {
        numerador: 62,
        denominador: 71,
        porcentaje: 87.3,
      },
      identidad_contacto: {
        numerador: 120,
        denominador: 154,
        porcentaje: 77.9,
      },
      fecha_limite: {
        numerador: 154,
        denominador: 154,
        porcentaje: 100,
      },
    },
  };
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
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

test("presenta Resumen y Calidad operativos y conserva dos vistas en preparación", async (t) => {
  t.after(cleanup);
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);

    if (url.includes("/rendimiento/resumen-equipo")) {
      return new Response(JSON.stringify(summaryResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rendimiento/calidad-datos")) {
      return new Response(JSON.stringify(qualityResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Endpoint no simulado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
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
  assert.ok(screen.getByRole("form", { name: "Filtros de Rendimiento" }));

  const tabList = screen.getByRole("tablist");
  assert.match(tabList.className, /grid-cols-2/);
  assert.match(tabList.className, /lg:grid-cols-4/);
  assert.match(tabList.className, /w-full/);

  const summaryTab = screen.getByRole("tab", { name: "Resumen equipo" });
  assert.equal(summaryTab.getAttribute("aria-selected"), "true");
  assert.ok(await screen.findByRole("heading", { name: "Resumen del equipo" }));
  const ticketsKpi = screen
    .getByRole("heading", { name: "Tickets ingresados" })
    .closest<HTMLElement>("article");
  assert.ok(ticketsKpi);
  assert.ok(within(ticketsKpi).getByText("154"));
  assert.ok(screen.getByText("18 h 15 min"));
  assert.ok(screen.getByText("80,6%"));
  assert.equal(
    screen.queryByRole("heading", { name: "No hay actividad en este período" }),
    null,
  );
  assert.equal(screen.queryByText("En preparación"), null);
  assert.equal(screen.queryByText("Próxima etapa"), null);
  assert.equal(
    requestedUrls.filter((url) => url.includes("/rendimiento/resumen-equipo"))
      .length,
    1,
  );

  const preparationViews = [
    ["Personas", "Rendimiento individual"],
    ["Reiteraciones", "Contactos reiterados"],
  ] as const;
  const user = userEvent.setup();

  for (const [tabName, heading] of preparationViews) {
    const tab = screen.getByRole("tab", { name: tabName });
    await user.click(tab);
    assert.equal(tab.getAttribute("aria-selected"), "true");
    assert.ok(screen.getByRole("heading", { name: heading }));
    assert.ok(screen.getByText("En preparación"));
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
    screen.getByRole("heading", {
      name: "Comparación individual con cobertura parcial",
    }),
  );
  assert.ok(
    screen.getByRole("progressbar", { name: "Cobertura de Fecha límite" }),
  );
  assert.equal(screen.queryByText("En preparación"), null);
  assert.equal(screen.queryByText("Próxima etapa"), null);
  assert.equal(
    requestedUrls.filter((url) => url.includes("/rendimiento/calidad-datos"))
      .length,
    1,
  );
  assert.equal(screen.queryByRole("button", { name: /exportar/i }), null);
  await assertNoAxeViolations();
});
