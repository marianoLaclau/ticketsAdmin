import { useEffect, useMemo, useState } from 'react';
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
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import { AdminUserFormDialog } from '@/features/admin-directory/AdminUserFormDialog';
import { AdminUserPasswordDialog } from '@/features/admin-directory/AdminUserPasswordDialog';
import { AdminStatusBadge } from '@/features/admin-directory/AdminStatusBadge';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { adminErrorMessage } from '@/hooks/use-admin-access';
import { useToast } from '@/hooks/use-toast';
import { AdminCredentialNotice } from '@/components/admin/AdminCredentialNotice';
import {
  ADMIN_DIRECTORY_USER_LIMITS,
  type AdminDirectoryUsersUrlState,
} from '@/lib/admin-directory-url';
import type { AdminCredentialState } from '@/lib/admin-credential-state';
import { getNewPasswordError } from '@/lib/password-policy';
import { formatDate } from '@/lib/utils-tickets';

interface AdminUsersTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
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
  urlState,
  updateUrlState,
}: AdminUsersTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasAdminAccess = adminAccessState === 'ready';

  const showError = (title: string) => (error: unknown) => {
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

  const selectUserPageSize = (value: string) => {
    const limit = ADMIN_DIRECTORY_USER_LIMITS.find(
      (candidate) => String(candidate) === value,
    );
    if (!limit) return;
    updateUrlState((current) => ({ ...current, limit, page: 1 }));
  };

  const goToUserPage = (page: number) => {
    if (!Number.isSafeInteger(page) || page < 1) return;
    updateUrlState((current) => ({ ...current, page }), 'push');
  };

  const createUser = useCreateAdminUser({ request });
  const updateUser = useUpdateAdminUser({ request });
  const resetPassword = useResetAdminUserPassword({ request });
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<AdminUserFormState>(createEmptyAdminUserForm);

  // Reestablecer contraseña (la "llavesita" de cada usuario)
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordRepetida, setPasswordRepetida] = useState('');

  const closeResetPassword = () => {
    setPasswordUser(null);
    setPasswordNueva('');
    setPasswordRepetida('');
  };

  const openResetPassword = (user: AdminUser) => {
    setPasswordNueva('');
    setPasswordRepetida('');
    setPasswordUser(user);
  };

  const savePassword = () => {
    if (!passwordUser) return;
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
          closeResetPassword();
          void refreshUsers();
          toast({
            variant: 'success',
            title: 'Contraseña temporal asignada',
            description: `${passwordUser.nombre} deberá reemplazarla al ingresar. Sus sesiones anteriores fueron cerradas.`,
          });
        },
        onError: showError('No se pudo actualizar la contraseña'),
      },
    );
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(createNewAdminUserForm(roles));
    setUserDialogOpen(true);
  };

  const openEditUser = (user: AdminUser) => {
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
        { onSuccess, onError: showError('No se pudo actualizar el usuario') },
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
      createUser.mutate({ data }, { onSuccess, onError: showError('No se pudo crear el usuario') });
    }
  };

  const toggleUser = (user: AdminUser) => {
    updateUser.mutate(
      { id: user.id, data: { activo: !user.activo } },
      {
        onSuccess: () => {
          void refreshUsers();
          toast({
            variant: user.activo ? 'warning' : 'success',
            title: user.activo ? 'Usuario desactivado' : 'Usuario activado',
            description: `${user.nombre} ${user.apellido ?? ''}`.trim() + ` · ${user.email}`,
          });
        },
        onError: showError(user.activo ? 'No se pudo desactivar el usuario' : 'No se pudo activar el usuario'),
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
              disabled={!roles.some((role) => role.activo)}
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
                      <TableRow key={user.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{user.id}</TableCell>
                        <TableCell className="font-medium">
                          {user.nombre} {user.apellido ?? ''}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs text-slate-600">{user.username ?? '—'}</div>
                          {user.debe_cambiar_password && (
                            <Badge
                              variant="outline"
                              className="mt-1 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700"
                            >
                              Cambio de contraseña pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{roleById.get(user.role_id) ?? `Rol #${user.role_id}`}</Badge>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge active={user.activo} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(user.fecha_actualizacion)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={user.activo}
                              onCheckedChange={() => toggleUser(user)}
                              disabled={updateUser.isPending}
                              aria-label={
                                user.activo
                                  ? `Desactivar usuario ${user.username ?? user.email}`
                                  : `Activar usuario ${user.username ?? user.email}`
                              }
                              title={user.activo ? 'Desactivar usuario' : 'Activar usuario'}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditUser(user)}
                              title="Editar usuario"
                              aria-label={`Editar usuario ${user.username ?? user.email}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:text-amber-700"
                              onClick={() => openResetPassword(user)}
                              title="Asignar contraseña temporal"
                              aria-label={`Asignar contraseña temporal a ${user.username ?? user.email}`}
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col items-center justify-between gap-2 border-t border-border bg-slate-50/60 px-4 py-2.5 sm:flex-row">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Mostrar</span>
                <Select value={String(userPageSize)} onValueChange={selectUserPageSize}>
                  <SelectTrigger
                    className="h-7 w-[70px] bg-white text-xs"
                    aria-label="Cantidad de usuarios por página"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>por página</span>
              </div>
              <span
                className="text-xs text-muted-foreground"
                role={userResultsAvailable ? 'status' : undefined}
                aria-live={userResultsAvailable ? 'polite' : undefined}
                aria-atomic={userResultsAvailable ? 'true' : undefined}
              >
                {usersQuery.isLoading
                  ? 'Cargando registros...'
                  : usersQuery.isError
                    ? 'No se pudieron cargar los registros.'
                    : `${userTotal} registros — página ${userPage} de ${userTotalPages}`}
              </span>
              <nav className="flex items-center gap-1" aria-label="Paginación de usuarios">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2 text-xs"
                  disabled={userPage <= 1}
                  onClick={() => goToUserPage(userPage - 1)}
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" aria-hidden="true" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2 text-xs"
                  disabled={userPage >= userTotalPages}
                  onClick={() => goToUserPage(userPage + 1)}
                >
                  Siguiente <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </nav>
            </div>
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
