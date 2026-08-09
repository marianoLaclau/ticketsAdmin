import assert from "node:assert/strict";
import test from "node:test";
import type { Ticket } from "@workspace/api-client-react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminTicketDeleteDialog } from "../src/features/admin-tickets/AdminTicketDeleteDialog.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const ticket = {
  id: 41,
  version: 3,
  conversation_id: "conversation-41",
  hora: "10:25",
  nombre: "Ana",
  apellido: "Pérez",
  motivo: "Consulta por liquidación",
  estado: "en_proceso",
  prioridad: "alta",
} as Ticket;

test("bloquea la confirmación pendiente sin impedir cancelar", async (t) => {
  t.after(cleanup);
  const onDismiss = t.mock.fn();
  const onConfirm = t.mock.fn();
  const browser = userEvent.setup();

  render(
    <AdminTicketDeleteDialog
      ticket={ticket}
      isDeleting
      isConfirmDisabled
      onDismiss={onDismiss}
      onConfirm={onConfirm}
    />,
  );

  const confirm = screen.getByRole("button", { name: "Eliminando..." });
  const cancel = screen.getByRole("button", { name: "Cancelar" });
  assert.equal((confirm as HTMLButtonElement).disabled, true);
  assert.equal((cancel as HTMLButtonElement).disabled, false);

  await browser.click(cancel);
  assert.equal(onDismiss.mock.callCount(), 1);
  assert.equal(onConfirm.mock.callCount(), 0);
});
