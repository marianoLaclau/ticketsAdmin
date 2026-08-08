import assert from "node:assert/strict";
import test from "node:test";
import type { AdminRole } from "@workspace/api-client-react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table, TableBody } from "../src/components/ui/table.tsx";
import { AdminRoleTableRow } from "../src/features/admin-directory/AdminRoleTableRow.tsx";
import { formatDate } from "../src/lib/utils-tickets.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

const activeRole: AdminRole = {
  id: 7,
  nombre: "Auditor",
  descripcion: "Consulta de operaciones",
  activo: true,
  fecha_creacion: "2026-08-01T12:00:00.000Z",
  fecha_actualizacion: "2026-08-02T15:30:00.000Z",
};

interface RenderRowOptions {
  role?: AdminRole;
  isSystemRole?: boolean;
  isMutationPending?: boolean;
  onToggle?: (role: AdminRole) => void;
  onEdit?: (role: AdminRole) => void;
  onDelete?: (role: AdminRole) => void;
}

function renderRow({
  role = activeRole,
  isSystemRole = false,
  isMutationPending = false,
  onToggle = () => undefined,
  onEdit = () => undefined,
  onDelete = () => undefined,
}: RenderRowOptions = {}) {
  return render(
    <Table>
      <TableBody>
        <AdminRoleTableRow
          role={role}
          isSystemRole={isSystemRole}
          isMutationPending={isMutationPending}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </TableBody>
    </Table>,
  );
}

test("presenta un rol normal y delega cada acción una sola vez", async (t) => {
  t.after(cleanup);
  const onToggle = t.mock.fn();
  const onEdit = t.mock.fn();
  const onDelete = t.mock.fn();

  renderRow({ onToggle, onEdit, onDelete });

  const cells = screen
    .getByRole("row")
    .querySelectorAll<HTMLTableCellElement>("td");
  assert.equal(cells.length, 6);
  assert.equal(cells.item(0).textContent, "7");
  assert.equal(cells.item(1).textContent, "Auditor");
  assert.equal(cells.item(2).textContent, "Consulta de operaciones");
  assert.equal(cells.item(3).textContent, "Activo");
  assert.equal(
    cells.item(4).textContent,
    formatDate(activeRole.fecha_actualizacion),
  );
  assert.equal(within(cells.item(1)).queryByText("Sistema protegido"), null);

  const user = userEvent.setup();
  await user.click(
    screen.getByRole("switch", { name: "Desactivar rol Auditor" }),
  );
  await user.click(screen.getByRole("button", { name: "Editar rol Auditor" }));
  await user.click(
    screen.getByRole("button", { name: "Eliminar rol Auditor" }),
  );

  assert.equal(onToggle.mock.callCount(), 1);
  assert.equal(onEdit.mock.callCount(), 1);
  assert.equal(onDelete.mock.callCount(), 1);
  assert.equal(onToggle.mock.calls[0]?.arguments[0], activeRole);
  assert.equal(onEdit.mock.calls[0]?.arguments[0], activeRole);
  assert.equal(onDelete.mock.calls[0]?.arguments[0], activeRole);
});

test("mantiene el fallback y bloquea todas las acciones durante una mutación", (t) => {
  t.after(cleanup);
  const inactiveRole: AdminRole = {
    ...activeRole,
    descripcion: "",
    activo: false,
  };

  renderRow({ role: inactiveRole, isMutationPending: true });

  const cells = screen
    .getByRole("row")
    .querySelectorAll<HTMLTableCellElement>("td");
  assert.equal(cells.item(2).textContent, "—");
  assert.equal(cells.item(3).textContent, "Inactivo");

  const statusToggle = screen.getByRole("switch", {
    name: "Activar rol Auditor",
  }) as HTMLButtonElement;
  const editButton = screen.getByRole("button", {
    name: "Editar rol Auditor",
  }) as HTMLButtonElement;
  const deleteButton = screen.getByRole("button", {
    name: "Eliminar rol Auditor",
  }) as HTMLButtonElement;

  assert.equal(statusToggle.disabled, true);
  assert.equal(editButton.disabled, true);
  assert.equal(deleteButton.disabled, true);
});

test("protege el rol de sistema pero conserva disponible su edición", async (t) => {
  t.after(cleanup);
  const systemRole: AdminRole = { ...activeRole, nombre: "SysAdmin" };
  const onToggle = t.mock.fn();
  const onEdit = t.mock.fn();
  const onDelete = t.mock.fn();

  renderRow({
    role: systemRole,
    isSystemRole: true,
    onToggle,
    onEdit,
    onDelete,
  });

  assert.ok(screen.getByText("Sistema protegido"));
  const statusToggle = screen.getByRole("switch", {
    name: "SysAdmin: rol del sistema protegido, permanece activo",
  }) as HTMLButtonElement;
  const editButton = screen.getByRole("button", {
    name: "Editar rol SysAdmin",
  }) as HTMLButtonElement;
  const deleteButton = screen.getByRole("button", {
    name: "SysAdmin: rol del sistema protegido, no se puede eliminar",
  }) as HTMLButtonElement;

  assert.equal(statusToggle.disabled, true);
  assert.equal(
    statusToggle.title,
    "Los roles del sistema deben permanecer activos",
  );
  assert.equal(editButton.disabled, false);
  assert.equal(deleteButton.disabled, true);
  assert.equal(
    deleteButton.title,
    "Los roles del sistema no se pueden eliminar",
  );

  await userEvent.setup().click(editButton);

  assert.equal(onEdit.mock.callCount(), 1);
  assert.equal(onEdit.mock.calls[0]?.arguments[0], systemRole);
  assert.equal(onToggle.mock.callCount(), 0);
  assert.equal(onDelete.mock.callCount(), 0);
});
