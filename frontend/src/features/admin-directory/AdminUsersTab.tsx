import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
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
  Loader2,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { adminErrorMessage } from '@/hooks/use-admin-access';
import { useToast } from '@/hooks/use-toast';
import {
  ADMIN_DIRECTORY_USER_LIMITS,
  type AdminDirectoryUsersUrlState,
} from '@/lib/admin-directory-url';
import {
  NEW_PASSWORD_HELP,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordError,
} from '@/lib/password-policy';
import { formatDate } from '@/lib/utils-tickets';

interface AdminUsersTabProps {
  request: RequestInit;
  urlState: AdminDirectoryUsersUrlState;
  updateUrlState: (
    update: AdminDirectoryUsersUrlUpdate,
    navigation?: AdminDirectoryUrlNavigation,
  ) => void;
}

export function AdminUsersTab({
  request,
  urlState,
  updateUrlState,
}: AdminUsersTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const roleCatalogQuery = useListAdminRoles({ page: 1, limit: 100 }, { request });
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
  const usersQuery = useListAdminUsers(userListParams, { request });

  const users = usersQuery.data?.users ?? [];
  const userTotal = usersQuery.data?.total ?? 0;
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize));
  const refetchRoleCatalog = roleCatalogQuery.refetch;
  const refetchUsers = usersQuery.refetch;

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refetchRoleCatalog();
      void refetchUsers();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [request, refetchRoleCatalog, refetchUsers]);

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

  return (
    <>
        <TabsContent value="users" className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(event) => updateUserSearch(event.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="h-9 pl-8"
                />
              </div>
              <Select value={userRoleFilter} onValueChange={selectUserRole}>
                <SelectTrigger className="h-9 w-full bg-white sm:w-[190px]">
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
                <SelectTrigger className="h-9 w-full bg-white sm:w-[160px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openCreateUser} disabled={!roles.some((role) => role.activo)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo usuario
            </Button>
          </div>

          {!roleCatalogQuery.isLoading && !roleCatalogQuery.isError && !roles.some((role) => role.activo) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Necesitás un rol activo</AlertTitle>
              <AlertDescription>Creá o activá un rol para habilitar la creación de usuarios.</AlertDescription>
            </Alert>
          )}

          <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
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
                      <TableRow key={row}>
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
                        {adminErrorMessage(usersQuery.error)}
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                        No hay usuarios que coincidan con los filtros.
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
                              aria-label={user.activo ? 'Desactivar usuario' : 'Activar usuario'}
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
                  <SelectTrigger className="h-7 w-[70px] bg-white text-xs">
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
              <span className="text-xs text-muted-foreground">
                {userTotal} registros — página {userPage} de {userTotalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2 text-xs"
                  disabled={userPage <= 1}
                  onClick={() => goToUserPage(userPage - 1)}
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2 text-xs"
                  disabled={userPage >= userTotalPages}
                  onClick={() => goToUserPage(userPage + 1)}
                >
                  Siguiente <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

      <Dialog open={userDialogOpen} onOpenChange={(open) => (open ? setUserDialogOpen(true) : closeUserDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>Definí sus datos, rol previsto y estado operativo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-name">Nombre *</Label>
                <Input
                  id="user-name"
                  value={userForm.nombre}
                  onChange={(event) =>
                    setUserForm((form) => ({
                      ...form,
                      nombre: event.target.value,
                    }))
                  }
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-last-name">Apellido</Label>
                <Input
                  id="user-last-name"
                  value={userForm.apellido}
                  onChange={(event) =>
                    setUserForm((form) => ({
                      ...form,
                      apellido: event.target.value,
                    }))
                  }
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-username">Nombre de usuario *</Label>
              <Input
                id="user-username"
                value={userForm.username}
                onChange={(event) =>
                  setUserForm((form) => ({
                    ...form,
                    username: event.target.value,
                  }))
                }
                maxLength={60}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Es lo que el usuario va a escribir para iniciar sesión — no tiene que ser el email.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email *</Label>
              <Input
                id="user-email"
                type="email"
                value={userForm.email}
                onChange={(event) =>
                  setUserForm((form) => ({
                    ...form,
                    email: event.target.value,
                  }))
                }
                maxLength={254}
              />
            </div>
            {!editingUser && (
              <div className="grid gap-2 sm:grid-cols-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                    <KeyRound className="h-3.5 w-3.5" /> Credenciales iniciales — se las entregás vos al usuario
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-password">Contraseña temporal *</Label>
                  <PasswordInput
                    id="user-password"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((form) => ({
                        ...form,
                        password: event.target.value,
                      }))
                    }
                    minLength={NEW_PASSWORD_MIN_LENGTH}
                    maxLength={NEW_PASSWORD_MAX_LENGTH}
                    autoComplete="new-password"
                    required
                    aria-invalid={Boolean(
                      userForm.password.length > 0 && getNewPasswordError(userForm.password),
                    )}
                    aria-describedby={
                      userForm.password.length > 0 && getNewPasswordError(userForm.password)
                        ? 'user-password-error'
                        : 'user-password-help'
                    }
                  />
                  {userForm.password.length > 0 && getNewPasswordError(userForm.password) && (
                    <p id="user-password-error" className="text-xs text-destructive" role="alert">
                      {getNewPasswordError(userForm.password)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-password-repeat">Repetir contraseña temporal *</Label>
                  <PasswordInput
                    id="user-password-repeat"
                    value={userForm.passwordRepetida}
                    onChange={(event) =>
                      setUserForm((form) => ({
                        ...form,
                        passwordRepetida: event.target.value,
                      }))
                    }
                    minLength={NEW_PASSWORD_MIN_LENGTH}
                    maxLength={NEW_PASSWORD_MAX_LENGTH}
                    autoComplete="new-password"
                    required
                    aria-invalid={Boolean(
                      userForm.passwordRepetida.length > 0 &&
                        userForm.passwordRepetida !== userForm.password,
                    )}
                    aria-describedby={
                      userForm.passwordRepetida.length > 0 &&
                      userForm.passwordRepetida !== userForm.password
                        ? 'user-password-repeat-error'
                        : 'user-password-help'
                    }
                  />
                  {userForm.passwordRepetida.length > 0 && userForm.passwordRepetida !== userForm.password && (
                    <p id="user-password-repeat-error" className="text-xs text-destructive" role="alert">
                      Las contraseñas no coinciden.
                    </p>
                  )}
                </div>
                <p id="user-password-help" className="text-xs text-muted-foreground sm:col-span-2">
                  {NEW_PASSWORD_HELP} El usuario deberá reemplazarla en su primer ingreso.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rol *</Label>
              <Select value={userForm.roleId} onValueChange={(roleId) => setUserForm((form) => ({ ...form, roleId }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem
                      key={role.id}
                      value={String(role.id)}
                      disabled={!role.activo && String(role.id) !== userForm.roleId}
                    >
                      {role.nombre}
                      {role.activo ? '' : ' (inactivo)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="user-active">Usuario activo</Label>
                <p className="text-xs text-muted-foreground">Puede utilizarse en futuras asignaciones de acceso.</p>
              </div>
              <Switch
                id="user-active"
                checked={userForm.activo}
                onCheckedChange={(activo) => setUserForm((form) => ({ ...form, activo }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUserDialog}>
              Cancelar
            </Button>
            <Button onClick={saveUser} disabled={userMutationPending}>
              {userMutationPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asignar una nueva contraseña temporal */}
      <Dialog open={Boolean(passwordUser)} onOpenChange={(open) => !open && closeResetPassword()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" />
              Asignar contraseña temporal
            </DialogTitle>
            <DialogDescription>
              {passwordUser ? `${passwordUser.nombre} ${passwordUser.apellido ?? ''} (${passwordUser.email})` : ''}. Al
              guardar se cerrarán sus sesiones. En el próximo ingreso deberá crear su contraseña definitiva antes de usar
              el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="password-nueva">Nueva contraseña temporal</Label>
              <PasswordInput
                id="password-nueva"
                value={passwordNueva}
                onChange={(event) => setPasswordNueva(event.target.value)}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                maxLength={NEW_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                autoFocus
                required
                aria-invalid={Boolean(passwordNueva.length > 0 && getNewPasswordError(passwordNueva))}
                aria-describedby={
                  passwordNueva.length > 0 && getNewPasswordError(passwordNueva)
                    ? 'password-nueva-error'
                    : 'password-nueva-help'
                }
              />
              {passwordNueva.length > 0 && getNewPasswordError(passwordNueva) ? (
                <p id="password-nueva-error" className="text-xs text-destructive" role="alert">
                  {getNewPasswordError(passwordNueva)}
                </p>
              ) : (
                <p id="password-nueva-help" className="text-xs text-muted-foreground">
                  {NEW_PASSWORD_HELP}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-repetida">Repetir contraseña temporal</Label>
              <PasswordInput
                id="password-repetida"
                value={passwordRepetida}
                onChange={(event) => setPasswordRepetida(event.target.value)}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                maxLength={NEW_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(passwordRepetida.length > 0 && passwordRepetida !== passwordNueva)}
                aria-describedby={
                  passwordRepetida.length > 0 && passwordRepetida !== passwordNueva
                    ? 'password-repetida-error'
                    : undefined
                }
              />
              {passwordRepetida.length > 0 && passwordRepetida !== passwordNueva && (
                <p id="password-repetida-error" className="text-xs text-destructive" role="alert">
                  Las contraseñas no coinciden.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeResetPassword}>
              Cancelar
            </Button>
            <Button
              onClick={savePassword}
              disabled={
                resetPassword.isPending ||
                Boolean(getNewPasswordError(passwordNueva)) ||
                passwordNueva !== passwordRepetida
              }
            >
              {resetPassword.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Asignar contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
