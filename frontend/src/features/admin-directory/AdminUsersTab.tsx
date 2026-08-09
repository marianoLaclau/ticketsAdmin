import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  useListAdminRoles,
  useListAdminUsers,
  useResetAdminUserPassword,
  useUpdateAdminUser,
  type AdminUser,
  type AdminUserInput,
  type AdminUserUpdate,
} from '@workspace/api-client-react';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { AdminUserFormDialog } from '@/features/admin-directory/AdminUserFormDialog';
import { AdminUserPasswordDialog } from '@/features/admin-directory/AdminUserPasswordDialog';
import { AdminUsersPagination } from '@/features/admin-directory/AdminUsersPagination';
import { AdminUserTableRow } from '@/features/admin-directory/AdminUserTableRow';
import {
  createAdminUserForm,
  createEmptyAdminUserForm,
  createNewAdminUserForm,
  createRoleNameMap,
  type AdminUserFormState,
} from '@/features/admin-directory/model';
import type {
  AdminDirectoryUrlNavigation,
  AdminDirectoryUsersUrlUpdate,
} from '@/features/admin-directory/useAdminDirectoryUrl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { adminErrorMessage } from '@/hooks/use-admin-access';
import { useAdminOperationGuard } from '@/hooks/use-admin-operation-guard';
import { useToast } from '@/hooks/use-toast';
import { AdminCredentialNotice } from '@/components/admin/AdminCredentialNotice';
import type { AdminDirectoryUsersUrlState } from '@/lib/admin-directory-url';
import type { AdminCredentialState } from '@/lib/admin-credential-state';
import { getNewPasswordError } from '@/lib/password-policy';

interface AdminUsersTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
  urlState: AdminDirectoryUsersUrlState;
  updateUrlState: (
    update: AdminDirectoryUsersUrlUpdate,
    navigation?: AdminDirectoryUrlNavigation,
  ) => void;
}

