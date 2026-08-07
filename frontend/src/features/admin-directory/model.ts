import type { AdminRole, AdminUser } from '@workspace/api-client-react';

export interface AdminUserFormState {
  nombre: string;
  apellido: string;
  username: string;
  password: string;
  passwordRepetida: string;
  email: string;
  roleId: string;
  activo: boolean;
}

export interface AdminRoleFormState {
  nombre: string;
  descripcion: string;
  activo: boolean;
}

export function createEmptyAdminUserForm(): AdminUserFormState {
  return {
    nombre: '',
    apellido: '',
    username: '',
    password: '',
    passwordRepetida: '',
    email: '',
    roleId: '',
    activo: true,
  };
}

export function createNewAdminUserForm(
  roles: readonly AdminRole[],
): AdminUserFormState {
  return {
    ...createEmptyAdminUserForm(),
    roleId: String(roles.find((role) => role.activo)?.id ?? ''),
  };
}

export function createAdminUserForm(user: AdminUser): AdminUserFormState {
  return {
    nombre: user.nombre,
    apellido: user.apellido ?? '',
    username: user.username ?? '',
    password: '',
    passwordRepetida: '',
    email: user.email,
    roleId: String(user.role_id),
    activo: user.activo,
  };
}

export function createEmptyAdminRoleForm(): AdminRoleFormState {
  return {
    nombre: '',
    descripcion: '',
    activo: true,
  };
}

export function createAdminRoleForm(role: AdminRole): AdminRoleFormState {
  return {
    nombre: role.nombre,
    descripcion: role.descripcion ?? '',
    activo: role.activo,
  };
}

export function createRoleNameMap(
  roles: readonly AdminRole[],
): ReadonlyMap<number, string> {
  return new Map(roles.map((role) => [role.id, role.nombre]));
}

export function filterAdminRoles(
  roles: readonly AdminRole[],
  rawSearch: string,
  status: string,
): AdminRole[] {
  const search = rawSearch.trim().toLocaleLowerCase('es');
  return roles.filter((role) => {
    const matchesSearch =
      !search ||
      role.nombre.toLocaleLowerCase('es').includes(search) ||
      (role.descripcion ?? '').toLocaleLowerCase('es').includes(search);
    const matchesStatus =
      status === '_all' ||
      (status === 'active' && role.activo) ||
      (status === 'inactive' && !role.activo);
    return matchesSearch && matchesStatus;
  });
}
