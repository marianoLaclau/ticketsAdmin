import assert from "node:assert/strict";
import test from "node:test";
import type { AdminRole, AdminUser } from "@workspace/api-client-react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AdminUserFormDialog } from "../src/features/admin-directory/AdminUserFormDialog.tsx";
import { AdminUserPasswordDialog } from "../src/features/admin-directory/AdminUserPasswordDialog.tsx";
import {
  createAdminUserForm,
  createNewAdminUserForm,
} from "../src/features/admin-directory/model.ts";
import { installDomEventRealm } from "./dom-event-realm.ts";

// Node expone su propia implementación de Event. Radix debe despachar eventos
// creados por el mismo realm de JSDOM que recibe el portal del diálogo.
installDomEventRealm();

const roles: AdminRole[] = [
  {
    id: 1,
    nombre: "Operador",
    descripcion: "Atención diaria",
    activo: true,
    fecha_creacion: "2026-08-01T12:00:00.000Z",
    fecha_actualizacion: "2026-08-01T12:00:00.000Z",
  },
  {
    id: 2,
    nombre: "Rol legado",
    descripcion: null,
    activo: false,
    fecha_creacion: "2026-08-01T12:00:00.000Z",
    fecha_actualizacion: "2026-08-01T12:00:00.000Z",
  },
];

const existingUser: AdminUser = {
  id: 7,
  nombre: "Ana",
  apellido: "Pérez",
  username: "ana.perez",
  email: "ana@example.test",
  role_id: 2,
  activo: true,
  debe_cambiar_password: false,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-01T12:00:00.000Z",
};

test("mantiene controlado el formulario de alta y presenta sus validaciones", async (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn();
  const onOpenChange = t.mock.fn();

  function Harness() {
    const [form, setForm] = useState(() => createNewAdminUserForm(roles));

    return (
      <AdminUserFormDialog
        open
        isEditing={false}
        roles={roles}
        form={form}
        isSaving={false}
        onOpenChange={onOpenChange}
        onFormChange={setForm}
        onSave={onSave}
      />
    );
  }

  render(<Harness />);

  assert.match(screen.getByRole("dialog").textContent ?? "", /Nuevo usuario/);
  assert.equal(
    screen.getByLabelText("Nombre *").getAttribute("maxlength"),
    "100",
  );
  assert.equal(
    screen.getByLabelText("Contraseña temporal *").getAttribute("type"),
    "password",
  );
  assert.equal(
    (screen.getByLabelText("Nombre *") as HTMLInputElement).required,
    true,
  );
  assert.equal(
    (screen.getByLabelText("Nombre de usuario *") as HTMLInputElement).required,
    true,
  );
  assert.equal(
    (screen.getByLabelText("Email *") as HTMLInputElement).required,
    true,
  );
  assert.equal(
    screen.getByRole("combobox", { name: "Rol *" }).textContent,
    "Operador",
  );

  const browser = userEvent.setup();
  const saveButton = screen.getByRole("button", { name: "Guardar usuario" });
  assert.equal(saveButton.getAttribute("type"), "submit");
  assert.equal(
    screen.getByRole("button", { name: "Cancelar" }).getAttribute("type"),
    "button",
  );
  assert.ok(
    screen.getByRole("button", { name: "Mostrar contraseña temporal" }),
  );
  assert.ok(
    screen.getByRole("button", {
      name: "Mostrar repetición de la contraseña temporal",
    }),
  );
  await browser.click(saveButton);
  assert.equal(document.activeElement, screen.getByLabelText("Nombre *"));
  assert.match(screen.getAllByRole("alert")[0]?.textContent ?? "", /nombre/i);
  assert.equal(onSave.mock.callCount(), 0);

  fireEvent.change(screen.getByLabelText("Nombre *"), {
    target: { value: "María" },
  });
  fireEvent.change(screen.getByLabelText("Nombre de usuario *"), {
    target: { value: "maria.operadora" },
  });
  fireEvent.change(screen.getByLabelText("Email *"), {
    target: { value: "maria@example.test" },
  });
  assert.equal(
    (screen.getByLabelText("Nombre *") as HTMLInputElement).value,
    "María",
  );

  fireEvent.change(screen.getByLabelText("Contraseña temporal *"), {
    target: { value: "corta" },
  });
  assert.match(
    screen.getAllByRole("alert")[0]?.textContent ?? "",
    /al menos 16/i,
  );
  assert.equal(
    screen.getByLabelText("Contraseña temporal *").getAttribute("aria-invalid"),
    "true",
  );

  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal *"), {
    target: { value: "distinta" },
  });
  assert.match(
    screen.getAllByRole("alert")[1]?.textContent ?? "",
    /no coinciden/i,
  );

  const validPassword = "Frase interna muy segura 2026";
  fireEvent.change(screen.getByLabelText("Contraseña temporal *"), {
    target: { value: validPassword },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal *"), {
    target: { value: validPassword },
  });

  fireEvent.change(screen.getByLabelText("Email *"), {
    target: { value: "email-invalido" },
  });
  await browser.click(saveButton);
  assert.match(screen.getByRole("alert").textContent ?? "", /email válido/i);
  assert.equal(document.activeElement, screen.getByLabelText("Email *"));
  assert.equal(onSave.mock.callCount(), 0);
  fireEvent.change(screen.getByLabelText("Email *"), {
    target: { value: "maria@example.test" },
  });

  await browser.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.equal(onOpenChange.mock.callCount(), 1);
  assert.equal(onOpenChange.mock.calls[0]?.arguments[0], false);

  await browser.click(screen.getByLabelText("Email *"));
  await browser.keyboard("{Enter}");
  assert.equal(onSave.mock.callCount(), 1);
});

