import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { AdminRoleFormDialog } from '@/features/admin-directory/AdminRoleFormDialog';
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
import { useAdminOperationGuard } from '@/hooks/use-admin-operation-guard';
import { useToast } from '@/hooks/use-toast';
import { AdminCredentialNotice } from '@/components/admin/AdminCredentialNotice';
import type { AdminCredentialState } from '@/lib/admin-credential-state';
import type { AdminDirectoryRolesUrlState } from '@/lib/admin-directory-url';
import { esRolSistema } from '@/lib/roles';
import { formatDate } from '@/lib/utils-tickets';

interface AdminRolesTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
  urlState: AdminDirectoryRolesUrlState;
  updateUrlState: (
    update: AdminDirectoryRolesUrlUpdate,
    navigation?: AdminDirectoryUrlNavigation,
  ) => void;
}

export function AdminRolesTab({
  request,
  queryRequest,
  adminAccessState,
  accessVersion,
  accessGeneration,
  urlState,
  updateUrlState,
}: AdminRolesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasAdminAccess = adminAccessState === 'ready';
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );

  const showError =
    (title: string, operationAccessGeneration: number) => (error: unknown) => {
      if (!isCurrentOperation(operationAccessGeneration)) return;
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
  const roleResultsAvailable =
    !rolesQuery.isLoading && !rolesQuery.isError && visibleRoles.length > 0;
  const roleTableHasWideRows = rolesQuery.isLoading || roleResultsAvailable;

  const createRole = useCreateAdminRole({ request });
  const updateRole = useUpdateAdminRole({ request });
  const deleteRole = useDeleteAdminRole({ request });
  const roleMutationPending =
    createRole.isPending || updateRole.isPending || deleteRole.isPending;
  const { reset: resetCreateRole } = createRole;
  const { reset: resetUpdateRole } = updateRole;
  const { reset: resetDeleteRole } = deleteRole;
  const resetAccessBoundaryRef = useRef(accessBoundary);

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    setRoleDialogOpen(false);
    setEditingRole(null);
    setRoleToDelete(null);
    setRoleForm(createEmptyAdminRoleForm());
    resetCreateRole();
    resetUpdateRole();
    resetDeleteRole();
  }, [accessBoundary, resetCreateRole, resetDeleteRole, resetUpdateRole]);

  const openCreateRole = () => {
    if (!isCurrentOperation(operationGeneration) || roleMutationPending) return;
    setEditingRole(null);
    setRoleForm(createEmptyAdminRoleForm());
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: AdminRole) => {
    if (!isCurrentOperation(operationGeneration) || roleMutationPending) return;
    setEditingRole(role);
    setRoleForm(createAdminRoleForm(role));
    setRoleDialogOpen(true);
  };

  const saveRole = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createRole.isPending ||
      updateRole.isPending ||
      deleteRole.isPending
    )
      return;
    const operationAccessGeneration = operationGeneration;
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
      if (!isCurrentOperation(operationAccessGeneration)) return;
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
        {
          onSuccess,
          onError: showError(
            'No se pudo actualizar el rol',
            operationAccessGeneration,
          ),
        },
      );
    } else {
      createRole.mutate(
        { data },
        {
          onSuccess,
          onError: showError(
            'No se pudo crear el rol',
            operationAccessGeneration,
          ),
        },
      );
    }
  };

  const toggleRole = (role: AdminRole) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      roleMutationPending ||
      esRolSistema(role.nombre)
    )
      return;
    const operationAccessGeneration = operationGeneration;
    updateRole.mutate(
      { id: role.id, data: { activo: !role.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          void refreshRoles();
          void refreshUsers();
          toast({
            variant: role.activo ? 'warning' : 'success',
            title: role.activo ? 'Rol desactivado' : 'Rol activado',
            description: role.nombre,
          });
        },
        onError: showError(
          role.activo
            ? 'No se pudo desactivar el rol'
            : 'No se pudo activar el rol',
          operationAccessGeneration,
        ),
      },
    );
  };

  const confirmDeleteRole = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      !roleToDelete ||
      deleteRole.isPending ||
      esRolSistema(roleToDelete.nombre)
    )
      return;
    const operationAccessGeneration = operationGeneration;
    const role = roleToDelete;
    deleteRole.mutate(
      { id: role.id },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          setRoleToDelete(null);
          void refreshRoles();
          toast({
            variant: 'success',
            title: 'Rol eliminado',
            description: role.nombre,
          });
        },
        onError: showError(
          'No se pudo eliminar el rol',
          operationAccessGeneration,
        ),
      },
    );
  };

  const changeRoleDialogOpen = (open: boolean) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      (open && roleMutationPending)
    ) return;
    setRoleDialogOpen(open);
  };

  const changeRoleDeleteOpen = (open: boolean) => {
    if (!isCurrentOperation(operationGeneration) || open) return;
    setRoleToDelete(null);
  };

  if (adminAccessState !== 'ready') {
    return (
      <TabsContent value="roles">
        <AdminCredentialNotice
          state={adminAccessState}
          pendingDescription="Esperá un instante antes de consultar o gestionar roles."
          missingDescription="El directorio permanece protegido. Completá la llave en la cabecera para consultar y gestionar roles."
        />
      </TabsContent>
    );
  }

  return (
    <>
      <TabsContent value="roles" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={roleSearch}
                onChange={(event) => updateRoleSearch(event.target.value)}
                placeholder="Buscar rol..."
                className="h-9 pl-8"
                aria-label="Buscar roles por nombre o descripción"
              />
            </div>
            <Select value={roleStatusFilter} onValueChange={selectRoleStatus}>
              <SelectTrigger
                className="h-9 w-full bg-white sm:w-[160px]"
                aria-label="Filtrar roles por estado"
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
            onClick={openCreateRole}
            disabled={roleMutationPending}
            className="w-full sm:w-auto sm:self-start lg:self-auto"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nuevo rol
          </Button>
        </div>

        {rolesQuery.data && rolesQuery.data.total > 100 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Se muestran los primeros 100 roles</AlertTitle>
            <AlertDescription>
              Refiná la búsqueda cuando necesites localizar un rol fuera de este directorio.
            </AlertDescription>
          </Alert>
        )}

        {rolesQuery.isFetching ? (
          <LoadingStatus>
            {rolesQuery.isLoading ? 'Cargando roles' : 'Actualizando roles'}
          </LoadingStatus>
        ) : null}

        {roleTableHasWideRows ? (
          <p className="text-xs text-muted-foreground xl:hidden">
            Deslizá la tabla horizontalmente para ver todas las columnas.
          </p>
        ) : null}

        <div
          className="overflow-hidden rounded-md border border-border bg-card shadow-sm"
          aria-busy={rolesQuery.isFetching}
        >
          <div className="overflow-x-auto">
            <Table className={roleTableHasWideRows ? 'min-w-[850px]' : undefined}>
              <TableCaption className="sr-only">Directorio de roles</TableCaption>
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
                    <TableRow key={row} aria-hidden="true">
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
                      <span role="alert">{adminErrorMessage(rolesQuery.error)}</span>
                    </TableCell>
                  </TableRow>
                ) : visibleRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                      <span role="status">No hay roles que coincidan con los filtros.</span>
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
                            disabled={roleMutationPending || esRolSistema(role.nombre)}
                            aria-label={
                              esRolSistema(role.nombre)
                                ? `${role.nombre}: rol del sistema protegido, permanece activo`
                                : role.activo
                                  ? `Desactivar rol ${role.nombre}`
                                  : `Activar rol ${role.nombre}`
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
                            disabled={roleMutationPending}
                            title="Editar rol"
                            aria-label={`Editar rol ${role.nombre}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (
                                isCurrentOperation(operationGeneration) &&
                                !roleMutationPending
                              ) {
                                setRoleToDelete(role);
                              }
                            }}
                            disabled={
                              roleMutationPending || esRolSistema(role.nombre)
                            }
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
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div
            className="border-t bg-slate-50/60 px-4 py-2.5 text-xs text-muted-foreground"
            role={roleResultsAvailable ? 'status' : undefined}
            aria-live={roleResultsAvailable ? 'polite' : undefined}
            aria-atomic={roleResultsAvailable ? 'true' : undefined}
          >
            {rolesQuery.isLoading
              ? 'Cargando roles...'
              : rolesQuery.isError
                ? 'No se pudieron cargar los roles.'
                : `${visibleRoles.length} de ${rolesQuery.data?.total ?? 0} roles visibles`}
          </div>
        </div>
      </TabsContent>

      <AdminRoleFormDialog
        open={roleDialogOpen}
        isEditing={Boolean(editingRole)}
        isSystemRole={editingSystemRole}
        form={roleForm}
        isSaving={roleMutationPending}
        onOpenChange={changeRoleDialogOpen}
        onFormChange={setRoleForm}
        onSave={saveRole}
      />

      <AlertDialog
        open={Boolean(roleToDelete)}
        onOpenChange={changeRoleDeleteOpen}
      >
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
