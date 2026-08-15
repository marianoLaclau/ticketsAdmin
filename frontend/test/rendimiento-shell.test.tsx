import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getGetMeQueryKey,
  type AuthUser,
  type RendimientoCalidadDatos,
  type RendimientoPersonas,
  type RendimientoReiteraciones,
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
    cumplimiento_plazo: {
      muestra: 90,
      cumplidos: 70,
      porcentaje: 77.8,
      muestra_auditable: 72,
      cumplidos_auditables: 58,
      muestra_historica_reconstruida: 18,
      cumplidos_historicos_reconstruidos: 12,
    },
    backlog_vencido: {
      abiertos: 64,
      con_plazo: 60,
      vencidos: 12,
      porcentaje: 18.75,
    },
    antiguedad_backlog: {
      muestra: 64,
      mediana_horas_habiles: 13.5,
    },
    cobertura_asignacion: {
      abiertos: 64,
      asignados: 53,
      sin_asignar: 11,
      porcentaje: 82.8125,
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

function personasResponse(): RendimientoPersonas {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 154,
    cobertura: {
      resoluciones_evaluadas: 20,
      resoluciones_atribuidas: 17,
      finalizaciones_historicas_detectadas: 5,
      finalizaciones_historicas_atribuidas: 4,
      porcentaje_atribucion: 85,
      atribucion_desde: "2026-08-02T14:30:00.000Z",
      comparacion_individual_estado: "parcial",
      minimo_resoluciones_comparables: 10,
      umbral_cobertura_parcial_porcentaje: 80,
      umbral_cobertura_disponible_porcentaje: 95,
    },
    personas: [
      {
        usuario: {
          id: 1,
          nombre: "Ada Lovelace",
          rol: "Operador",
          activo: true,
        },
        tickets_resueltos: 12,
        resoluciones_atribuidas: 13,
        finalizaciones_historicas_atribuidas: 4,
        tiempo_resolucion_atribuible: {
          muestra: 11,
          promedio_horas: 25.5,
          mediana_horas: 18.25,
        },
        cumplimiento_plazo_auditable: {
          muestra: 9,
          cumplidos: 7,
          porcentaje: 77.8,
        },
        cumplimiento_plazo: {
          muestra: 13,
          cumplidos: 10,
          porcentaje: 76.9,
        },
        carga_actual: {
          abiertos_asignados: 4,
          vencidos_asignados: 1,
        },
        resoluciones_reabiertas: 1,
      },
    ],
  };
}

