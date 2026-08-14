import assert from "node:assert/strict";
import test from "node:test";
import { useState } from "react";
import type { Ticket, TicketUpdate } from "@workspace/api-client-react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketDataEditDialog } from "../src/features/ticket-detail/TicketDataEditDialog.tsx";
import { AdminTicketFormDialog } from "../src/features/admin-tickets/AdminTicketFormDialog.tsx";
import type { AdminTicketForm } from "../src/features/admin-tickets/admin-ticket-form.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const adminForm: AdminTicketForm = {
  conversation_id: "manual-41",
  hora: "10:25",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "1160000041",
  dni: "30111222",
  empresa: "GSB",
  email: "ana@example.test",
  motivo: "Consulta por liquidación",
  resumen: "Solicita revisar su liquidación final.",
  notas: "",
  audio_url: "",
  estado: "nuevo",
  prioridad: "media",
};

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
  prioridad: "media",
  asignado_usuario_id: 7,
  asignado_a: "Operadora Uno",
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-08T13:25:00.000Z",
  fecha_limite: "2026-08-11T13:25:00.000Z",
  fecha_resolucion: null,
  progreso: 50,
};

test("el formulario administrativo asocia etiquetas y admite guardar con Enter", async (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn();

  function Harness() {
    const [form, setForm] = useState(adminForm);
    return (
      <AdminTicketFormDialog
        open
        editingId={null}
        form={form}
        isSaving={false}
        isReloading={false}
        hasVersionConflict={false}
        onOpenChange={() => undefined}
        onFormChange={setForm}
        onReloadLatest={() => undefined}
        onSave={onSave}
      />
    );
  }

  render(<Harness />);
  const browser = userEvent.setup();
  const conversationId = screen.getByRole("textbox", {
    name: "Conversation ID",
  });
  const reason = screen.getByRole("textbox", { name: "Motivo" });
  const optionalEmail = screen.getByRole("textbox", { name: "Email" });

  assert.equal((conversationId as HTMLInputElement).required, true);
  assert.equal((reason as HTMLInputElement).required, true);
  assert.equal((optionalEmail as HTMLInputElement).required, false);
  assert.equal(
    conversationId.getAttribute("aria-describedby"),
    "admin-ticket-required-fields",
  );
  assert.match(
    document.getElementById("admin-ticket-required-fields")?.textContent ?? "",
    /obligatorios/i,
  );
  assert.ok(screen.getByRole("combobox", { name: "Estado" }));
  assert.ok(screen.getByRole("combobox", { name: "Prioridad" }));

  const cancel = screen.getByRole("button", { name: "Cancelar" });
  const save = screen.getByRole("button", { name: "Guardar" });
  assert.equal(cancel.getAttribute("type"), "button");
  assert.equal(save.getAttribute("type"), "submit");

  await browser.click(screen.getByRole("textbox", { name: "Nombre" }));
  await browser.keyboard("{Enter}");
  assert.equal(onSave.mock.callCount(), 1);
});

test("el editor anuncia errores independientes, enfoca el primero y envía con Enter", async (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn<(update: TicketUpdate) => void>();

  render(
    <TicketDataEditDialog
      ticket={ticket}
      open
      onOpenChange={() => undefined}
      isSaving={false}
      hasVersionConflict={false}
      isReloadingConflict={false}
      onReloadLatest={async () => ticket}
      onVersionConflictResolved={() => undefined}
      onSave={onSave}
    />,
  );
  const browser = userEvent.setup();
  const email = screen.getByRole("textbox", { name: "Email" });
  const reason = screen.getByRole("textbox", { name: "Motivo" });

  await browser.clear(email);
  await browser.type(email, "email-invalido");
  await browser.clear(reason);
  await browser.click(screen.getByRole("button", { name: "Guardar datos" }));

  assert.ok(screen.getByText(/Ingresá un email válido/));
  assert.ok(screen.getByText("El motivo no puede quedar vacío."));
  assert.equal(screen.getAllByRole("alert").length, 2);
  assert.equal(document.activeElement, email);
  assert.equal(email.getAttribute("aria-invalid"), "true");
  assert.equal(
    email.getAttribute("aria-describedby"),
    "ticket-data-email-error",
  );
  assert.equal(reason.getAttribute("aria-invalid"), "true");
  assert.equal(
    reason.getAttribute("aria-describedby"),
    "ticket-data-motivo-error",
  );
  assert.equal((reason as HTMLInputElement).required, true);
  assert.equal(onSave.mock.callCount(), 0);

  await browser.clear(email);
  await browser.type(email, "ana.actualizada@example.test");
  assert.equal(screen.queryByText(/Ingresá un email válido/), null);
  assert.ok(screen.getByText("El motivo no puede quedar vacío."));

  await browser.click(screen.getByRole("button", { name: "Guardar datos" }));
  assert.equal(document.activeElement, reason);

  await browser.type(reason, "Motivo corregido{Enter}");
  assert.equal(onSave.mock.callCount(), 1);
  assert.deepEqual(onSave.mock.calls[0]?.arguments[0], {
    email: "ana.actualizada@example.test",
    motivo: "Motivo corregido",
    expected_version: 3,
  });
});
