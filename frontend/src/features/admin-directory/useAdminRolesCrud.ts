import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminRolesQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminRole,
  useDeleteAdminRole,
  useUpdateAdminRole,
  type AdminRole,
  type AdminRoleInput,
  type AdminRoleUpdate,
} from "@workspace/api-client-react";
import {
  createAdminRoleForm,
  createEmptyAdminRoleForm,
  type AdminRoleFormState,
} from "@/features/admin-directory/model";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import type { AdminCredentialState } from "@/lib/admin-credential-state";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { esRolSistema } from "@/lib/roles";

interface UseAdminRolesCrudOptions {
  request: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
}

export function useAdminRolesCrud({
  request,
  adminAccessState,
  accessVersion,
  accessGeneration,
}: UseAdminRolesCrudOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );

  const createRole = useCreateAdminRole({ request });
  const updateRole = useUpdateAdminRole({ request });
  const deleteRole = useDeleteAdminRole({ request });
  const { reset: resetCreateRole } = createRole;
  const { reset: resetUpdateRole } = updateRole;
  const { reset: resetDeleteRole } = deleteRole;

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState<AdminRoleFormState>(
    createEmptyAdminRoleForm,
  );
  const resetAccessBoundaryRef = useRef(accessBoundary);
  const roleMutationPending =
    createRole.isPending || updateRole.isPending || deleteRole.isPending;

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
  const refreshRoles = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminRolesQueryKey() });

  const showError =
    (title: string, expectedGeneration: number) => (error: unknown) => {
      if (!isCurrentOperation(expectedGeneration)) return;
      toast({
        variant: "destructive",
        title,
        description: getAdminErrorMessage(error),
      });
    };

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

  const openDeleteRole = (role: AdminRole) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      roleMutationPending ||
      esRolSistema(role.nombre)
    ) {
      return;
    }
    setRoleToDelete(role);
  };

  const saveRole = () => {
    if (!isCurrentOperation(operationGeneration) || roleMutationPending) return;
    const operationAccessGeneration = operationGeneration;
    const nombre = roleForm.nombre.trim();
    if (!nombre) {
      toast({
        variant: "warning",
        title: "Falta el nombre del rol",
        description: "Ingresá un nombre antes de guardar.",
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
        variant: "success",
        title: editingRole ? "Rol actualizado" : "Rol creado",
        description: nombre,
      });
    };

    if (editingRole) {
      updateRole.mutate(
        { id: editingRole.id, data: data satisfies AdminRoleUpdate },
        {
          onSuccess,
          onError: showError(
            "No se pudo actualizar el rol",
            operationAccessGeneration,
          ),
        },
      );
      return;
    }

    createRole.mutate(
      { data },
      {
        onSuccess,
        onError: showError(
          "No se pudo crear el rol",
          operationAccessGeneration,
        ),
      },
    );
  };

  const toggleRole = (role: AdminRole) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      roleMutationPending ||
      esRolSistema(role.nombre)
    ) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
    updateRole.mutate(
      { id: role.id, data: { activo: !role.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          void refreshRoles();
          void refreshUsers();
          toast({
            variant: role.activo ? "warning" : "success",
            title: role.activo ? "Rol desactivado" : "Rol activado",
            description: role.nombre,
          });
        },
        onError: showError(
          role.activo
            ? "No se pudo desactivar el rol"
            : "No se pudo activar el rol",
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
    ) {
      return;
    }
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
            variant: "success",
            title: "Rol eliminado",
            description: role.nombre,
          });
        },
        onError: showError(
          "No se pudo eliminar el rol",
          operationAccessGeneration,
        ),
      },
    );
  };

  const changeRoleDialogOpen = (open: boolean) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      (open && roleMutationPending)
    ) {
      return;
    }
    setRoleDialogOpen(open);
  };

  const changeRoleDeleteOpen = (open: boolean) => {
    if (!isCurrentOperation(operationGeneration) || open) return;
    setRoleToDelete(null);
  };

  return {
    roleDialogOpen,
    editingRole,
    editingSystemRole: Boolean(editingRole && esRolSistema(editingRole.nombre)),
    roleToDelete,
    roleForm,
    setRoleForm,
    roleMutationPending,
    isDeleteRolePending: deleteRole.isPending,
    openCreateRole,
    openEditRole,
    openDeleteRole,
    saveRole,
    toggleRole,
    confirmDeleteRole,
    changeRoleDialogOpen,
    changeRoleDeleteOpen,
  };
}
