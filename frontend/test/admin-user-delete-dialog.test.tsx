import assert from "node:assert/strict";
import test from "node:test";
import type { AdminUser } from "@workspace/api-client-react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUserDeleteDialog } from "../src/features/admin-directory/AdminUserDeleteDialog.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const user: AdminUser = {
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

test("solo habilita el borrado con el nombre de usuario exacto", async (t) => {
  t.after(cleanup);
  const onConfirm = t.mock.fn();

  render(
    <AdminUserDeleteDialog
      user={user}
      isPending={false}
      onOpenChange={() => undefined}
      onConfirm={onConfirm}
    />,
  );

  const boton = screen.getByRole("button", { name: "Eliminar usuario" });
  const campo = screen.getByLabelText(/para confirmar/i);

  // Sin escribir nada, el borrado está bloqueado.
  assert.equal((boton as HTMLButtonElement).disabled, true);

  // Un nombre parecido tampoco alcanza.
  fireEvent.change(campo, { target: { value: "ana.perez2" } });
  assert.equal((boton as HTMLButtonElement).disabled, true);
  assert.equal(campo.getAttribute("aria-invalid"), "true");

  // El nombre exacto lo habilita y entrega el username al confirmar.
  fireEvent.change(campo, { target: { value: "ana.perez" } });
  assert.equal((boton as HTMLButtonElement).disabled, false);

  await userEvent.setup().click(boton);
  assert.equal(onConfirm.mock.callCount(), 1);
  assert.equal(onConfirm.mock.calls[0]?.arguments[0], "ana.perez");
});

test("ofrece la desactivación como alternativa reversible", (t) => {
  t.after(cleanup);

  render(
    <AdminUserDeleteDialog
      user={user}
      isPending={false}
      onOpenChange={() => undefined}
      onConfirm={() => undefined}
    />,
  );

  const dialogo = screen.getByRole("alertdialog");
  assert.match(dialogo.textContent ?? "", /no se puede deshacer/i);
  assert.match(dialogo.textContent ?? "", /desactivá la cuenta/i);
  // El historial no se pierde: hay que decirlo antes de un borrado físico.
  assert.match(dialogo.textContent ?? "", /historial se conserva/i);
});

test("bloquea la confirmación mientras la eliminación está en curso", (t) => {
  t.after(cleanup);

  render(
    <AdminUserDeleteDialog
      user={user}
      isPending
      onOpenChange={() => undefined}
      onConfirm={() => undefined}
    />,
  );

  const campo = screen.getByLabelText(/para confirmar/i);
  fireEvent.change(campo, { target: { value: "ana.perez" } });
  assert.equal(
    (
      screen.getByRole("button", {
        name: /Eliminar usuario/,
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
