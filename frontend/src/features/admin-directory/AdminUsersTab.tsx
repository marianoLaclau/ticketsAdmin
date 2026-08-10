import { useEffect, useMemo } from "react";
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  useListAdminRoles,
  useListAdminUsers,
} from "@workspace/api-client-react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { AdminUserFormDialog } from "@/features/admin-directory/AdminUserFormDialog";
import { AdminUserPasswordDialog } from "@/features/admin-directory/AdminUserPasswordDialog";
import { AdminUsersPagination } from "@/features/admin-directory/AdminUsersPagination";
import { AdminUserTableRow } from "@/features/admin-directory/AdminUserTableRow";
import { useAdminUsersCrud } from "@/features/admin-directory/useAdminUsersCrud";
import type {
  AdminDirectoryUrlNavigation,
  AdminDirectoryUsersUrlUpdate,
} from "@/features/admin-directory/useAdminDirectoryUrl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { getAdminErrorMessage } from "@/lib/error-messages";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import type { AdminDirectoryUsersUrlState } from "@/lib/admin-directory-url";
import type { AdminAccessState } from "@/lib/admin-access-state";

interface AdminUsersTabProps {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminAccessState;
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
  const hasAdminAccess = adminAccessState === "ready";

  // Se obtiene el directorio completo admitido por la API para resolver role_id
  // en la tabla de usuarios y alimentar tanto filtros como formularios.
  const roleCatalogParams = { page: 1, limit: 100 };
  const roleCatalogQueryKey = [
    ...getListAdminRolesQueryKey(roleCatalogParams),
    "admin-access",
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
  const {
    roleById,
    userDialogOpen,
    editingUser,
    userForm,
    setUserForm,
    passwordUser,
    password,
    setPassword,
    repeatedPassword,
    setRepeatedPassword,
    userMutationPending,
    isUserStatusTogglePending,
    isPasswordResetPending,
    openCreateUser,
    openEditUser,
    changeUserDialogOpen,
    saveUser,
    toggleUser,
    openResetPassword,
    closeResetPassword,
    savePassword,
  } = useAdminUsersCrud({
    request,
    adminAccessState,
    accessVersion,
    accessGeneration,
    roles,
  });

  // ---------- Usuarios ----------
  const userSearch = urlState.search ?? "";
  const userRoleFilter = urlState.roleId ? String(urlState.roleId) : "_all";
  const userStatusFilter = urlState.status ?? "_all";
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
      ...(userStatusFilter === "active" ? { activo: true } : {}),
      ...(userStatusFilter === "inactive" ? { activo: false } : {}),
    }),
    [userPage, userPageSize, userSearch, userStatusFilter, urlState.roleId],
  );
  const userListQueryKey = [
    ...getListAdminUsersQueryKey(userListParams),
    "admin-access",
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
  }, [updateUrlState, userPage, userPageSize, userTotalPages, usersQuery.data]);

  const updateUserSearch = (value: string) => {
    updateUrlState((current) => {
      const next = { ...current, page: 1 };
      if (value.trim()) next.search = value;
      else delete next.search;
      return next;
    });
  };

  const selectUserRole = (value: string) => {
    if (value === "_all") {
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
    if (value !== "_all" && value !== "active" && value !== "inactive") return;
    updateUrlState((current) => {
      const next = { ...current, page: 1 };
      if (value === "_all") delete next.status;
      else next.status = value;
      return next;
    });
  };

  const goToUserPage = (page: number) => {
    if (!Number.isSafeInteger(page) || page < 1) return;
    updateUrlState((current) => ({ ...current, page }), "push");
  };

  if (adminAccessState !== "ready") {
    return (
      <TabsContent value="users">
        <AdminAccessNotice
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
                    {role.activo ? "" : " (inactivo)"}
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
            type="button"
            onClick={openCreateUser}
            disabled={userMutationPending || !roles.some((role) => role.activo)}
            className="w-full sm:w-auto sm:self-start xl:self-auto"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nuevo usuario
          </Button>
        </div>

        {!roleCatalogQuery.isLoading &&
          !roleCatalogQuery.isError &&
          !roles.some((role) => role.activo) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Necesitás un rol activo</AlertTitle>
              <AlertDescription>
                Creá o activá un rol para habilitar la creación de usuarios.
              </AlertDescription>
            </Alert>
          )}

        {roleCatalogQuery.isError && !usersQuery.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>No se pudo cargar el catálogo de roles</AlertTitle>
            <AlertDescription>
              {getAdminErrorMessage(roleCatalogQuery.error)}
            </AlertDescription>
          </Alert>
        )}

        {usersQuery.isFetching ? (
          <LoadingStatus>
            {usersQuery.isLoading
              ? "Cargando usuarios"
              : "Actualizando usuarios"}
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
            <Table
              className={userTableHasWideRows ? "min-w-[1100px]" : undefined}
            >
              <TableCaption className="sr-only">
                Directorio de usuarios
              </TableCaption>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="w-[70px] text-xs uppercase">
                    ID
                  </TableHead>
                  <TableHead className="text-xs uppercase">Nombre</TableHead>
                  <TableHead className="text-xs uppercase">
                    Nombre de usuario
                  </TableHead>
                  <TableHead className="text-xs uppercase">Email</TableHead>
                  <TableHead className="text-xs uppercase">Rol</TableHead>
                  <TableHead className="text-xs uppercase">Estado</TableHead>
                  <TableHead className="text-xs uppercase">
                    Actualizado
                  </TableHead>
                  <TableHead className="w-[130px] text-right text-xs uppercase">
                    Acciones
                  </TableHead>
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
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-sm text-destructive"
                    >
                      <span role="alert">
                        {getAdminErrorMessage(usersQuery.error)}
                      </span>
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      <span role="status">
                        No hay usuarios que coincidan con los filtros.
                      </span>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <AdminUserTableRow
                      key={user.id}
                      user={user}
                      roleName={roleById.get(user.role_id)}
                      isStatusToggleDisabled={isUserStatusTogglePending}
                      isEditDisabled={userMutationPending}
                      isPasswordResetDisabled={isPasswordResetPending}
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
        onOpenChange={changeUserDialogOpen}
        onFormChange={setUserForm}
        onSave={saveUser}
      />

      <AdminUserPasswordDialog
        user={passwordUser}
        password={password}
        repeatedPassword={repeatedPassword}
        isSaving={isPasswordResetPending}
        onPasswordChange={setPassword}
        onRepeatedPasswordChange={setRepeatedPassword}
        onClose={closeResetPassword}
        onSave={savePassword}
      />
    </>
  );
}
