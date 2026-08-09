import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  useResetAdminUserPassword,
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
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import type { AdminCredentialState } from "@/lib/admin-credential-state";
import { getNewPasswordError } from "@/lib/password-policy";

interface UseAdminUsersCrudOptions {
  request: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
  roles: readonly AdminRole[];
}

export function useAdminUsersCrud({
  request,
  adminAccessState,
  accessVersion,
  accessGeneration,
  roles,
}: UseAdminUsersCrudOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );
  const roleById = useMemo(() => createRoleNameMap(roles), [roles]);

  const createUser = useCreateAdminUser({ request });
  const updateUser = useUpdateAdminUser({ request });
  const resetPassword = useResetAdminUserPassword({ request });
  const { reset: resetCreateUser } = createUser;
  const { reset: resetUpdateUser } = updateUser;
  const { reset: resetUserPassword } = resetPassword;

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<AdminUserFormState>(
    createEmptyAdminUserForm,
  );
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const resetAccessBoundaryRef = useRef(accessBoundary);

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });

  const showError =
    (title: string, expectedGeneration: number) => (error: unknown) => {
      if (!isCurrentOperation(expectedGeneration)) return;
      toast({
        variant: "destructive",
        title,
        description: adminErrorMessage(error),
      });
    };

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    setUserDialogOpen(false);
    setEditingUser(null);
    setUserForm(createEmptyAdminUserForm());
    setPasswordUser(null);
    setPassword("");
    setRepeatedPassword("");
    resetCreateUser();
    resetUpdateUser();
    resetUserPassword();
  }, [accessBoundary, resetCreateUser, resetUpdateUser, resetUserPassword]);

  const closeResetPassword = () => {
    setPasswordUser(null);
    setPassword("");
    setRepeatedPassword("");
  };

  const openResetPassword = (user: AdminUser) => {
    if (!isCurrentOperation(operationGeneration) || resetPassword.isPending) {
      return;
    }
    setPassword("");
    setRepeatedPassword("");
    setPasswordUser(user);
  };

  const savePassword = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      !passwordUser ||
      resetPassword.isPending
    ) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
    const passwordError = getNewPasswordError(password);
    if (passwordError) {
      toast({
        variant: "warning",
        title: "Contraseña no válida",
        description: passwordError,
      });
      return;
    }
    if (password !== repeatedPassword) {
      toast({
        variant: "warning",
        title: "Las contraseñas no coinciden",
        description: "Revisá los dos campos de contraseña.",
      });
      return;
    }
    resetPassword.mutate(
      { id: passwordUser.id, data: { password } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          closeResetPassword();
          void refreshUsers();
          toast({
            variant: "success",
            title: "Contraseña temporal asignada",
            description: `${passwordUser.nombre} deberá reemplazarla al ingresar. Sus sesiones anteriores fueron cerradas.`,
          });
        },
        onError: showError(
          "No se pudo actualizar la contraseña",
          operationAccessGeneration,
        ),
      },
    );
  };

  const openCreateUser = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) {
      return;
    }
    setEditingUser(null);
    setUserForm(createNewAdminUserForm(roles));
    setUserDialogOpen(true);
  };

  const openEditUser = (user: AdminUser) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) {
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
    if (
      !isCurrentOperation(operationGeneration) ||
      createUser.isPending ||
      updateUser.isPending
    ) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
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
      if (!isCurrentOperation(operationAccessGeneration)) return;
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
          onError: showError(
            "No se pudo actualizar el usuario",
            operationAccessGeneration,
          ),
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
        onError: showError(
          "No se pudo crear el usuario",
          operationAccessGeneration,
        ),
      },
    );
  };

  const toggleUser = (user: AdminUser) => {
    if (!isCurrentOperation(operationGeneration) || updateUser.isPending) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
    updateUser.mutate(
      { id: user.id, data: { activo: !user.activo } },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
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
          operationAccessGeneration,
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
    passwordUser,
    password,
    setPassword,
    repeatedPassword,
    setRepeatedPassword,
    userMutationPending: createUser.isPending || updateUser.isPending,
    isUserStatusTogglePending: updateUser.isPending,
    isPasswordResetPending: resetPassword.isPending,
    openCreateUser,
    openEditUser,
    changeUserDialogOpen,
    saveUser,
    toggleUser,
    openResetPassword,
    closeResetPassword,
    savePassword,
  };
}
