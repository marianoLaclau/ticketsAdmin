import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsersPagination } from "../src/features/admin-directory/AdminUsersPagination.tsx";
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

const defaultProps: ComponentProps<typeof AdminUsersPagination> = {
  page: 2,
  pageSize: 10,
  total: 37,
  totalPages: 4,
  isLoading: false,
  isError: false,
  hasResults: true,
  onPageSizeChange: () => undefined,
  onPreviousPage: () => undefined,
  onNextPage: () => undefined,
};

test("presenta el resumen listo y delega tamaño y navegación", async (t) => {
  t.after(cleanup);
  const onPageSizeChange = t.mock.fn();
  const onPreviousPage = t.mock.fn();
  const onNextPage = t.mock.fn();

  render(
    <AdminUsersPagination
      {...defaultProps}
      onPageSizeChange={onPageSizeChange}
      onPreviousPage={onPreviousPage}
      onNextPage={onNextPage}
    />,
  );

  const summary = screen.getByRole("status");
  assert.equal(summary.textContent, "37 registros — página 2 de 4");
  assert.equal(summary.getAttribute("aria-live"), "polite");
  assert.equal(summary.getAttribute("aria-atomic"), "true");

  const browser = userEvent.setup();
  await browser.click(
    screen.getByRole("combobox", {
      name: "Cantidad de usuarios por página",
    }),
  );
  await browser.click(screen.getByRole("option", { name: "25" }));
  await browser.click(screen.getByRole("button", { name: "Anterior" }));
  await browser.click(screen.getByRole("button", { name: "Siguiente" }));

  assert.equal(onPageSizeChange.mock.callCount(), 1);
  assert.equal(onPageSizeChange.mock.calls[0]?.arguments[0], 25);
  assert.equal(onPreviousPage.mock.callCount(), 1);
  assert.equal(onNextPage.mock.callCount(), 1);
});

test("bloquea únicamente la dirección que excede los límites", (t) => {
  t.after(cleanup);
  const view = render(<AdminUsersPagination {...defaultProps} page={1} />);

  const previous = screen.getByRole("button", {
    name: "Anterior",
  }) as HTMLButtonElement;
  const next = screen.getByRole("button", {
    name: "Siguiente",
  }) as HTMLButtonElement;
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, false);

  view.rerender(
    <AdminUsersPagination {...defaultProps} page={4} totalPages={4} />,
  );
  assert.equal(previous.disabled, false);
  assert.equal(next.disabled, true);
});

test("conserva los mensajes transitorios fuera de la región viva", (t) => {
  t.after(cleanup);
  const view = render(
    <AdminUsersPagination {...defaultProps} isLoading hasResults={false} />,
  );

  const loading = screen.getByText("Cargando registros...");
  assert.equal(loading.getAttribute("role"), null);
  assert.equal(loading.getAttribute("aria-live"), null);
  assert.equal(loading.getAttribute("aria-atomic"), null);

  view.rerender(
    <AdminUsersPagination {...defaultProps} isError hasResults={false} />,
  );
  const error = screen.getByText("No se pudieron cargar los registros.");
  assert.equal(error.getAttribute("role"), null);
  assert.equal(error.getAttribute("aria-live"), null);
  assert.equal(error.getAttribute("aria-atomic"), null);
});
