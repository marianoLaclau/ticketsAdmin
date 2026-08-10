import { useMemo } from "react";
import {
  getListAdminRolesQueryKey,
  useListAdminRoles,
} from "@workspace/api-client-react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { AdminRoleFormDialog } from "@/features/admin-directory/AdminRoleFormDialog";
import { AdminRoleTableRow } from "@/features/admin-directory/AdminRoleTableRow";
import { filterAdminRoles } from "@/features/admin-directory/model";
import { useAdminRolesCrud } from "@/features/admin-directory/useAdminRolesCrud";
import type {
  AdminDirectoryRolesUrlUpdate,
  AdminDirectoryUrlNavigation,
} from "@/features/admin-directory/useAdminDirectoryUrl";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import type { AdminAccessState } from "@/lib/admin-access-state";
import type { AdminDirectoryRolesUrlState } from "@/lib/admin-directory-url";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { esRolSistema } from "@/lib/roles";

interface AdminRolesTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminAccessState;
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
  const hasAdminAccess = adminAccessState === "ready";

  const roleSearch = urlState.search ?? "";
  const roleStatusFilter = urlState.status ?? "_all";

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
    "admin-access",
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
    if (value !== "_all" && value !== "active" && value !== "inactive") return;
    updateUrlState((current) => {
      const next = { ...current };
      if (value === "_all") delete next.status;
      else next.status = value;
      return next;
    });
  };

  const {
    roleDialogOpen,
    editingRole,
    editingSystemRole,
    roleToDelete,
    roleForm,
    setRoleForm,
    roleMutationPending,
    isDeleteRolePending,
    openCreateRole,
    openEditRole,
    openDeleteRole,
    saveRole,
    toggleRole,
    confirmDeleteRole,
    changeRoleDialogOpen,
    changeRoleDeleteOpen,
  } = useAdminRolesCrud({
    request,
    adminAccessState,
    accessVersion,
    accessGeneration,
  });

  const visibleRoles = useMemo(
    () => filterAdminRoles(listedRoles, roleSearch, roleStatusFilter),
    [listedRoles, roleSearch, roleStatusFilter],
  );
  const roleResultsAvailable =
    !rolesQuery.isLoading && !rolesQuery.isError && visibleRoles.length > 0;
  const roleTableHasWideRows = rolesQuery.isLoading || roleResultsAvailable;

  if (adminAccessState !== "ready") {
    return (
      <TabsContent value="roles">
        <AdminAccessNotice
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
              Refiná la búsqueda cuando necesites localizar un rol fuera de este
              directorio.
            </AlertDescription>
          </Alert>
        )}

        {rolesQuery.isFetching ? (
          <LoadingStatus>
            {rolesQuery.isLoading ? "Cargando roles" : "Actualizando roles"}
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
            <Table
              className={roleTableHasWideRows ? "min-w-[850px]" : undefined}
            >
              <TableCaption className="sr-only">
                Directorio de roles
              </TableCaption>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="w-[70px] text-xs uppercase">
                    ID
                  </TableHead>
                  <TableHead className="text-xs uppercase">Nombre</TableHead>
                  <TableHead className="text-xs uppercase">
                    Descripción
                  </TableHead>
                  <TableHead className="text-xs uppercase">Estado</TableHead>
                  <TableHead className="text-xs uppercase">
                    Actualizado
                  </TableHead>
                  <TableHead className="w-[170px] text-right text-xs uppercase">
                    Acciones
                  </TableHead>
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
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-sm text-destructive"
                    >
                      <span role="alert">
                        {getAdminErrorMessage(rolesQuery.error)}
                      </span>
                    </TableCell>
                  </TableRow>
                ) : visibleRoles.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      <span role="status">
                        No hay roles que coincidan con los filtros.
                      </span>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRoles.map((role) => (
                    <AdminRoleTableRow
                      key={role.id}
                      role={role}
                      isSystemRole={esRolSistema(role.nombre)}
                      isMutationPending={roleMutationPending}
                      onToggle={toggleRole}
                      onEdit={openEditRole}
                      onDelete={openDeleteRole}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div
            className="border-t bg-slate-50/60 px-4 py-2.5 text-xs text-muted-foreground"
            role={roleResultsAvailable ? "status" : undefined}
            aria-live={roleResultsAvailable ? "polite" : undefined}
            aria-atomic={roleResultsAvailable ? "true" : undefined}
          >
            {rolesQuery.isLoading
              ? "Cargando roles..."
              : rolesQuery.isError
                ? "No se pudieron cargar los roles."
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
            <AlertDialogTitle>
              ¿Eliminar el rol “{roleToDelete?.nombre}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el rol está asignado a algún
              usuario, el servidor impedirá eliminarlo; en ese caso podés
              desactivarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRole}
              disabled={isDeleteRolePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleteRolePending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Eliminar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
