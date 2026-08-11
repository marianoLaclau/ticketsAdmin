import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminUsersQueryKey,
  useResetAdminUserPassword,
  type AdminUser,
} from "@workspace/api-client-react";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { toast } from "@/hooks/use-toast";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { getNewPasswordError } from "@/lib/password-policy";

export function useAdminUserPasswordReset() {
  const queryClient = useQueryClient();
  const isCurrentOperation = useAdminOperationGuard();
  const resetPassword = useResetAdminUserPassword();
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");

  const closeResetPassword = () => {
    setPasswordUser(null);
    setPassword("");
    setRepeatedPassword("");
  };

  const openResetPassword = (user: AdminUser) => {
    if (!isCurrentOperation() || resetPassword.isPending) {
      return;
    }
    setPassword("");
    setRepeatedPassword("");
    setPasswordUser(user);
  };

  const savePassword = () => {
    if (!isCurrentOperation() || !passwordUser || resetPassword.isPending) {
      return;
    }
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
          if (!isCurrentOperation()) return;
          closeResetPassword();
          void queryClient.invalidateQueries({
            queryKey: getListAdminUsersQueryKey(),
          });
          toast({
            variant: "success",
            title: "Contraseña temporal asignada",
            description: `${passwordUser.nombre} deberá reemplazarla al ingresar. Sus sesiones anteriores fueron cerradas.`,
          });
        },
        onError: (error: unknown) => {
          if (!isCurrentOperation()) return;
          toast({
            variant: "destructive",
            title: "No se pudo actualizar la contraseña",
            description: getAdminErrorMessage(error),
          });
        },
      },
    );
  };

  return {
    passwordUser,
    password,
    setPassword,
    repeatedPassword,
    setRepeatedPassword,
    isPasswordResetPending: resetPassword.isPending,
    openResetPassword,
    closeResetPassword,
    savePassword,
  };
}
