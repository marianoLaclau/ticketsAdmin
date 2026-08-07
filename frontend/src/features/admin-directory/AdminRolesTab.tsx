import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminRole,
  useDeleteAdminRole,
  useListAdminRoles,
  useUpdateAdminRole,
  type AdminRole,
  type AdminRoleInput,
  type AdminRoleUpdate,
} from '@workspace/api-client-react';
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AdminStatusBadge } from '@/features/admin-directory/AdminStatusBadge';
import {
  createAdminRoleForm,
  createEmptyAdminRoleForm,
  filterAdminRoles,
  type AdminRoleFormState,
} from '@/features/admin-directory/model';
import type {
  AdminDirectoryRolesUrlUpdate,
  AdminDirectoryUrlNavigation,
} from '@/features/admin-directory/useAdminDirectoryUrl';
import { adminErrorMessage } from '@/hooks/use-admin-access';
import { useToast } from '@/hooks/use-toast';
import type { AdminDirectoryRolesUrlState } from '@/lib/admin-directory-url';
import { esRolSistema } from '@/lib/roles';
import { formatDate } from '@/lib/utils-tickets';

interface AdminRolesTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  hasAdminAccess: boolean;
  accessVersion: number;
  urlState: AdminDirectoryRolesUrlState;
  updateUrlState: (
    update: AdminDirectoryRolesUrlUpdate,
    navigation?: AdminDirectoryUrlNavigation,
  ) => void;
}

export function AdminRolesTab({
  request,
  queryRequest,
  hasAdminAccess,
  accessVersion,
  urlState,
  updateUrlState,
}: AdminRolesTabProps) {
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

  const roleSearch = urlState.search ?? '';
  const roleStatusFilter = urlState.status ?? '_all';

  const roleListParams = useMemo(
    () => ({
      page: 1,
      limit: 100,
      ...(roleSearch.trim() ? { search: roleSearch.trim() } : {}),
    }),
    [roleSearch],
  );
  const roleListQueryKey = [
    ...getListAdminRolesQueryKey(roleListParams),
    'admin-access',
    accessVersion,
  ] as const;
  const rolesQuery = useListAdminRoles(roleListParams, {
    query: {
      enabled: hasAdminAccess,
      queryKey: roleListQueryKey,
      retry: false,
    },
    request: queryRequest,
  });
  const listedRoles = useMemo(
    () => rolesQuery.data?.roles ?? [],
    [rolesQuery.data?.roles],
  );
  const updateRoleSearch = (value: string) => {
    updateUrlState((current) => {
      const next = { ...current };
      if (value.trim()) next.search = value;
      else delete next.search;
      return next;
    });
  };

  const selectRoleStatus = (value: string) => {
    if (value !== '_all' && value !== 'active' && value !== 'inactive') return;
    updateUrlState((current) => {
      const next = { ...current };
      if (value === '_all') delete next.status;
      else next.status = value;
      return next;
    });
  };

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState<AdminRoleFormState>(createEmptyAdminRoleForm);
  const editingSystemRole = Boolean(editingRole && esRolSistema(editingRole.nombre));

  const visibleRoles = useMemo(
    () => filterAdminRoles(listedRoles, roleSearch, roleStatusFilter),
    [listedRoles, roleSearch, roleStatusFilter],
  );

  const createRole = useCreateAdminRole({ request });
  const updateRole = useUpdateAdminRole({ request });
  const deleteRole = useDeleteAdminRole({ request });

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm(createEmptyAdminRoleForm());
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: AdminRole) => {
    setEditingRole(role);
    setRoleForm(createAdminRoleForm(role));
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
    if (esRolSistema(role.nombre)) return;
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
    if (!roleToDelete || esRolSistema(roleToDelete.nombre)) return;
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

  const roleMutationPending = createRole.isPending || updateRole.isPending || deleteRole.isPending;

  return (
    <>
      <TabsContent value="roles" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={roleSearch}
                onChange={(event) => updateRoleSearch(event.target.value)}
                placeholder="Buscar rol..."
                className="h-9 pl-8"
              />
            </div>
            <Select value={roleStatusFilter} onValueChange={selectRoleStatus}>
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
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{role.nombre}</span>
                          {esRolSistema(role.nombre) && (
                            <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide">
                              Sistema protegido
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xl text-muted-foreground">{role.descripcion || '—'}</TableCell>
                      <TableCell>
                        <AdminStatusBadge active={role.activo} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(role.fecha_actualizacion)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={role.activo}
                            onCheckedChange={() => toggleRole(role)}
                            disabled={updateRole.isPending || esRolSistema(role.nombre)}
                            aria-label={
                              esRolSistema(role.nombre)
                                ? `${role.nombre}: rol del sistema protegido, permanece activo`
                                : role.activo
                                  ? 'Desactivar rol'
                                  : 'Activar rol'
                            }
                            title={
                              esRolSistema(role.nombre)
                                ? 'Los roles del sistema deben permanecer activos'
                                : role.activo
                                  ? 'Desactivar rol'
                                  : 'Activar rol'
                            }
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
                            disabled={esRolSistema(role.nombre)}
                            aria-label={
                              esRolSistema(role.nombre)
                                ? `${role.nombre}: rol del sistema protegido, no se puede eliminar`
                                : `Eliminar rol ${role.nombre}`
                            }
                            title={
                              esRolSistema(role.nombre)
                                ? 'Los roles del sistema no se pueden eliminar'
                                : 'Eliminar rol'
                            }
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
                disabled={editingSystemRole}
              />
              {editingSystemRole && (
                <p className="text-xs text-muted-foreground">
                  El nombre de un rol del sistema es parte de la política de acceso y no se puede modificar.
                </p>
              )}
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
                <p className="text-xs text-muted-foreground">
                  {editingSystemRole
                    ? 'Los roles del sistema deben permanecer activos.'
                    : 'Los roles inactivos no permiten iniciar ni conservar una sesión.'}
                </p>
              </div>
              <Switch
                id="role-active"
                checked={roleForm.activo}
                onCheckedChange={(activo) => setRoleForm((form) => ({ ...form, activo }))}
                disabled={editingSystemRole}
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
    </>
  );
}
