import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AdminRoleFormDialog } from "../src/features/admin-directory/AdminRoleFormDialog.tsx";
import {
  createEmptyAdminRoleForm,
  type AdminRoleFormState,
} from "../src/features/admin-directory/model.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

test("mantiene controlado el formulario de alta y delega sus acciones", async (t) => {
  t.after(cleanup);
  const onOpenChange = t.mock.fn();
  const onSave = t.mock.fn();

  function Harness() {
    const [form, setForm] = useState(createEmptyAdminRoleForm);

    return (
      <AdminRoleFormDialog
        open
        isEditing={false}
        isSystemRole={false}
        form={form}
        isSaving={false}
        onOpenChange={onOpenChange}
        onFormChange={setForm}
        onSave={onSave}
      />
    );
  }

  render(<Harness />);

  assert.match(screen.getByRole("dialog").textContent ?? "", /Nuevo rol/);
  const nameInput = screen.getByLabelText("Nombre *") as HTMLInputElement;
  const descriptionInput = screen.getByLabelText(
    "Descripción",
  ) as HTMLTextAreaElement;
  const activeSwitch = screen.getByRole("switch", {
    name: "Rol activo",
  });

  assert.equal(nameInput.maxLength, 100);
  assert.equal(descriptionInput.maxLength, 500);
  assert.equal(descriptionInput.rows, 4);
  assert.equal(activeSwitch.getAttribute("aria-checked"), "true");
  assert.match(
    screen.getByRole("dialog").textContent ?? "",
    /Los roles inactivos no permiten iniciar ni conservar una sesión/,
  );

  fireEvent.change(nameInput, { target: { value: "Auditor" } });
  fireEvent.change(descriptionInput, {
    target: { value: "Acceso de auditoría" },
  });
  await userEvent.setup().click(activeSwitch);

  assert.equal(nameInput.value, "Auditor");
  assert.equal(descriptionInput.value, "Acceso de auditoría");
  assert.equal(activeSwitch.getAttribute("aria-checked"), "false");

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await user.click(screen.getByRole("button", { name: "Guardar rol" }));

  assert.equal(onOpenChange.mock.callCount(), 1);
  assert.equal(onOpenChange.mock.calls[0]?.arguments[0], false);
  assert.equal(onSave.mock.callCount(), 1);
});

test("protege nombre y estado del rol de sistema sin bloquear su descripción", (t) => {
  t.after(cleanup);
  const initialForm: AdminRoleFormState = {
    nombre: "SysAdmin",
    descripcion: "Control total",
    activo: true,
  };

  function Harness() {
    const [form, setForm] = useState(initialForm);

    return (
      <AdminRoleFormDialog
        open
        isEditing
        isSystemRole
        form={form}
        isSaving
        onOpenChange={() => undefined}
        onFormChange={setForm}
        onSave={() => undefined}
      />
    );
  }

  render(<Harness />);

  const dialog = screen.getByRole("dialog");
  const nameInput = screen.getByLabelText("Nombre *") as HTMLInputElement;
  const descriptionInput = screen.getByLabelText(
    "Descripción",
  ) as HTMLTextAreaElement;
  const activeSwitch = screen.getByRole("switch", {
    name: "Rol activo",
  }) as HTMLButtonElement;
  const cancelButton = screen.getByRole("button", {
    name: "Cancelar",
  }) as HTMLButtonElement;
  const saveButton = screen.getByRole("button", {
    name: "Guardar rol",
  }) as HTMLButtonElement;

  assert.match(dialog.textContent ?? "", /Editar rol/);
  assert.equal(nameInput.disabled, true);
  assert.equal(activeSwitch.disabled, true);
  assert.equal(descriptionInput.disabled, false);
  assert.equal(cancelButton.disabled, false);
  assert.equal(saveButton.disabled, true);
  assert.ok(saveButton.querySelector("svg.animate-spin"));
  assert.match(
    dialog.textContent ?? "",
    /El nombre de un rol del sistema es parte de la política de acceso y no se puede modificar/,
  );
  assert.match(
    dialog.textContent ?? "",
    /Los roles del sistema deben permanecer activos/,
  );

  fireEvent.change(descriptionInput, {
    target: { value: "Descripción actualizada" },
  });
  assert.equal(descriptionInput.value, "Descripción actualizada");
});