function reiteracionesResponse(page = 1): RendimientoReiteraciones {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 154,
    cobertura: {
      identidad_utilizable: {
        numerador: 120,
        denominador: 154,
        porcentaje: 77.9,
      },
      ambiguos_detectados: 0,
      criterio: "clave_canonica_no_transitiva",
    },
    resumen: {
      contactos_reiterados: 11,
      tickets_involucrados: 12,
      abiertos: 1,
      vencidos_abiertos: 1,
    },
    pagina: page,
    limite: 10,
    total_paginas: 2,
    contactos: [
      {
        grupo_id: "grupo-opaco-shell",
        nombre_referencia: "Grace Hopper",
        coincidencia: {
          tipo: "email",
          valor_enmascarado: "g***@example.test",
        },
        cantidad_llamados: 2,
        abiertos: 1,
        vencidos_abiertos: 1,
        primer_contacto: "2026-08-02T14:00:00.000Z",
        ultimo_contacto: "2026-08-12T14:00:00.000Z",
        antiguedad_abierto_horas: 26,
        prioridad_maxima: "urgente",
        responsables: [
          {
            usuario_id: 1,
            nombre: "Ada Lovelace",
            cantidad_abiertos: 1,
          },
        ],
        tickets: [
          {
            id: 202,
            fecha_creacion: "2026-08-12T14:00:00.000Z",
            estado: "en_proceso",
            prioridad: "urgente",
            fecha_limite: "2026-08-13T14:00:00.000Z",
            vencido: true,
            motivo_categoria: "reclamos",
            asignado_usuario_id: 1,
            asignado_a: "Ada Lovelace",
          },
          {
            id: 201,
            fecha_creacion: "2026-08-02T14:00:00.000Z",
            estado: "cerrado",
            prioridad: "media",
            fecha_limite: null,
            vencido: false,
            motivo_categoria: "contacto_general",
            asignado_usuario_id: 1,
            asignado_a: "Ada Lovelace",
          },
        ],
      },
    ],
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

test("presenta las cuatro vistas de Rendimiento con datos operativos", async (t) => {
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
    if (url.includes("/rendimiento/personas")) {
      return new Response(JSON.stringify(personasResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rendimiento/reiteraciones")) {
      const requestedPage = Number(
        new URL(url, "http://localhost").searchParams.get("pagina") ?? "1",
      );
      return new Response(
        JSON.stringify(reiteracionesResponse(requestedPage)),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
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
  const location = memoryLocation({ path: "/rendimiento", record: true });

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
  const companyFilter = screen.getByLabelText("Empresa");
  assert.equal(companyFilter.getAttribute("type"), "search");
  assert.equal(
    companyFilter.getAttribute("aria-describedby"),
    "rendimiento-empresa-ayuda",
  );
  const companyHelp = screen.getByText(
    "Busca coincidencias dentro del nombre.",
  );
  assert.match(companyHelp.className, /sr-only/);
  assert.ok(
    screen.getByRole("button", {
      name: "Ayuda sobre búsqueda por nombre",
    }),
  );
  for (const label of ["Período", "Categoría", "Prioridad"]) {
    assert.match(
      screen.getByText(label, { selector: "label" }).className,
      /h-6/,
    );
  }
  assert.match(
    screen.getByText("Empresa", { selector: "label" }).parentElement
      ?.className ?? "",
    /h-6/,
  );

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
  assert.ok(screen.getByText("77,8%"));
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

  const user = userEvent.setup();

  const peopleTab = screen.getByRole("tab", { name: "Operadores" });
  await user.click(peopleTab);
  assert.equal(peopleTab.getAttribute("aria-selected"), "true");
  assert.equal(location.history.at(-1), "/rendimiento?vista=personas");
  assert.ok(
    await screen.findByRole("heading", { name: "Rendimiento individual" }),
  );
  assert.ok(screen.getByRole("heading", { name: "Ada Lovelace" }));
  assert.ok(
    screen.getByRole("meter", {
      name: "Índice de rendimiento operativo de Ada Lovelace",
    }),
  );
  assert.ok(screen.getByText("Orden alfabético A–Z"));
  assert.equal(screen.queryByText("En preparación"), null);
  assert.equal(screen.queryByText("Próxima etapa"), null);
  assert.equal(
    requestedUrls.filter((url) => url.includes("/rendimiento/personas")).length,
    1,
  );

  const repetitionsTab = screen.getByRole("tab", {
    name: "Contactos recurrentes",
  });
  await user.click(repetitionsTab);
  assert.equal(repetitionsTab.getAttribute("aria-selected"), "true");
  assert.equal(location.history.at(-1), "/rendimiento?vista=reiteraciones");
  assert.ok(
    await screen.findByRole("heading", { name: "Contactos recurrentes" }),
  );
  assert.ok(screen.getByRole("heading", { name: "Cobertura de identidad" }));
  assert.ok(screen.getByRole("heading", { name: "Grace Hopper" }));
  await user.click(
    screen.getByRole("button", { name: "Ver detalles de Grace Hopper" }),
  );
  assert.ok(
    screen.getByRole("link", {
      name: "Abrir ticket #202 de Grace Hopper",
    }),
  );
  assert.ok(screen.getByText(/Página 1 de 2/));
  assert.equal(screen.queryByText("En preparación"), null);
  assert.equal(screen.queryByText("Próxima etapa"), null);
  assert.equal(
    requestedUrls.filter((url) => url.includes("/rendimiento/reiteraciones"))
      .length,
    1,
  );

  const initialRepetitionsUrl = requestedUrls.find((url) =>
    url.includes("/rendimiento/reiteraciones"),
  );
  assert.ok(initialRepetitionsUrl);
  const initialRepetitionsParams = new URL(
    initialRepetitionsUrl,
    "http://localhost",
  ).searchParams;
  assert.equal(initialRepetitionsParams.get("pagina"), "1");
  assert.equal(initialRepetitionsParams.get("limite"), "10");

  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  assert.ok(await screen.findByText(/Página 2 de 2/));
  const pageTwoUrl = requestedUrls
    .filter((url) => url.includes("/rendimiento/reiteraciones"))
    .at(-1);
  assert.ok(pageTwoUrl);
  const pageTwoParams = new URL(pageTwoUrl, "http://localhost").searchParams;
  assert.equal(pageTwoParams.get("pagina"), "2");
  assert.equal(pageTwoParams.get("limite"), "10");

  await user.type(screen.getByLabelText("Empresa"), "Acme");
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  assert.equal(
    location.history.at(-1),
    "/rendimiento?empresa=Acme&vista=reiteraciones",
  );
  assert.ok(await screen.findByText(/Página 1 de 2/));
  const filteredUrl = requestedUrls
    .filter((url) => url.includes("/rendimiento/reiteraciones"))
    .at(-1);
  assert.ok(filteredUrl);
  const filteredParams = new URL(filteredUrl, "http://localhost").searchParams;
  assert.equal(filteredParams.get("pagina"), "1");
  assert.equal(filteredParams.get("limite"), "10");
  assert.equal(filteredParams.get("empresa"), "Acme");

  const qualityTab = screen.getByRole("tab", { name: "Calidad de datos" });
  await user.click(qualityTab);
  assert.equal(qualityTab.getAttribute("aria-selected"), "true");
  assert.equal(
    location.history.at(-1),
    "/rendimiento?empresa=Acme&vista=calidad",
  );
  assert.ok(
    await screen.findByRole("heading", { name: "Calidad y cobertura" }),
  );
  assert.ok(screen.getAllByText("Calidad de datos").length >= 2);
  assert.ok(
    screen.getByRole("heading", {
      name: "Datos parciales",
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

test("consulta todo el historial sin enviar límites de fecha", async (t) => {
  t.after(cleanup);
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);
    const response = summaryResponse();
    response.periodo = {
      ...response.periodo,
      fecha_desde: null,
      fecha_hasta: null,
    };
    return new Response(JSON.stringify(response), {
      status: 200,
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
  const location = memoryLocation({
    path: "/rendimiento",
    searchPath: "periodo=todo",
    record: true,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Rendimiento />
      </Router>
    </QueryClientProvider>,
  );

  assert.ok(await screen.findByRole("heading", { name: "Resumen del equipo" }));
  assert.ok(screen.getAllByText("Período completo").length >= 1);
  const complianceCard = screen
    .getByRole("heading", { name: "Cumplimiento del plazo" })
    .closest<HTMLElement>("article");
  assert.ok(complianceCard);
  assert.ok(
    within(complianceCard).getByText("Período evaluado: Período completo"),
  );
  assert.equal(location.history.at(-1), "/rendimiento?periodo=todo");

  const requestUrl = requestedUrls.find((url) =>
    url.includes("/rendimiento/resumen-equipo"),
  );
  assert.ok(requestUrl);
  const params = new URL(requestUrl, "http://localhost").searchParams;
  assert.equal(params.has("fecha_desde"), false);
  assert.equal(params.has("fecha_hasta"), false);
});

test("abre y recarga un deep-link en la vista indicada sin perder filtros", async (t) => {
  t.after(cleanup);
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);

    if (url.includes("/rendimiento/personas")) {
      return new Response(JSON.stringify(personasResponse()), {
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

  const location = memoryLocation({
    path: "/rendimiento",
    searchPath: "periodo=semana&empresa=Acme&vista=personas",
    record: true,
  });

  const renderDeepLink = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook} searchHook={location.searchHook}>
          <Rendimiento />
        </Router>
      </QueryClientProvider>,
    );
    return { queryClient, view };
  };

  const firstRender = renderDeepLink();
  assert.equal(
    screen
      .getByRole("tab", { name: "Operadores" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.ok(
    await screen.findByRole("heading", { name: "Rendimiento individual" }),
  );

  const firstRequest = requestedUrls.find((url) =>
    url.includes("/rendimiento/personas"),
  );
  assert.ok(firstRequest);
  assert.equal(
    new URL(firstRequest, "http://localhost").searchParams.get("empresa"),
    "Acme",
  );
  firstRender.view.unmount();
  firstRender.queryClient.clear();

  const reloaded = renderDeepLink();
  assert.equal(
    screen
      .getByRole("tab", { name: "Operadores" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.ok(
    await screen.findByRole("heading", { name: "Rendimiento individual" }),
  );
  assert.equal(
    location.history.at(-1),
    "/rendimiento?periodo=semana&empresa=Acme&vista=personas",
  );
  reloaded.view.unmount();
  reloaded.queryClient.clear();
});
