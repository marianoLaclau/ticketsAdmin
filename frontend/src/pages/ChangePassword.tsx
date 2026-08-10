import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  useChangeOwnPassword,
  useLogout,
} from "@workspace/api-client-react";
import { PASSWORD_MAX_LENGTH } from "@workspace/password-policy";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import {
  getPasswordChangeErrorMessage,
  getUserErrorMessage,
} from "@/lib/error-messages";
import {
  AUTHENTICATED_HOME_PATH,
  getChangedPasswordError,
  getCurrentPasswordError,
  getPasswordChangeFormError,
  getRepeatedPasswordError,
} from "@/lib/password-change";
import {
  NEW_PASSWORD_HELP,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";
import {
  clearIdentityScopedCache,
  clearRevokedSessionState,
} from "@/lib/session-state";
import { publishSessionTransition } from "@/lib/session-sync";

const gsbLogo = new URL("../assets/gsb-logo.jpg", import.meta.url).href;

export default function ChangePassword() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const changePassword = useChangeOwnPassword();
  const logout = useLogout();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const currentError = currentPassword
    ? getCurrentPasswordError(currentPassword)
    : null;
  const newError = newPassword
    ? getChangedPasswordError(currentPassword, newPassword)
    : null;
  const repeatedError = repeatedPassword
    ? getRepeatedPasswordError(newPassword, repeatedPassword)
    : null;
  const formError = getPasswordChangeFormError({
    currentPassword,
    newPassword,
    repeatedPassword,
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (formError) return;
    setServerError(null);

    changePassword.mutate(
      {
        data: {
          password_actual: currentPassword,
          password_nueva: newPassword,
        },
      },
      {
        onSuccess: (user) => {
          clearIdentityScopedCache(queryClient, getGetMeQueryKey());
          queryClient.setQueryData(getGetMeQueryKey(), user);
          publishSessionTransition(import.meta.env.BASE_URL);
          toast({
            variant: "success",
            title: "Contraseña definitiva creada",
            description: "Tu cuenta ya está protegida y podés usar el sistema.",
          });
          navigate(AUTHENTICATED_HOME_PATH, { replace: true });
        },
        onError: (error) =>
          setServerError(getPasswordChangeErrorMessage(error)),
      },
    );
  };

  const handleLogout = () => {
    if (logout.isPending) return;
    logout.mutate(undefined as never, {
      onSuccess: () => {
        clearRevokedSessionState(queryClient);
        publishSessionTransition(import.meta.env.BASE_URL);
        window.location.replace(import.meta.env.BASE_URL);
      },
      onError: (error) => {
        setServerError(
          getUserErrorMessage(
            error,
            "No pudimos cerrar la sesión. Intentá nuevamente.",
          ),
        );
      },
    });
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="items-center space-y-3 pb-3 text-center">
          <img
            src={gsbLogo}
            alt="GSB Quality Services"
            className="h-24 w-24 object-contain"
          />
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">
              Creá tu contraseña definitiva
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingresaste con una contraseña temporal. Para proteger tu cuenta,
              cambiala antes de continuar.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Contraseña temporal</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setServerError(null);
                }}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="current-password"
                required
                aria-invalid={Boolean(currentError)}
                aria-describedby={
                  currentError ? "current-password-error" : undefined
                }
              />
              {currentError && (
                <p
                  id="current-password-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {currentError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">Contraseña nueva</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setServerError(null);
                }}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                maxLength={NEW_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(newError)}
                aria-describedby={
                  newError ? "new-password-error" : "new-password-help"
                }
              />
              {newError ? (
                <p
                  id="new-password-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {newError}
                </p>
              ) : (
                <p
                  id="new-password-help"
                  className="text-xs text-muted-foreground"
                >
                  {NEW_PASSWORD_HELP}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="repeated-password">
                Repetir contraseña nueva
              </Label>
              <PasswordInput
                id="repeated-password"
                value={repeatedPassword}
                onChange={(event) => {
                  setRepeatedPassword(event.target.value);
                  setServerError(null);
                }}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                maxLength={NEW_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(repeatedError)}
                aria-describedby={
                  repeatedError ? "repeated-password-error" : undefined
                }
              />
              {repeatedError && (
                <p
                  id="repeated-password-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {repeatedError}
                </p>
              )}
            </div>

            {serverError && (
              <div
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{serverError}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={changePassword.isPending || Boolean(formError)}
            >
              {changePassword.isPending ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {changePassword.isPending
                ? "Guardando..."
                : "Guardar y continuar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleLogout}
              disabled={logout.isPending || changePassword.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              {logout.isPending ? "Cerrando sesión..." : "Cerrar sesión"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
