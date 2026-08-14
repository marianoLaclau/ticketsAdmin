import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  RendimientoReiteracionTicket,
  RendimientoReiteraciones,
} from "@workspace/api-client-react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  buildRepetitionContactTicketSignature,
  RendimientoReiteracionesPanel,
} from "../src/features/rendimiento/RendimientoReiteracionesPanel.tsx";
import {
  RendimientoReiteracionesErrorState,
  RendimientoReiteracionesLoadingState,
} from "../src/features/rendimiento/RendimientoReiteracionesView.tsx";
import { assertNoAxeViolations } from "./axe.ts";

function ticket(
  id: number,
  overrides: Partial<RendimientoReiteracionTicket> = {},
): RendimientoReiteracionTicket {
  return {
    id,
    fecha_creacion: `2026-08-${String(id - 96).padStart(2, "0")}T14:00:00.000Z`,
    estado: "nuevo",
    prioridad: "media",
    fecha_limite: "2026-08-15T14:00:00.000Z",
    vencido: false,
    motivo_categoria: "contacto_general",
    asignado_usuario_id: null,
    asignado_a: null,
    ...overrides,
  };
}

function reiteracionesData(): RendimientoReiteraciones {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 40,
    cobertura: {
      identidad_utilizable: {
        numerador: 30,
        denominador: 40,
        porcentaje: 75,
      },
      ambiguos_detectados: 2,
      criterio: "clave_canonica_no_transitiva",
    },
    resumen: {
      contactos_reiterados: 1,
      tickets_involucrados: 4,
      abiertos: 3,
      vencidos_abiertos: 1,
    },
    pagina: 1,
    limite: 10,
    total_paginas: 1,
    contactos: [
      {
        grupo_id: "grupo-opaco-1",
        nombre_referencia: "Ana Pérez",
        coincidencia: {
          tipo: "dni",
          valor_enmascarado: "DNI •••123",
        },
        cantidad_llamados: 4,
        abiertos: 3,
        vencidos_abiertos: 1,
        primer_contacto: "2026-08-01T14:00:00.000Z",
        ultimo_contacto: "2026-08-04T14:00:00.000Z",
        antiguedad_abierto_horas: 52,
        prioridad_maxima: "urgente",
        responsables: [
          {
            usuario_id: 7,
            nombre: "Carla Ruiz",
            cantidad_abiertos: 2,
          },
          {
            usuario_id: null,
            nombre: "Sin asignar",
            cantidad_abiertos: 1,
          },
        ],
        tickets: [
          ticket(100, {
            estado: "en_proceso",
            prioridad: "urgente",
            vencido: true,
            asignado_usuario_id: 7,
            asignado_a: "Carla Ruiz",
          }),
          ticket(99, {
            estado: "pendiente",
            prioridad: "alta",
            asignado_usuario_id: 7,
            asignado_a: "Carla Ruiz",
          }),
          ticket(98),
          ticket(97, {
            estado: "cerrado",
            prioridad: "baja",
            fecha_limite: null,
          }),
        ],
      },
    ],
  };
}

