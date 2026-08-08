import assert from "node:assert/strict";
import test from "node:test";
import type { AdminUser } from "@workspace/api-client-react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table, TableBody } from "../src/components/ui/table.tsx";
import { AdminUserTableRow } from "../src/features/admin-directory/AdminUserTableRow.tsx";
import { formatDate } from "../src/lib/utils-tickets.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const activeUser: AdminUser = {
  id: 17,
  nombre: "Ana",
  apellido: "Pérez",
  username: "ana.perez",
  email: "ana@example.test",
  role_id: 3,
  activo: true,
  debe_cambiar_password: true,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-02T15:30:00.000Z",
};

interface RenderRowOptions {
  user?: AdminUser;
  roleName?: string;
  isStatusToggleDisabled?: boolean;
  isEditDisabled?: boolean;
  isPasswordResetDisabled?: boolean;
  onToggle?: (user: AdminUser) => void;
  onEdit?: (user: AdminUser) => void;
  onResetPassword?: (user: AdminUser) => void;
}

function renderRow({
  user = activeUser,
  roleName,
  isStatusToggleDisabled = false,
  isEditDisabled = false,
  isPasswordResetDisabled = false,
  onToggle = () => undefined,
  onEdit = () => undefined,
  onResetPassword = () => undefined,
}: RenderRowOptions = {}) {
  return render(
    <Table>
      <TableBody>
        <AdminUserTableRow
          user={user}
          roleName={roleName}
          isStatusToggleDisabled={isStatusToggleDisabled}
          isEditDisabled={isEditDisabled}
          isPasswordResetDisabled={isPasswordResetDisabled}
          onToggle={onToggle}
          onEdit={onEdit}
          onResetPassword={onResetPassword}
        />
      </TableBody>
    </Table>,
  );
}

test("presenta el usuario y delega las tres acciones sin alterar su identidad", async (t) => {
  t.after(cleanup);
  const onToggle = t.mock.fn();
  const onEdit = t.mock.fn();
  const onResetPassword = t.mock.fn();

  renderRow({
    roleName: "Operador",
    onToggle,
    onEdit,
    onResetPassword,
  });

  const cells = screen
    .getByRole("row")
    .querySelectorAll<HTMLTableCellElement>("td");
  assert.equal(cells.length, 8);
  assert.equal(cells.item(0).textContent, "17");
  assert.equal(cells.item(1).textContent, "Ana Pérez");
  assert.ok(within(cells.item(2)).getByText("ana.perez"));
  assert.ok(within(cells.item(2)).getByText("Cambio de contraseña pendiente"));
  assert.equal(cells.item(3).textContent, "ana@example.test");
  assert.equal(cells.item(4).textContent, "Operador");
  assert.equal(cells.item(5).textContent, "Activo");
  assert.equal(
    cells.item(6).textContent,
    formatDate(activeUser.fecha_actualizacion),
  );

  const user = userEvent.setup();
  await user.click(
    screen.getByRole("switch", { name: "Desactivar usuario ana.perez" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Editar usuario ana.perez" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Asignar contraseña temporal a ana.perez",
    }),
  );

  assert.equal(onToggle.mock.callCount(), 1);
  assert.equal(onEdit.mock.callCount(), 1);
  assert.equal(onResetPassword.mock.callCount(), 1);
  assert.equal(onToggle.mock.calls[0]?.arguments[0], activeUser);
  assert.equal(onEdit.mock.calls[0]?.arguments[0], activeUser);
  assert.equal(onResetPassword.mock.calls[0]?.arguments[0], activeUser);
});

test("mantiene los fallbacks y bloquea cada acción de forma independiente", (t) => {
  t.after(cleanup);
  const userWithoutOptionalData: AdminUser = {
    ...activeUser,
    apellido: null,
    username: null,
    activo: false,
    debe_cambiar_password: false,
    role_id: 99,
  };

  const view = renderRow({
    user: userWithoutOptionalData,
    isStatusToggleDisabled: true,
  });

  const cells = screen
    .getByRole("row")
    .querySelectorAll<HTMLTableCellElement>("td");
  assert.ok(within(cells.item(2)).getByText("—"));
  assert.equal(cells.item(4).textContent, "Rol #99");
  assert.equal(cells.item(5).textContent, "Inactivo");
  assert.equal(screen.queryByText("Cambio de contraseña pendiente"), null);

  const statusToggle = screen.getByRole("switch", {
    name: "Activar usuario ana@example.test",
  }) as HTMLButtonElement;
  const editButton = screen.getByRole("button", {
    name: "Editar usuario ana@example.test",
  }) as HTMLButtonElement;
  const passwordButton = screen.getByRole("button", {
    name: "Asignar contraseña temporal a ana@example.test",
  }) as HTMLButtonElement;

  assert.equal(statusToggle.disabled, true);
  assert.equal(editButton.disabled, false);
  assert.equal(passwordButton.disabled, false);

  view.rerender(
    <Table>
      <TableBody>
        <AdminUserTableRow
          user={userWithoutOptionalData}
          isStatusToggleDisabled={false}
          isEditDisabled
          isPasswordResetDisabled={false}
          onToggle={() => undefined}
          onEdit={() => undefined}
          onResetPassword={() => undefined}
        />
      </TableBody>
    </Table>,
  );

  assert.equal(statusToggle.disabled, false);
  assert.equal(editButton.disabled, true);
  assert.equal(passwordButton.disabled, false);

  view.rerender(
    <Table>
      <TableBody>
        <AdminUserTableRow
          user={userWithoutOptionalData}
          isStatusToggleDisabled={false}
          isEditDisabled={false}
          isPasswordResetDisabled
          onToggle={() => undefined}
          onEdit={() => undefined}
          onResetPassword={() => undefined}
        />
      </TableBody>
    </Table>,
  );

  assert.equal(statusToggle.disabled, false);
  assert.equal(editButton.disabled, false);
  assert.equal(passwordButton.disabled, true);
});
