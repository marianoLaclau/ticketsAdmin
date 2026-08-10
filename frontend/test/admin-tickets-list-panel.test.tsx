import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { TicketSortBy, type Ticket } from "@workspace/api-client-react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Tabs } from "../src/components/ui/tabs.tsx";
import { AdminTicketsListPanel } from "../src/features/admin-tickets/AdminTicketsListPanel.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

for (const [method, implementation] of [
  ["hasPointerCapture", () => false],
  ["setPointerCapture", () => undefined],
  ["releasePointerCapture", () => undefined],
  ["scrollIntoView", () => undefined],
] as const) {
  if (!(method in window.HTMLElement.prototype)) {
    Object.defineProperty(window.HTMLElement.prototype, method, {
      configurable: true,
      value: implementation,
    });
  }
}

const ticket: Ticket = {
  id: 41,
  version: 3,
  conversation_id: "conversation-41",
  hora: "10:25",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "1160000041",
  dni: "30111222",
  empresa: "GSB",
  estado_empleado: "Activo",
  email: "ana@example.test",
  motivo: "Consulta por liquidación",
  motivo_categoria: "bajas_liquidacion",
  resumen: "Solicita revisar su liquidación final.",
  notificado: true,
  estado: "en_proceso",
  prioridad: "alta",
  asignado_usuario_id: 7,
  asignado_a: "Operadora Uno",
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-08T13:25:00.000Z",
  fecha_limite: "2026-08-11T13:25:00.000Z",
  fecha_resolucion: null,
  progreso: 50,
};

const defaultProps: ComponentProps<typeof AdminTicketsListPanel> = {
  search: "",
  sorts: [{ sortBy: TicketSortBy.id, order: "asc" }],
  isDefaultSort: false,
  tickets: [ticket],
  isLoading: false,
  errorMessage: null,
  areCrudActionsDisabled: false,
  detailNavigationState: {
    source: "admin-ticket-list",
    returnTo: "/admin",
  },
  page: 2,
  pageSize: 10,
  total: 37,
  totalPages: 4,
  onSearchChange: () => undefined,
  onCreate: () => undefined,
  onSort: () => undefined,
  onResetSort: () => undefined,
  onEdit: () => undefined,
  onDelete: () => undefined,
  onPageSizeChange: () => undefined,
  onPreviousPage: () => undefined,
  onNextPage: () => undefined,
};

function renderPanel(props: ComponentProps<typeof AdminTicketsListPanel>) {
  const location = memoryLocation({ path: "/admin" });
  const renderTree = (
    nextProps: ComponentProps<typeof AdminTicketsListPanel>,
  ) => (
    <Router hook={location.hook}>
      <Tabs value="registros">
        <AdminTicketsListPanel {...nextProps} />
      </Tabs>
    </Router>
  );
  const view = render(renderTree(props));
  return {
    ...view,
    rerenderPanel: (nextProps: ComponentProps<typeof AdminTicketsListPanel>) =>
      view.rerender(renderTree(nextProps)),
  };
}

test("presenta los registros y delega filtros, orden, acciones y paginación", async (t) => {
  t.after(cleanup);
  const onSearchChange = t.mock.fn();
  const onCreate = t.mock.fn();
  const onSort = t.mock.fn();
  const onResetSort = t.mock.fn();
  const onEdit = t.mock.fn();
  const onDelete = t.mock.fn();
  const onPageSizeChange = t.mock.fn();
  const onPreviousPage = t.mock.fn();
  const onNextPage = t.mock.fn();

  renderPanel({
    ...defaultProps,
    onSearchChange,
    onCreate,
    onSort,
    onResetSort,
    onEdit,
    onDelete,
    onPageSizeChange,
    onPreviousPage,
    onNextPage,
  });

  assert.match(
    screen.getByText(/registros en cuarentena/i).textContent ?? "",
    /ocultos en Tickets y Dashboard/,
  );
  const searchInput = screen.getByRole("textbox", {
    name: "Buscar registros administrativos",
  });
  const recordsRegion = screen.getByRole("region", {
    name: "Registros administrativos",
  });
  assert.ok(recordsRegion.classList.contains("overflow-x-auto"));
  fireEvent.change(searchInput, { target: { value: "liquidación" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Ordenar por Fecha y hora" }),
    { shiftKey: true },
  );

  const browser = userEvent.setup();
  await browser.click(screen.getByRole("button", { name: "Nuevo registro" }));
  await browser.click(
    screen.getByRole("button", { name: "Restablecer orden" }),
  );
  await browser.click(
    screen.getByRole("button", { name: "Editar ticket #41" }),
  );
  await browser.click(
    screen.getByRole("button", { name: "Eliminar ticket #41" }),
  );
  await browser.click(screen.getByRole("button", { name: "Anterior" }));
  await browser.click(screen.getByRole("button", { name: "Siguiente" }));
  await browser.click(
    screen.getByRole("combobox", { name: "Registros por página" }),
  );
  await browser.click(screen.getByRole("option", { name: "25" }));

  assert.equal(onSearchChange.mock.calls[0]?.arguments[0], "liquidación");
  assert.equal(onSort.mock.calls[0]?.arguments[0], TicketSortBy.fecha_creacion);
  assert.equal(onSort.mock.calls[0]?.arguments[1], true);
  assert.equal(onCreate.mock.callCount(), 1);
  assert.equal(onResetSort.mock.callCount(), 1);
  assert.equal(onEdit.mock.calls[0]?.arguments[0], ticket);
  assert.equal(onDelete.mock.calls[0]?.arguments[0], ticket);
  assert.equal(onPreviousPage.mock.callCount(), 1);
  assert.equal(onNextPage.mock.callCount(), 1);
  assert.equal(onPageSizeChange.mock.calls[0]?.arguments[0], 25);
  assert.equal(
    screen.getByRole("link", { name: "Abrir ticket #41" }).getAttribute("href"),
    "/admin/tickets/41",
  );
});

test("conserva la precedencia de carga, error y estado vacío", (t) => {
  t.after(cleanup);
  const view = renderPanel({
    ...defaultProps,
    tickets: [],
    isLoading: true,
    errorMessage: "Error que no debe mostrarse durante la carga",
  });

  assert.equal(screen.getAllByRole("row").length, 9);
  assert.equal(screen.queryByText(/Error que no debe mostrarse/), null);

  view.rerenderPanel({
    ...defaultProps,
    tickets: [],
    isLoading: false,
    errorMessage: "No se pudo consultar el directorio",
  });
  assert.ok(screen.getByText("No se pudo consultar el directorio"));

  view.rerenderPanel({
    ...defaultProps,
    search: "Ana",
    tickets: [],
    isLoading: false,
    errorMessage: null,
  });
  assert.equal(
    screen.getByText(/No hay registros/).textContent,
    "No hay registros que coincidan con la búsqueda.",
  );
});

test("conserva los bloqueos de orden, edición y límites de página", (t) => {
  t.after(cleanup);
  renderPanel({
    ...defaultProps,
    isDefaultSort: true,
    areCrudActionsDisabled: true,
    page: 1,
    totalPages: 1,
  });

  for (const name of [
    "Restablecer orden",
    "Nuevo registro",
    "Editar ticket #41",
    "Eliminar ticket #41",
    "Anterior",
    "Siguiente",
  ]) {
    assert.equal(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      true,
    );
  }

  assert.equal(
    screen.getByRole("link", { name: "Abrir ticket #41" }).getAttribute("href"),
    "/admin/tickets/41",
  );
});
