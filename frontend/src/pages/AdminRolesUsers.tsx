import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminRole,
  useCreateAdminUser,
  useDeleteAdminRole,
  useListAdminRoles,
  useListAdminUsers,
  useResetAdminUserPassword,
  useUpdateAdminRole,
  useUpdateAdminUser,
  type AdminRole,
  type AdminRoleInput,
  type AdminRoleUpdate,
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
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { adminErrorMessage, useAdminAccess } from '@/hooks/use-admin-access';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils-tickets';

type UserFormState = {
  nombre: string;
  apellido: string;
  username: string;
  password: string;
  passwordRepetida: string;
  email: string;
  roleId: string;
  activo: boolean;
};

type RoleFormState = {
  nombre: string;
  descripcion: string;
  activo: boolean;
};

const emptyUserForm = (): UserFormState => ({
  nombre: '',
  apellido: '',
  username: '',
  password: '',
  passwordRepetida: '',
  email: '',
  roleId: '',
  activo: true,
});

const emptyRoleForm = (): RoleFormState => ({
  nombre: '',
  descripcion: '',
  activo: true,
});

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Activo</Badge>
  ) : (
    <Badge variant="secondary" className="text-slate-500">
      Inactivo
    </Badge>
  );
}

export default function AdminRolesUsers() {
  const { adminKey, saveAdminKey, adminRequest } = useAdminAccess();
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
  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: getListAdminRolesQueryKey() });

  const [roleSearch, setRoleSearch] = useState('');
  const [roleStatusFilter, setRoleStatusFilter] = useState('_all');

  // Se obtiene el directorio completo admitido por la API para resolver role_id
  // en la tabla de usuarios y alimentar tanto filtros como formularios.
  const roleCatalogQuery = useListAdminRoles({ page: 1, limit: 100 }, { request: adminRequest });
  const rolesQuery = useListAdminRoles(
    {
      page: 1,
      limit: 100,
      ...(roleSearch.trim() ? { search: roleSearch.trim() } : {}),
    },
    { request: adminRequest },
  );
  const roles = roleCatalogQuery.data?.roles ?? [];
  const listedRoles = rolesQuery.data?.roles ?? [];
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role.nombre])), [roles]);

  // ---------- Usuarios ----------
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('_all');
  const [userStatusFilter, setUserStatusFilter] = useState('_all');

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, userRoleFilter, userStatusFilter, userPageSize]);

  const usersQuery = useListAdminUsers(
    {
      page: userPage,
      limit: userPageSize,
      ...(userSearch.trim() ? { search: userSearch.trim() } : {}),
      ...(userRoleFilter !== '_all' ? { role_id: Number(userRoleFilter) } : {}),
      ...(userStatusFilter === 'active' ? { activo: true } : {}),
      ...(userStatusFilter === 'inactive' ? { activo: false } : {}),
    },
    { request: adminRequest },
  );

  const users = usersQuery.data?.users ?? [];
  const userTotal = usersQuery.data?.total ?? 0;
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize));

  useEffect(() => {
    if (usersQuery.data && userPage > userTotalPages) setUserPage(userTotalPages);
  }, [userPage, userTotalPages, usersQuery.data]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void roleCatalogQuery.refetch();
      void rolesQuery.refetch();
      void usersQuery.refetch();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [adminKey]);

  const createUser = useCreateAdminUser({ request: adminRequest });
  const updateUser = useUpdateAdminUser({ request: adminRequest });
  const resetPassword = useResetAdminUserPassword({ request: adminRequest });
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);

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
    if (passwordNueva.length < 6) {
      toast({
        variant: 'warning',
        title: 'Contraseña muy corta',
        description: 'La contraseña nueva debe tener al menos 6 caracteres.',
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
          toast({
            variant: 'success',
            title: 'Contraseña actualizada',
            description: `${passwordUser.nombre} deberá ingresar con la clave nueva (sus sesiones fueron cerradas).`,
          });
        },
        onError: showError('No se pudo actualizar la contraseña'),
      },
    );
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      ...emptyUserForm(),
      roleId: String(roles.find((role) => role.activo)?.id ?? ''),
    });
    setUserDialogOpen(true);
  };

  const openEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setUserForm({
      nombre: user.nombre,
      apellido: user.apellido ?? '',
      username: user.username ?? '',
      password: '',
      passwordRepetida: '',
      email: user.email,
      roleId: String(user.role_id),
      activo: user.activo,
    });
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
      if (userForm.password.length < 6) {
        toast({
          variant: 'warning',
          title: 'Contraseña muy corta',
          description: 'La contraseña inicial debe tener al menos 6 caracteres.',
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
        description: `${userName} · ${username} · ${roleName}`,
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

  // ---------- Roles ----------
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);

  const visibleRoles = useMemo(() => {
    const search = roleSearch.trim().toLocaleLowerCase('es');
    return listedRoles.filter((role) => {
      const matchesSearch =
        !search ||
        role.nombre.toLocaleLowerCase('es').includes(search) ||
        (role.descripcion ?? '').toLocaleLowerCase('es').includes(search);
      const matchesStatus =
        roleStatusFilter === '_all' ||
        (roleStatusFilter === 'active' && role.activo) ||
        (roleStatusFilter === 'inactive' && !role.activo);
      return matchesSearch && matchesStatus;
    });
  }, [listedRoles, roleSearch, roleStatusFilter]);

  const createRole = useCreateAdminRole({ request: adminRequest });
  const updateRole = useUpdateAdminRole({ request: adminRequest });
  const deleteRole = useDeleteAdminRole({ request: adminRequest });

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm(emptyRoleForm());
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: AdminRole) => {
    setEditingRole(role);
    setRoleForm({
      nombre: role.nombre,
      descripcion: role.descripcion ?? '',
      activo: role.activo,
    });
    setRoleDialogOpen(true);
  };

  const saveRole = () => {
    const nombre = roleForm.nombre.trim();
    if (!nombre) {
      toast({
        variant: 'warning',
        title: 'Falta el nombre del rol',
        description: 'Ingresá un nombre antes de guardar.',
      });
      return;
    }

    const data: AdminRoleInput = {
      nombre,
      descripcion: roleForm.descripcion.trim() || null,
      activo: roleForm.activo,
    };
    const onSuccess = () => {
      setRoleDialogOpen(false);
      void refreshRoles();
      void refreshUsers();
      toast({
        variant: 'success',
        title: editingRole ? 'Rol actualizado' : 'Rol creado',
        description: nombre,
      });
    };

    if (editingRole) {
      updateRole.mutate(
        { id: editingRole.id, data: data satisfies AdminRoleUpdate },
        { onSuccess, onError: showError('No se pudo actualizar el rol') },
      );
    } else {
      createRole.mutate({ data }, { onSuccess, onError: showError('No se pudo crear el rol') });
    }
  };

  const toggleRole = (role: AdminRole) => {
    updateRole.mutate(
      { id: role.id, data: { activo: !role.activo } },
      {
        onSuccess: () => {
          void refreshRoles();
          void refreshUsers();
          toast({
            variant: role.activo ? 'warning' : 'success',
            title: role.activo ? 'Rol desactivado' : 'Rol activado',
            description: role.nombre,
          });
        },
        onError: showError(role.activo ? 'No se pudo desactivar el rol' : 'No se pudo activar el rol'),
      },
    );
  };

  const confirmDeleteRole = () => {
    if (!roleToDelete) return;
    deleteRole.mutate(
      { id: roleToDelete.id },
      {
        onSuccess: () => {
          setRoleToDelete(null);
          void refreshRoles();
          toast({
            variant: 'success',
            title: 'Rol eliminado',
            description: roleToDelete.nombre,
          });
        },
        onError: showError('No se pudo eliminar el rol'),
      },
    );
  };

  const userMutationPending = createUser.isPending || updateUser.isPending;
  const roleMutationPending = createRole.isPending || updateRole.isPending || deleteRole.isPending;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-8">
      <AdminHeader
        title="Roles y usuarios"
        description="Administración de perfiles operativos, permisos previstos y estado de acceso."
        adminKey={adminKey}
        onAdminKeyChange={saveAdminKey}
      />

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <UsersRound className="h-3.5 w-3.5" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="h-9 pl-8"
                />
              </div>
              <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                <SelectTrigger className="h-9 w-full bg-white sm:w-[190px]">
                  <SelectValue placeholder="Todos los roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos los roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.nombre}
                      {role.activo ? '' : ' (inactivo)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
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
              <AlertDescription>
                Creá o activá un rol para habilitar la creación de usuarios.
              </AlertDescription>
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
                        <TableCell className="font-mono text-xs text-slate-600">{user.username ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{roleById.get(user.role_id) ?? `Rol #${user.role_id}`}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge active={user.activo} />
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
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:text-amber-700"
                              onClick={() => openResetPassword(user)}
                              title="Reestablecer contraseña"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
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
                <Select value={String(userPageSize)} onValueChange={(value) => setUserPageSize(Number(value))}>
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
                  onClick={() => setUserPage((page) => page - 1)}
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-white px-2 text-xs"
                  disabled={userPage >= userTotalPages}
                  onClick={() => setUserPage((page) => page + 1)}
                >
                  Siguiente <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                  placeholder="Buscar rol..."
                  className="h-9 pl-8"
                />
              </div>
              <Select value={roleStatusFilter} onValueChange={setRoleStatusFilter}>
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
            <Button onClick={openCreateRole}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo rol
            </Button>
          </div>

          {rolesQuery.data && rolesQuery.data.total > 100 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Se muestran los primeros 100 roles</AlertTitle>
              <AlertDescription>
                Refiná la búsqueda cuando necesites localizar un rol fuera de este directorio.
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="w-[70px] text-xs uppercase">ID</TableHead>
                    <TableHead className="text-xs uppercase">Nombre</TableHead>
                    <TableHead className="text-xs uppercase">Descripción</TableHead>
                    <TableHead className="text-xs uppercase">Estado</TableHead>
                    <TableHead className="text-xs uppercase">Actualizado</TableHead>
                    <TableHead className="w-[170px] text-right text-xs uppercase">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesQuery.isLoading ? (
                    Array.from({ length: 5 }).map((_, row) => (
                      <TableRow key={row}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rolesQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-sm text-destructive">
                        {adminErrorMessage(rolesQuery.error)}
                      </TableCell>
                    </TableRow>
                  ) : visibleRoles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                        No hay roles que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{role.id}</TableCell>
                        <TableCell className="font-medium">{role.nombre}</TableCell>
                        <TableCell className="max-w-xl text-muted-foreground">{role.descripcion || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge active={role.activo} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(role.fecha_actualizacion)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={role.activo}
                              onCheckedChange={() => toggleRole(role)}
                              disabled={updateRole.isPending}
                              aria-label={role.activo ? 'Desactivar rol' : 'Activar rol'}
                              title={role.activo ? 'Desactivar rol' : 'Activar rol'}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditRole(role)}
                              title="Editar rol"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => setRoleToDelete(role)}
                              title="Eliminar rol"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="border-t bg-slate-50/60 px-4 py-2.5 text-xs text-muted-foreground">
              {visibleRoles.length} de {rolesQuery.data?.total ?? 0} roles visibles
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={userDialogOpen}
        onOpenChange={(open) => (open ? setUserDialogOpen(true) : closeUserDialog())}
      >
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
                  <Label htmlFor="user-password">Contraseña *</Label>
                  <PasswordInput
                    id="user-password"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((form) => ({
                        ...form,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-password-repeat">Repetir contraseña *</Label>
                  <PasswordInput
                    id="user-password-repeat"
                    value={userForm.passwordRepetida}
                    onChange={(event) =>
                      setUserForm((form) => ({
                        ...form,
                        passwordRepetida: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                  {userForm.passwordRepetida.length > 0 && userForm.passwordRepetida !== userForm.password && (
                    <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">Mínimo 6 caracteres.</p>
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

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
            <DialogDescription>El nombre identifica el perfil que se asigna a los usuarios.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Nombre *</Label>
              <Input
                id="role-name"
                value={roleForm.nombre}
                onChange={(event) =>
                  setRoleForm((form) => ({
                    ...form,
                    nombre: event.target.value,
                  }))
                }
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-description">Descripción</Label>
              <Textarea
                id="role-description"
                value={roleForm.descripcion}
                onChange={(event) =>
                  setRoleForm((form) => ({
                    ...form,
                    descripcion: event.target.value,
                  }))
                }
                maxLength={500}
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="role-active">Rol activo</Label>
                <p className="text-xs text-muted-foreground">Los roles inactivos no se ofrecen a nuevos usuarios.</p>
              </div>
              <Switch
                id="role-active"
                checked={roleForm.activo}
                onCheckedChange={(activo) => setRoleForm((form) => ({ ...form, activo }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRole} disabled={roleMutationPending}>
              {roleMutationPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(roleToDelete)} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el rol “{roleToDelete?.nombre}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el rol está asignado a algún usuario, el servidor impedirá
              eliminarlo; en ese caso podés desactivarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRole}
              disabled={deleteRole.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRole.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reestablecer contraseña */}
      <Dialog open={Boolean(passwordUser)} onOpenChange={(open) => !open && closeResetPassword()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" />
              Reestablecer contraseña
            </DialogTitle>
            <DialogDescription>
              {passwordUser ? `${passwordUser.nombre} ${passwordUser.apellido ?? ''} (${passwordUser.email})` : ''}.
              Al guardar, sus sesiones abiertas se cierran y deberá entrar con la clave nueva.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="password-nueva">Contraseña nueva</Label>
              <PasswordInput
                id="password-nueva"
                value={passwordNueva}
                onChange={(event) => setPasswordNueva(event.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-repetida">Repetir contraseña</Label>
              <PasswordInput
                id="password-repetida"
                value={passwordRepetida}
                onChange={(event) => setPasswordRepetida(event.target.value)}
                autoComplete="new-password"
              />
              {passwordRepetida.length > 0 && passwordRepetida !== passwordNueva && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
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
                passwordNueva.length < 6 ||
                passwordNueva !== passwordRepetida
              }
            >
              {resetPassword.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