test("presenta riesgo, cobertura, identidad enmascarada y expande tickets", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const location = memoryLocation({ path: "/rendimiento" });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <main>
        <RendimientoReiteracionesPanel
          data={reiteracionesData()}
          onClearFilters={() => {}}
        />
      </main>
    </Router>,
  );

  assert.ok(screen.getByRole("heading", { name: "Contactos recurrentes" }));
  assert.ok(screen.getByRole("heading", { name: "Cobertura de identidad" }));
  assert.ok(screen.getByText(/30 de 40 tickets/));
  assert.ok(screen.getByText(/2 tickets ambiguos/));

  const contact = screen
    .getByRole("heading", { name: "Ana Pérez" })
    .closest<HTMLElement>("article");
  assert.ok(contact);
  assert.ok(within(contact).getByText("Coincidencia por DNI"));
  assert.ok(within(contact).getByText("DNI •••123"));
  assert.equal(within(contact).queryByText("12345678"), null);
  assert.ok(within(contact).getByText("4 llamados"));
  assert.ok(within(contact).getByText("3 abiertos"));
  assert.ok(within(contact).getByText("1 vencido"));
  assert.ok(within(contact).getByText("2 días 4 h"));
  assert.ok(within(contact).getAllByText("Carla Ruiz").length >= 1);
  assert.ok(within(contact).getAllByText("Sin asignar").length >= 1);

  assert.ok(
    within(contact).getByRole("link", {
      name: "Abrir ticket #100 de Ana Pérez",
    }),
  );
  assert.ok(within(contact).getByText("Ticket #98"));
  assert.equal(within(contact).queryByText("Ticket #97"), null);

  const expand = within(contact).getByRole("button", {
    name: "Ver 1 ticket más",
  });
  assert.equal(expand.getAttribute("aria-expanded"), "false");
  const controlledId = expand.getAttribute("aria-controls");
  assert.ok(controlledId);
  assert.ok(document.getElementById(controlledId));

  await user.click(expand);
  assert.equal(expand.getAttribute("aria-expanded"), "true");
  assert.ok(within(contact).getByText("Ticket #97"));
  assert.ok(
    within(contact).getByRole("button", {
      name: "Mostrar solo los 3 más recientes",
    }),
  );

  await assertNoAxeViolations();
});

test("distingue conjunto vacío, falta de identidad y ausencia de grupos", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const base = reiteracionesData();
  let clears = 0;
  const empty = render(
    <RendimientoReiteracionesPanel
      data={{
        ...base,
        tickets_evaluados: 0,
        cobertura: {
          ...base.cobertura,
          identidad_utilizable: {
            numerador: 0,
            denominador: 0,
            porcentaje: null,
          },
        },
        resumen: {
          contactos_reiterados: 0,
          tickets_involucrados: 0,
          abiertos: 0,
          vencidos_abiertos: 0,
        },
        total_paginas: 0,
        contactos: [],
      }}
      onClearFilters={() => {
        clears += 1;
      }}
    />,
  );
  assert.ok(
    screen.getByRole("heading", { name: "No hay datos para estos filtros" }),
  );
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  assert.equal(clears, 1);
  empty.unmount();

  const noIdentity = render(
    <RendimientoReiteracionesPanel
      data={{
        ...base,
        cobertura: {
          ...base.cobertura,
          identidad_utilizable: {
            numerador: 0,
            denominador: 40,
            porcentaje: 0,
          },
        },
        total_paginas: 0,
        contactos: [],
      }}
      onClearFilters={() => {}}
    />,
  );
  assert.ok(
    screen.getByRole("heading", { name: "No hay identidad utilizable" }),
  );
  noIdentity.unmount();

  render(
    <RendimientoReiteracionesPanel
      data={{
        ...base,
        resumen: {
          contactos_reiterados: 0,
          tickets_involucrados: 0,
          abiertos: 0,
          vencidos_abiertos: 0,
        },
        total_paginas: 0,
        contactos: [],
      }}
      onClearFilters={() => {}}
    />,
  );
  assert.ok(
    screen.getByRole("heading", {
      name: "No se detectaron contactos recurrentes con gestiones abiertas",
    }),
  );
});