test("enfoca el selector y explica cuando falta un rol", async (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn();
  const validPassword = "Frase interna muy segura 2026";

  function Harness() {
    const [form, setForm] = useState(() => ({
      ...createNewAdminUserForm([]),
      nombre: "María",
      username: "maria.operadora",
      email: "maria@example.test",
      password: validPassword,
      passwordRepetida: validPassword,
    }));

    return (
      <AdminUserFormDialog
        open
        isEditing={false}
        roles={[]}
        form={form}
        isSaving={false}
        onOpenChange={() => undefined}
        onFormChange={setForm}
        onSave={onSave}
      />
    );
  }

  render(<Harness />);
  const roleSelector = screen.getByRole("combobox", { name: "Rol *" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Guardar usuario" }));

  assert.equal(document.activeElement, roleSelector);
  assert.equal(roleSelector.getAttribute("aria-invalid"), "true");
  assert.equal(
    roleSelector.getAttribute("aria-describedby"),
    "user-role-error",
  );
  assert.match(
    screen.getByRole("alert").textContent ?? "",
    /Seleccioná un rol/,
  );
  assert.equal(onSave.mock.callCount(), 0);
});

test("el modo edición conserva el rol inactivo y no expone contraseñas", (t) => {
  t.after(cleanup);

  function Harness() {
    const [form, setForm] = useState(() => createAdminUserForm(existingUser));

    return (
      <AdminUserFormDialog
        open
        isEditing
        roles={roles}
        form={form}
        isSaving
        onOpenChange={() => undefined}
        onFormChange={setForm}
        onSave={() => undefined}
      />
    );
  }

  render(<Harness />);

  assert.match(screen.getByRole("dialog").textContent ?? "", /Editar usuario/);
  assert.equal(screen.queryByLabelText("Contraseña temporal *"), null);
  assert.equal(screen.queryByText(/Credenciales iniciales/), null);
  assert.equal(
    screen.getByRole("combobox", { name: "Rol *" }).textContent,
    "Rol legado (inactivo)",
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Guardar usuario" })
      .hasAttribute("disabled"),
    true,
  );
});

test("valida y delega el reset de contraseña temporal", async (t) => {
  t.after(cleanup);
  const onSave = t.mock.fn();
  const onClose = t.mock.fn();

  function Harness({ isSaving = false }: { isSaving?: boolean }) {
    const [password, setPassword] = useState("");
    const [repeatedPassword, setRepeatedPassword] = useState("");

    return (
      <AdminUserPasswordDialog
        user={existingUser}
        password={password}
        repeatedPassword={repeatedPassword}
        isSaving={isSaving}
        onPasswordChange={setPassword}
        onRepeatedPasswordChange={setRepeatedPassword}
        onClose={onClose}
        onSave={onSave}
      />
    );
  }

  const view = render(<Harness />);

  assert.match(
    screen.getByRole("dialog").textContent ?? "",
    /Ana Pérez \(ana@example\.test\)\. Al guardar/,
  );
  const saveButton = screen.getByRole("button", {
    name: "Asignar contraseña",
  });
  assert.equal(saveButton.hasAttribute("disabled"), false);
  assert.equal(saveButton.getAttribute("type"), "submit");
  assert.equal(
    screen.getByRole("button", { name: "Cancelar" }).getAttribute("type"),
    "button",
  );
  assert.ok(
    screen.getByRole("button", {
      name: "Mostrar contraseña temporal nueva",
    }),
  );
  assert.ok(
    screen.getByRole("button", {
      name: "Mostrar repetición de la contraseña temporal",
    }),
  );

  const browser = userEvent.setup();
  await browser.click(saveButton);
  assert.equal(
    document.activeElement,
    screen.getByLabelText("Nueva contraseña temporal"),
  );
  assert.equal(screen.getAllByRole("alert").length, 2);
  assert.equal(onSave.mock.callCount(), 0);

  fireEvent.change(screen.getByLabelText("Nueva contraseña temporal"), {
    target: { value: "corta" },
  });
  assert.match(screen.getByRole("alert").textContent ?? "", /al menos 16/i);

  const validPassword = "Frase interna muy segura 2026";
  fireEvent.change(screen.getByLabelText("Nueva contraseña temporal"), {
    target: { value: validPassword },
  });
  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal"), {
    target: { value: "Frase diferente muy segura 2026" },
  });
  assert.match(screen.getByRole("alert").textContent ?? "", /no coinciden/i);
  assert.equal(saveButton.hasAttribute("disabled"), false);

  fireEvent.change(screen.getByLabelText("Repetir contraseña temporal"), {
    target: { value: validPassword },
  });
  assert.equal(saveButton.hasAttribute("disabled"), false);

  await browser.click(screen.getByLabelText("Repetir contraseña temporal"));
  await browser.keyboard("{Enter}");
  assert.equal(onSave.mock.callCount(), 1);

  view.rerender(<Harness isSaving />);
  assert.equal(saveButton.hasAttribute("disabled"), true);

  await browser.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.equal(onClose.mock.callCount(), 1);
});
