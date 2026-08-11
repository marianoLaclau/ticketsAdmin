import { useState } from "react";
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
import { getAdminErrorMessage } from "@/lib/error-messages";
import { esRolSistema } from "@/lib/roles";

export function useAdminRolesCrud() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isCurrentOperation = useAdminOperationGuard();

  const createRole = useCreateAdminRole();
  const updateRole = useUpdateAdminRole();
  const deleteRole = useDeleteAdminRole();

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState<AdminRoleFormState>(
    createEmptyAdminRoleForm,
  );
  const roleMutationPending =
    createRole.isPending || updateRole.isPending || deleteRole.isPending;

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
  const refreshRoles = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminRolesQueryKey() });

  const showError = (title: string) => (error: unknown) => {
    if (!isCurrentOperation()) return;
    toast({
      variant: "destructive",
      title,
      description: getAdminErrorMessage(error),
    });
  };

  const openCreateRole = () => {
    if (!isCurrentOperation() || roleMutationPending) return;
    setEditingRole(null);
    setRoleForm(createEmptyAdminRoleForm());
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: AdminRole) => {
    if (!isCurrentOperation() || roleMutationPending) return;
    setEditingRole(role);
    setRoleForm(createAdminRoleForm(role));
    setRoleDialogOpen(true);
  };

  const openDeleteRole = (role: AdminRole) => {
    if (
      !isCurrentOperation() ||
      roleMutationPending ||
      esRolSistema(role.nombre)
    ) {
      return;
    }
    setRoleToDelete(role);
  };

  const saveRole = () => {
    if (!isCurrentOperation() || roleMutationPending) return;
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
      if (!isCurrentOperation()) return;
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
          onError: showError("No se pudo actualizar el rol"),
        },
      );
      return;
    }

    createRole.mutate(
      { data },
      {
        onSuccess,
        onError: showError("No se pudo crear el rol"),
      },
    );
  };

  const toggleRole = (role: AdminRole) => {
    if (
      !isCurrentOperation() ||
      roleMutationPending ||
      esRolSistema(role.nombre)
    ) {
      return;
    }
    updateRole.mutate(
      { id: role.id, data: { activo: !role.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation()) return;
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
        ),
      },
    );
  };

  const confirmDeleteRole = () => {
    if (
      !isCurrentOperation() ||
      !roleToDelete ||
      deleteRole.isPending ||
      esRolSistema(roleToDelete.nombre)
    ) {
      return;
    }
    const role = roleToDelete;
    deleteRole.mutate(
      { id: role.id },
      {
        onSuccess: () => {
          if (!isCurrentOperation()) return;
          setRoleToDelete(null);
          void refreshRoles();
          toast({
            variant: "success",
            title: "Rol eliminado",
            description: role.nombre,
          });
        },
        onError: showError("No se pudo eliminar el rol"),
      },
    );
  };

  const changeRoleDialogOpen = (open: boolean) => {
    if (!isCurrentOperation() || (open && roleMutationPending)) {
      return;
    }
    setRoleDialogOpen(open);
  };

  const changeRoleDeleteOpen = (open: boolean) => {
    if (!isCurrentOperation() || open) return;
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
