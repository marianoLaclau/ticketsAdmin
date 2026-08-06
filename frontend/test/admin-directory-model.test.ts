import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminRole, AdminUser } from '@workspace/api-client-react';
import {
  createAdminRoleForm,
  createAdminUserForm,
  createEmptyAdminRoleForm,
  createEmptyAdminUserForm,
  createNewAdminUserForm,
  createRoleNameMap,
  filterAdminRoles,
} from '../src/features/admin-directory/model.ts';

const roles = [
  { id: 1, nombre: 'Inactivo primero', descripcion: null, activo: false },
  { id: 2, nombre: 'Operación', descripcion: 'Atención diaria', activo: true },
  { id: 3, nombre: 'Legal', descripcion: 'Gestión judicial', activo: true },
] as AdminRole[];

test('crea formularios vacíos y elige el primer rol activo para un alta', () => {
  assert.deepEqual(createEmptyAdminUserForm(), {
    nombre: '',
    apellido: '',
    username: '',
    password: '',
    passwordRepetida: '',
    email: '',
    roleId: '',
    activo: true,
  });
  assert.equal(createNewAdminUserForm(roles).roleId, '2');
  assert.equal(createNewAdminUserForm(roles.filter((role) => !role.activo)).roleId, '');
  assert.deepEqual(createEmptyAdminRoleForm(), {
    nombre: '',
    descripcion: '',
    activo: true,
  });
});

test('convierte usuarios y roles existentes sin inventar opcionales ni contraseñas', () => {
  const user = {
    id: 8,
    nombre: 'Ana',
    apellido: null,
    username: null,
    email: 'ana@example.test',
    role_id: 1,
    activo: false,
  } as AdminUser;

  assert.deepEqual(createAdminUserForm(user), {
    nombre: 'Ana',
    apellido: '',
    username: '',
    password: '',
    passwordRepetida: '',
    email: 'ana@example.test',
    roleId: '1',
    activo: false,
  });
  assert.deepEqual(createAdminRoleForm(roles[0]!), {
    nombre: 'Inactivo primero',
    descripcion: '',
    activo: false,
  });
});

test('resuelve nombres por id y filtra roles por texto, descripción y estado', () => {
  const names = createRoleNameMap(roles);
  assert.equal(names.get(2), 'Operación');
  assert.equal(names.get(99), undefined);

  assert.deepEqual(
    filterAdminRoles(roles, '  JUDICIAL ', '_all').map((role) => role.id),
    [3],
  );
  assert.deepEqual(
    filterAdminRoles(roles, 'operación', 'active').map((role) => role.id),
    [2],
  );
  assert.deepEqual(
    filterAdminRoles(roles, '', 'inactive').map((role) => role.id),
    [1],
  );
});