export function AdminUsersTab({
  request,
  queryRequest,
  adminAccessState,
  accessVersion,
  accessGeneration,
  urlState,
  updateUrlState,
}: AdminUsersTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasAdminAccess = adminAccessState === 'ready';
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );

  const showError = (title: string, expectedGeneration: number) => (error: unknown) => {
    if (!isCurrentOperation(expectedGeneration)) return;
    toast({
      variant: 'destructive',
      title,
      description: adminErrorMessage(error),
    });
  };

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });

  // Se obtiene el directorio completo admitido por la API para resolver role_id
  // en la tabla de usuarios y alimentar tanto filtros como formularios.
  const roleCatalogParams = { page: 1, limit: 100 };
  const roleCatalogQueryKey = [
    ...getListAdminRolesQueryKey(roleCatalogParams),
    'admin-access',
    accessVersion,
  ] as const;
  const roleCatalogQuery = useListAdminRoles(roleCatalogParams, {
    query: {
      enabled: hasAdminAccess,
      queryKey: roleCatalogQueryKey,
      retry: false,
    },
    request: queryRequest,
  });
  const roles = useMemo(
    () => roleCatalogQuery.data?.roles ?? [],
    [roleCatalogQuery.data?.roles],
  );
  const roleById = useMemo(() => createRoleNameMap(roles), [roles]);

  // ---------- Usuarios ----------
  const userSearch = urlState.search ?? '';
  const userRoleFilter = urlState.roleId ? String(urlState.roleId) : '_all';
  const userStatusFilter = urlState.status ?? '_all';
  const userPage = urlState.page;
  const userPageSize = urlState.limit;
  const selectedRoleUnavailable = Boolean(
    urlState.roleId && !roles.some((role) => role.id === urlState.roleId),
  );

  const userListParams = useMemo(
    () => ({
      page: userPage,
      limit: userPageSize,
      ...(userSearch.trim() ? { search: userSearch.trim() } : {}),
      ...(urlState.roleId ? { role_id: urlState.roleId } : {}),
      ...(userStatusFilter === 'active' ? { activo: true } : {}),
      ...(userStatusFilter === 'inactive' ? { activo: false } : {}),
    }),
    [
      userPage,
      userPageSize,
      userSearch,
      userStatusFilter,
      urlState.roleId,
    ],
  );
  const userListQueryKey = [
    ...getListAdminUsersQueryKey(userListParams),
    'admin-access',
    accessVersion,
  ] as const;
  const usersQuery = useListAdminUsers(userListParams, {
    query: {
      enabled: hasAdminAccess,
      queryKey: userListQueryKey,
      retry: false,
    },
    request: queryRequest,
  });

  const users = usersQuery.data?.users ?? [];
  const userTotal = usersQuery.data?.total ?? 0;
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize));
  const userResultsAvailable =
    !usersQuery.isLoading && !usersQuery.isError && users.length > 0;
  const userTableHasWideRows = usersQuery.isLoading || userResultsAvailable;

  useEffect(() => {
    if (
      usersQuery.data &&
      usersQuery.data.page === userPage &&
      usersQuery.data.limit === userPageSize &&
      userPage > userTotalPages
    ) {
      updateUrlState((current) => ({
        ...current,
        page: userTotalPages,
      }));
    }
  }, [
    updateUrlState,
    userPage,
    userPageSize,
    userTotalPages,
    usersQuery.data,
  ]);

  const updateUserSearch = (value: string) => {
    updateUrlState((current) => {
      const next = { ...current, page: 1 };
      if (value.trim()) next.search = value;
      else delete next.search;
      return next;
    });
  };

  const selectUserRole = (value: string) => {
    if (value === '_all') {
      updateUrlState((current) => {
        const next = { ...current, page: 1 };
        delete next.roleId;
        return next;
      });
      return;
    }

    const roleId = Number(value);
    if (
      !Number.isSafeInteger(roleId) ||
      roleId < 1 ||
      !roles.some((role) => role.id === roleId)
    ) {
      return;
    }
    updateUrlState((current) => ({ ...current, roleId, page: 1 }));
  };

  const selectUserStatus = (value: string) => {
    if (value !== '_all' && value !== 'active' && value !== 'inactive') return;
    updateUrlState((current) => {
      const next = { ...current, page: 1 };
      if (value === '_all') delete next.status;
      else next.status = value;
      return next;
    });
  };

  const goToUserPage = (page: number) => {
    if (!Number.isSafeInteger(page) || page < 1) return;
    updateUrlState((current) => ({ ...current, page }), 'push');
  };

  const createUser = useCreateAdminUser({ request });
  const updateUser = useUpdateAdminUser({ request });
  const resetPassword = useResetAdminUserPassword({ request });
  const { reset: resetCreateUser } = createUser;
  const { reset: resetUpdateUser } = updateUser;
  const { reset: resetUserPassword } = resetPassword;
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<AdminUserFormState>(createEmptyAdminUserForm);

  // Reestablecer contraseña (la "llavesita" de cada usuario)
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordRepetida, setPasswordRepetida] = useState('');
  const resetAccessBoundaryRef = useRef(accessBoundary);

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    setUserDialogOpen(false);
    setEditingUser(null);
    setUserForm(createEmptyAdminUserForm());
    setPasswordUser(null);
    setPasswordNueva('');
    setPasswordRepetida('');
    resetCreateUser();
    resetUpdateUser();
    resetUserPassword();
  }, [
    accessBoundary,
    resetCreateUser,
    resetUpdateUser,
    resetUserPassword,
  ]);

  const closeResetPassword = () => {
    setPasswordUser(null);
    setPasswordNueva('');
    setPasswordRepetida('');
  };

  const openResetPassword = (user: AdminUser) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      resetPassword.isPending
    ) return;
    setPasswordNueva('');
    setPasswordRepetida('');
    setPasswordUser(user);
  };

  const savePassword = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      !passwordUser ||
      resetPassword.isPending
    ) return;
    const operationAccessGeneration = operationGeneration;
    const passwordError = getNewPasswordError(passwordNueva);
    if (passwordError) {
      toast({
        variant: 'warning',
        title: 'Contraseña no válida',
        description: passwordError,
      });
      return;
    }
    if (passwordNueva !== passwordRepetida) {
      toast({
        variant: 'warning',
        title: 'Las contraseñas no coinciden',
        description: 'Revisá los dos campos de contraseña.',
      });
      return;
    }
    resetPassword.mutate(
      { id: passwordUser.id, data: { password: passwordNueva } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          closeResetPassword();
          void refreshUsers();
          toast({
            variant: 'success',
            title: 'Contraseña temporal asignada',
            description: `${passwordUser.nombre} deberá reemplazarla al ingresar. Sus sesiones anteriores fueron cerradas.`,
          });
        },
        onError: showError(
          'No se pudo actualizar la contraseña',
          operationAccessGeneration,
        ),
      },
    );
  };

  const openCreateUser = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) return;
    setEditingUser(null);
    setUserForm(createNewAdminUserForm(roles));
    setUserDialogOpen(true);
  };

  const openEditUser = (user: AdminUser) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) return;
    setEditingUser(user);
    setUserForm(createAdminUserForm(user));
    setUserDialogOpen(true);
  };

  const closeUserDialog = () => {
    setUserDialogOpen(false);
    setUserForm((form) => ({
      ...form,
      password: '',
      passwordRepetida: '',
    }));
  };

  const saveUser = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) return;
    const operationAccessGeneration = operationGeneration;
    const nombre = userForm.nombre.trim();
    const email = userForm.email.trim().toLowerCase();
    const username = userForm.username.trim().toLowerCase();
    const roleId = Number(userForm.roleId);
    if (!nombre || !email || !username || !Number.isInteger(roleId) || roleId < 1) {
      toast({
        variant: 'warning',
        title: 'Faltan datos obligatorios',
        description: 'Completá nombre, nombre de usuario, email y rol antes de guardar.',
      });
      return;
    }

    // La contraseña solo se pide al crear — para un usuario existente se
    // cambia con la llavesita de reset (revoca sus sesiones activas).
    if (!editingUser) {
      const passwordError = getNewPasswordError(userForm.password);
      if (passwordError) {
        toast({
          variant: 'warning',
          title: 'Contraseña no válida',
          description: passwordError,
        });
        return;
      }
      if (userForm.password !== userForm.passwordRepetida) {
        toast({
          variant: 'warning',
          title: 'Las contraseñas no coinciden',
          description: 'Revisá los dos campos de contraseña.',
        });
        return;
      }
    }

    const userName = `${nombre} ${userForm.apellido.trim()}`.trim();
    const roleName = roleById.get(roleId) ?? `Rol #${roleId}`;
    const onSuccess = () => {
      if (!isCurrentOperation(operationAccessGeneration)) return;
      closeUserDialog();
      void refreshUsers();
      toast({
        variant: 'success',
        title: editingUser ? 'Usuario actualizado' : 'Usuario creado',
        description: editingUser
          ? `${userName} · ${username} · ${roleName}`
          : `${userName} · ${username} · ${roleName}. Deberá reemplazar la contraseña temporal al ingresar.`,
      });
    };

    if (editingUser) {
      const data: AdminUserUpdate = {
        nombre,
        apellido: userForm.apellido.trim() || null,
        username,
        email,
        role_id: roleId,
        activo: userForm.activo,
      };
      updateUser.mutate(
        { id: editingUser.id, data },
        {
          onSuccess,
          onError: showError(
            'No se pudo actualizar el usuario',
            operationAccessGeneration,
          ),
        },
      );
    } else {
      const data: AdminUserInput = {
        nombre,
        apellido: userForm.apellido.trim() || null,
        username,
        password: userForm.password,
        email,
        role_id: roleId,
        activo: userForm.activo,
      };
      createUser.mutate(
        { data },
        {
          onSuccess,
          onError: showError(
            'No se pudo crear el usuario',
            operationAccessGeneration,
          ),
        },
      );
    }
  };

  const toggleUser = (user: AdminUser) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      updateUser.isPending
    ) return;
    const operationAccessGeneration = operationGeneration;
    updateUser.mutate(
      { id: user.id, data: { activo: !user.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          void refreshUsers();
          toast({
            variant: user.activo ? 'warning' : 'success',
            title: user.activo ? 'Usuario desactivado' : 'Usuario activado',
            description: `${user.nombre} ${user.apellido ?? ''}`.trim() + ` · ${user.email}`,
          });
        },
        onError: showError(
          user.activo
            ? 'No se pudo desactivar el usuario'
            : 'No se pudo activar el usuario',
          operationAccessGeneration,
        ),
      },
    );
  };
  const userMutationPending = createUser.isPending || updateUser.isPending;

  if (adminAccessState !== 'ready') {
    return (
      <TabsContent value="users">
        <AdminCredentialNotice
          state={adminAccessState}
          pendingDescription="Esperá un instante antes de consultar o gestionar usuarios."
          missingDescription="El directorio permanece protegido. Completá la llave en la cabecera para consultar y gestionar usuarios."
        />
      </TabsContent>
    );
  }

  return (
    <>
        <TabsContent value="users" className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-2 md:flex-row md:flex-wrap">
              <div className="relative w-full md:max-w-sm">
                <Search
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={userSearch}
                  onChange={(event) => updateUserSearch(event.target.value)}
                  placeholder="Buscar por nombre, apellido o email..."
                  className="h-9 pl-8"
                  aria-label="Buscar usuarios por nombre, apellido o email"
                />
              </div>
              <Select value={userRoleFilter} onValueChange={selectUserRole}>
                <SelectTrigger
                  className="h-9 w-full bg-white md:w-[190px]"
                  aria-label="Filtrar usuarios por rol"
                >
                  <SelectValue placeholder="Todos los roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos los roles</SelectItem>
                  {selectedRoleUnavailable && urlState.roleId && (
                    <SelectItem value={String(urlState.roleId)}>
                      Rol #{urlState.roleId} (no disponible)
                    </SelectItem>
                  )}
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.nombre}
                      {role.activo ? '' : ' (inactivo)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userStatusFilter} onValueChange={selectUserStatus}>
                <SelectTrigger
                  className="h-9 w-full bg-white md:w-[160px]"
                  aria-label="Filtrar usuarios por estado"
                >
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos los estados</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={openCreateUser}
              disabled={
                userMutationPending || !roles.some((role) => role.activo)
              }
              className="w-full sm:w-auto sm:self-start xl:self-auto"
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nuevo usuario
            </Button>
          </div>

          {!roleCatalogQuery.isLoading && !roleCatalogQuery.isError && !roles.some((role) => role.activo) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Necesitás un rol activo</AlertTitle>
              <AlertDescription>Creá o activá un rol para habilitar la creación de usuarios.</AlertDescription>
            </Alert>
          )}

          {roleCatalogQuery.isError && !usersQuery.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>No se pudo cargar el catálogo de roles</AlertTitle>
              <AlertDescription>{adminErrorMessage(roleCatalogQuery.error)}</AlertDescription>
            </Alert>
          )}

          {usersQuery.isFetching ? (
            <LoadingStatus>
              {usersQuery.isLoading ? 'Cargando usuarios' : 'Actualizando usuarios'}
            </LoadingStatus>
          ) : null}

          {userTableHasWideRows ? (
            <p className="text-xs text-muted-foreground 2xl:hidden">
              Deslizá la tabla horizontalmente para ver todas las columnas.
            </p>
          ) : null}

          <div
            className="overflow-hidden rounded-md border border-border bg-card shadow-sm"
            aria-busy={usersQuery.isFetching}
          >
            <div className="overflow-x-auto">
              <Table className={userTableHasWideRows ? 'min-w-[1100px]' : undefined}>
                <TableCaption className="sr-only">Directorio de usuarios</TableCaption>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="w-[70px] text-xs uppercase">ID</TableHead>
                    <TableHead className="text-xs uppercase">Nombre</TableHead>
                    <TableHead className="text-xs uppercase">Nombre de usuario</TableHead>
                    <TableHead className="text-xs uppercase">Email</TableHead>
                    <TableHead className="text-xs uppercase">Rol</TableHead>
                    <TableHead className="text-xs uppercase">Estado</TableHead>
                    <TableHead className="text-xs uppercase">Actualizado</TableHead>
                    <TableHead className="w-[130px] text-right text-xs uppercase">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, row) => (
                      <TableRow key={row} aria-hidden="true">
                        {Array.from({ length: 8 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : usersQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-sm text-destructive">
                        <span role="alert">{adminErrorMessage(usersQuery.error)}</span>
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                        <span role="status">No hay usuarios que coincidan con los filtros.</span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <AdminUserTableRow
                        key={user.id}
                        user={user}
                        roleName={roleById.get(user.role_id)}
                        isStatusToggleDisabled={updateUser.isPending}
                        isEditDisabled={userMutationPending}
                        isPasswordResetDisabled={resetPassword.isPending}
                        onToggle={toggleUser}
                        onEdit={openEditUser}
                        onResetPassword={openResetPassword}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <AdminUsersPagination
              page={userPage}
              pageSize={userPageSize}
              total={userTotal}
              totalPages={userTotalPages}
              isLoading={usersQuery.isLoading}
              isError={usersQuery.isError}
              hasResults={userResultsAvailable}
              onPageSizeChange={(limit) =>
                updateUrlState((current) => ({ ...current, limit, page: 1 }))
              }
              onPreviousPage={() => goToUserPage(userPage - 1)}
              onNextPage={() => goToUserPage(userPage + 1)}
            />
          </div>
        </TabsContent>

      <AdminUserFormDialog
        open={userDialogOpen}
        isEditing={Boolean(editingUser)}
        roles={roles}
        form={userForm}
        isSaving={userMutationPending}
        onOpenChange={(open) =>
          open ? setUserDialogOpen(true) : closeUserDialog()
        }
        onFormChange={setUserForm}
        onSave={saveUser}
      />

      <AdminUserPasswordDialog
        user={passwordUser}
        password={passwordNueva}
        repeatedPassword={passwordRepetida}
        isSaving={resetPassword.isPending}
        onPasswordChange={setPasswordNueva}
        onRepeatedPasswordChange={setPasswordRepetida}
        onClose={closeResetPassword}
        onSave={savePassword}
      />
    </>
  );
}
