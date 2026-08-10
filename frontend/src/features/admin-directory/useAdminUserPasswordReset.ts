import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminUsersQueryKey,
  useResetAdminUserPassword,
  type AdminUser,
} from "@workspace/api-client-react";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { toast } from "@/hooks/use-toast";
import type { AdminAccessState } from "@/lib/admin-access-state";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { getNewPasswordError } from "@/lib/password-policy";

interface UseAdminUserPasswordResetOptions {
  request: RequestInit;
  adminAccessState: AdminAccessState;
  accessVersion: number;
  accessGeneration: number;
}

export function useAdminUserPasswordReset({
  request,
  adminAccessState,
  accessVersion,
  accessGeneration,
}: UseAdminUserPasswordResetOptions) {
  const queryClient = useQueryClient();
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );
  const resetPassword = useResetAdminUserPassword({ request });
  const { reset: resetPasswordMutation } = resetPassword;
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const resetAccessBoundaryRef = useRef(accessBoundary);

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    setPasswordUser(null);
    setPassword("");
    setRepeatedPassword("");
    resetPasswordMutation();
  }, [accessBoundary, resetPasswordMutation]);

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
          if (!isCurrentOperation(operationAccessGeneration)) return;
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
