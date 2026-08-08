import assert from "node:assert/strict";
import test from "node:test";
import {
  MotivoCategoria,
  TicketEstado,
  TicketPrioridad,
  type Ticket,
} from "@workspace/api-client-react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DashboardOverdueTicketsPanel } from "../src/features/dashboard/DashboardOverdueTicketsPanel.tsx";

const referenceTimeMs = Date.parse("2026-08-07T12:00:00.000Z");

function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 1,
    version: 1,
    conversation_id: "conversation-1",
    hora: "09:00",
    nombre: "Ana",
    apellido: "Horas",
    telefono: null,
    dni: null,
    empresa: "Empresa Uno",
    estado_empleado: null,
    email: null,
    motivo: "Consulta horaria",
    motivo_categoria: MotivoCategoria.sin_clasificar,
    resumen: null,
    notificado: false,
    estado: TicketEstado.nuevo,
    prioridad: TicketPrioridad.alta,
    asignado_usuario_id: null,
    asignado_a: null,
    audio_url: null,
    notas: null,
    fecha_creacion: "2026-08-01T12:00:00.000Z",
    fecha_limite: "2026-08-07T00:00:00.000Z",
    fecha_resolucion: null,
    progreso: 0,
    ...overrides,
  };
}

test("presenta tres indicadores mientras carga", (t) => {
  cleanup();
  t.after(cleanup);
  const view = render(
    <DashboardOverdueTicketsPanel
      tickets={undefined}
      overdueCount={3}
      isLoading={true}
      referenceTimeMs={referenceTimeMs}
    />,
  );

  assert.ok(
    screen.getByRole("heading", { name: "Requieren Atención Inmediata" }),
  );
  assert.ok(screen.getByText("3 vencidos"));
  assert.equal(
    view.container.getElementsByClassName("animate-pulse").length,
    3,
  );
  assert.equal(screen.queryByRole("table") === null, true);
});

test("presenta el estado vacío sin contador", (t) => {
  cleanup();
  t.after(cleanup);
  render(
    <DashboardOverdueTicketsPanel
      tickets={[]}
      overdueCount={0}
      isLoading={false}
      referenceTimeMs={referenceTimeMs}
    />,
  );

  assert.ok(screen.getByText("Todos los tickets están al día"));
  assert.equal(screen.queryByText(/\d+ vencidos/) === null, true);
  assert.equal(screen.queryByRole("table") === null, true);
});

test("mantiene filas, enlaces y antigüedad asociados a cada ticket", (t) => {
  cleanup();
  t.after(cleanup);
  const location = memoryLocation({ path: "/" });
  const tickets = [
    createTicket({ id: 11 }),
    createTicket({
      id: 12,
      nombre: "Bruno",
      apellido: "Días",
      empresa: null,
      motivo: "Consulta por embargo",
      prioridad: TicketPrioridad.urgente,
      fecha_limite: "2026-08-05T11:00:00.000Z",
    }),
    createTicket({
      id: 13,
      nombre: "Contacto",
      apellido: "Sin límite",
      fecha_limite: null,
    }),
    createTicket({
      id: 14,
      nombre: "Carla",
      apellido: "Borde",
      empresa: null,
      motivo: "Consulta exacta",
      prioridad: TicketPrioridad.media,
      fecha_limite: "2026-08-06T12:00:00.000Z",
    }),
  ];

  render(
    <Router hook={location.hook}>
      <DashboardOverdueTicketsPanel
        tickets={tickets}
        overdueCount={8}
        isLoading={false}
        referenceTimeMs={referenceTimeMs}
      />
    </Router>,
  );

  assert.ok(screen.getByText("8 vencidos"));
  assert.ok(
    screen.getByRole("table", {
      name: "Tickets vencidos que requieren atención inmediata",
    }),
  );

  for (const [name, href, motive, priority, age] of [
    ["Ana Horas", "/tickets/11", "Consulta horaria", "alta", "12h"],
    ["Bruno Días", "/tickets/12", "Consulta por embargo", "urgente", "2d"],
    ["Carla Borde", "/tickets/14", "Consulta exacta", "media", "24h"],
  ] as const) {
    const link = screen.getByRole("link", { name: new RegExp(name) });
    assert.equal(link.getAttribute("href"), href);
    const row = link.closest("tr");
    assert.ok(row);
    assert.ok(within(row).getByText(motive));
    assert.ok(within(row).getByText(priority));
    assert.ok(within(row).getByText(age));
  }

  assert.ok(screen.getByText("Empresa Uno"));
  assert.equal(screen.queryByText("Contacto Sin límite") === null, true);
  assert.equal(screen.getAllByRole("row").length, 4);
});
