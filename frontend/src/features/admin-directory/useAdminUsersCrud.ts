import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  useUpdateAdminUser,
  type AdminRole,
  type AdminUser,
  type AdminUserInput,
  type AdminUserUpdate,
} from "@workspace/api-client-react";
import {
  createAdminUserForm,
  createEmptyAdminUserForm,
  createNewAdminUserForm,
  createRoleNameMap,
  type AdminUserFormState,
} from "@/features/admin-directory/model";
import { useAdminUserPasswordReset } from "@/features/admin-directory/useAdminUserPasswordReset";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { getNewPasswordError } from "@/lib/password-policy";

interface UseAdminUsersCrudOptions {
  roles: readonly AdminRole[];
}

export function useAdminUsersCrud({ roles }: UseAdminUsersCrudOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isCurrentOperation = useAdminOperationGuard();
  const roleById = useMemo(() => createRoleNameMap(roles), [roles]);

  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const passwordReset = useAdminUserPasswordReset({});

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<AdminUserFormState>(
    createEmptyAdminUserForm,
  );

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });

  const showError = (title: string) => (error: unknown) => {
    if (!isCurrentOperation()) return;
    toast({
      variant: "destructive",
      title,
      description: getAdminErrorMessage(error),
    });
  };

  const openCreateUser = () => {
    if (!isCurrentOperation() || createUser.isPending || updateUser.isPending) {
      return;
    }
    setEditingUser(null);
    setUserForm(createNewAdminUserForm(roles));
    setUserDialogOpen(true);
  };

  const openEditUser = (user: AdminUser) => {
    if (!isCurrentOperation() || createUser.isPending || updateUser.isPending) {
      return;
    }
    setEditingUser(user);
    setUserForm(createAdminUserForm(user));
    setUserDialogOpen(true);
  };

  const closeUserDialog = () => {
    setUserDialogOpen(false);
    setUserForm((form) => ({
      ...form,
      password: "",
      passwordRepetida: "",
    }));
  };

  const changeUserDialogOpen = (open: boolean) => {
    if (open) setUserDialogOpen(true);
    else closeUserDialog();
  };

  const saveUser = () => {
    if (!isCurrentOperation() || createUser.isPending || updateUser.isPending) {
      return;
    }
    const nombre = userForm.nombre.trim();
    const email = userForm.email.trim().toLowerCase();
    const username = userForm.username.trim().toLowerCase();
    const roleId = Number(userForm.roleId);
    if (
      !nombre ||
      !email ||
      !username ||
      !Number.isInteger(roleId) ||
      roleId < 1
    ) {
      toast({
        variant: "warning",
        title: "Faltan datos obligatorios",
        description:
          "Completá nombre, nombre de usuario, email y rol antes de guardar.",
      });
      return;
    }

    if (!editingUser) {
      const passwordError = getNewPasswordError(userForm.password);
      if (passwordError) {
        toast({
          variant: "warning",
          title: "Contraseña no válida",
          description: passwordError,
        });
        return;
      }
      if (userForm.password !== userForm.passwordRepetida) {
        toast({
          variant: "warning",
          title: "Las contraseñas no coinciden",
          description: "Revisá los dos campos de contraseña.",
        });
        return;
      }
    }

    const userName = `${nombre} ${userForm.apellido.trim()}`.trim();
    const roleName = roleById.get(roleId) ?? `Rol #${roleId}`;
    const onSuccess = () => {
      if (!isCurrentOperation()) return;
      closeUserDialog();
      void refreshUsers();
      toast({
        variant: "success",
        title: editingUser ? "Usuario actualizado" : "Usuario creado",
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
          onError: showError("No se pudo actualizar el usuario"),
        },
      );
      return;
    }

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
        onError: showError("No se pudo crear el usuario"),
      },
    );
  };

  const toggleUser = (user: AdminUser) => {
    if (!isCurrentOperation() || updateUser.isPending) {
      return;
    }
    updateUser.mutate(
      { id: user.id, data: { activo: !user.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation()) return;
          void refreshUsers();
          toast({
            variant: user.activo ? "warning" : "success",
            title: user.activo ? "Usuario desactivado" : "Usuario activado",
            description:
              `${user.nombre} ${user.apellido ?? ""}`.trim() +
              ` · ${user.email}`,
          });
        },
        onError: showError(
          user.activo
            ? "No se pudo desactivar el usuario"
            : "No se pudo activar el usuario",
        ),
      },
    );
  };

  return {
    roleById,
    userDialogOpen,
    editingUser,
    userForm,
    setUserForm,
    userMutationPending: createUser.isPending || updateUser.isPending,
    isUserStatusTogglePending: updateUser.isPending,
    openCreateUser,
    openEditUser,
    changeUserDialogOpen,
    saveUser,
    toggleUser,
    ...passwordReset,
  };
}