test("pagina contactos y bloquea la navegacion mientras carga", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const base = reiteracionesData();
  const location = memoryLocation({ path: "/rendimiento" });
  let previousPages = 0;
  let nextPages = 0;

  const view = render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <RendimientoReiteracionesPanel
        data={{
          ...base,
          resumen: { ...base.resumen, contactos_reiterados: 11 },
          total_paginas: 2,
        }}
        onClearFilters={() => {}}
        onPreviousPage={() => {
          previousPages += 1;
        }}
        onNextPage={() => {
          nextPages += 1;
        }}
      />
    </Router>,
  );

  const pagination = screen.getByRole("navigation", {
    name: "Paginación de contactos recurrentes",
  });
  assert.ok(within(pagination).getByText(/Página 1 de 2/));
  assert.equal(
    (
      within(pagination).getByRole("button", {
        name: "Anterior",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  await user.click(
    within(pagination).getByRole("button", { name: "Siguiente" }),
  );
  assert.equal(nextPages, 1);

  view.rerender(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <RendimientoReiteracionesPanel
        data={{
          ...base,
          resumen: { ...base.resumen, contactos_reiterados: 11 },
          pagina: 2,
          total_paginas: 2,
        }}
        isPageLoading
        onClearFilters={() => {}}
        onPreviousPage={() => {
          previousPages += 1;
        }}
        onNextPage={() => {
          nextPages += 1;
        }}
      />
    </Router>,
  );

  const busyPagination = screen.getByRole("navigation", {
    name: "Paginación de contactos recurrentes",
  });
  assert.equal(busyPagination.getAttribute("aria-busy"), "true");
  assert.equal(
    (
      within(busyPagination).getByRole("button", {
        name: "Anterior",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(
    (
      within(busyPagination).getByRole("button", {
        name: "Siguiente",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(previousPages, 0);
});

test("mantiene expandido el contacto correcto al reordenar resultados", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const base = reiteracionesData();
  const primaryContact = base.contactos[0];
  assert.ok(primaryContact);
  const secondaryContact = {
    ...primaryContact,
    grupo_id: "grupo-opaco-2",
    nombre_referencia: "Bruno Díaz",
    coincidencia: {
      tipo: "telefono" as const,
      valor_enmascarado: "***456",
    },
    tickets: [ticket(200), ticket(199)],
  };
  const signature = buildRepetitionContactTicketSignature(primaryContact);
  assert.equal(
    signature,
    buildRepetitionContactTicketSignature({
      tickets: [...primaryContact.tickets].reverse(),
    }),
  );

  const location = memoryLocation({ path: "/rendimiento" });
  const view = render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <RendimientoReiteracionesPanel
        data={{
          ...base,
          resumen: { ...base.resumen, contactos_reiterados: 2 },
          contactos: [primaryContact, secondaryContact],
        }}
        onClearFilters={() => {}}
      />
    </Router>,
  );

  const primaryCard = screen
    .getByRole("heading", { name: primaryContact.nombre_referencia })
    .closest<HTMLElement>("article");
  assert.ok(primaryCard);
  await user.click(
    within(primaryCard).getByRole("button", { name: /Ver 1 ticket/ }),
  );
  assert.ok(within(primaryCard).getByText("Ticket #97"));

  view.rerender(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <RendimientoReiteracionesPanel
        data={{
          ...base,
          resumen: { ...base.resumen, contactos_reiterados: 2 },
          contactos: [secondaryContact, primaryContact],
        }}
        onClearFilters={() => {}}
      />
    </Router>,
  );

  const reorderedPrimaryCard = screen
    .getByRole("heading", { name: primaryContact.nombre_referencia })
    .closest<HTMLElement>("article");
  assert.ok(reorderedPrimaryCard);
  assert.ok(within(reorderedPrimaryCard).getByText("Ticket #97"));
  assert.equal(
    within(reorderedPrimaryCard)
      .getByRole("button", {
        name: /Mostrar solo los 3/,
      })
      .getAttribute("aria-expanded"),
    "true",
  );
});

test("los estados loading y error son anunciados y permiten reintentar", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const loading = render(<RendimientoReiteracionesLoadingState />);
  assert.equal(
    screen
      .getByLabelText("Cargando contactos recurrentes")
      .getAttribute("aria-busy"),
    "true",
  );
  loading.unmount();

  let retries = 0;
  render(
    <RendimientoReiteracionesErrorState
      message="No fue posible obtener las coincidencias."
      isRetrying={false}
      onRetry={() => {
        retries += 1;
      }}
    />,
  );
  assert.ok(screen.getByRole("alert"));
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  assert.equal(retries, 1);
});
