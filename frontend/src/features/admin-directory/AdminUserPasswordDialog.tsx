import type { AdminUser } from "@workspace/api-client-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  NEW_PASSWORD_HELP,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordError,
} from "@/lib/password-policy";

interface AdminUserPasswordDialogProps {
  user: AdminUser | null;
  password: string;
  repeatedPassword: string;
  isSaving: boolean;
  onPasswordChange: (password: string) => void;
  onRepeatedPasswordChange: (password: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function AdminUserPasswordDialog({
  user,
  password,
  repeatedPassword,
  isSaving,
  onPasswordChange,
  onRepeatedPasswordChange,
  onClose,
  onSave,
}: AdminUserPasswordDialogProps) {
  const [submitted, setSubmitted] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const repeatedPasswordInputRef = useRef<HTMLInputElement>(null);
  const passwordError = getNewPasswordError(password);
  const visiblePasswordError =
    password.length > 0 || submitted ? passwordError : null;
  const passwordMismatch = repeatedPassword !== password;
  const repeatedPasswordError =
    repeatedPassword.length === 0 && submitted
      ? "Repetí la contraseña temporal."
      : repeatedPassword.length > 0 && passwordMismatch
        ? "Las contraseñas no coinciden."
        : null;
  const userDescription = user
    ? `${`${user.nombre} ${user.apellido ?? ""}`.trim()} (${user.email}). `
    : "";

  useEffect(() => {
    setSubmitted(false);
  }, [user?.id]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setSubmitted(true);
    if (passwordError) {
      passwordInputRef.current?.focus();
      return;
    }
    if (!repeatedPassword || passwordMismatch) {
      repeatedPasswordInputRef.current?.focus();
      return;
    }
    onSave();
  };

  const handleClose = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[420px]">
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Asignar contraseña temporal
            </DialogTitle>
            <DialogDescription>
              {userDescription}Al guardar se cerrarán sus sesiones. En el
              próximo ingreso deberá crear su contraseña definitiva antes de
              usar el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="password-nueva">Nueva contraseña temporal</Label>
            <PasswordInput
              id="password-nueva"
              ref={passwordInputRef}
              value={password}
              onChange={(event) => {
                setSubmitted(false);
                onPasswordChange(event.target.value);
              }}
              minLength={NEW_PASSWORD_MIN_LENGTH}
              maxLength={NEW_PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              visibilityLabel="contraseña temporal nueva"
              required
              aria-invalid={Boolean(visiblePasswordError)}
              aria-describedby={`password-nueva-help${visiblePasswordError ? " password-nueva-error" : ""}`}
            />
            <p
              id="password-nueva-help"
              className="text-xs text-muted-foreground"
            >
              {NEW_PASSWORD_HELP}
            </p>
            {visiblePasswordError && (
              <p
                id="password-nueva-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {visiblePasswordError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-repetida">
              Repetir contraseña temporal
            </Label>
            <PasswordInput
              id="password-repetida"
              ref={repeatedPasswordInputRef}
              value={repeatedPassword}
              onChange={(event) => {
                setSubmitted(false);
                onRepeatedPasswordChange(event.target.value);
              }}
              minLength={NEW_PASSWORD_MIN_LENGTH}
              maxLength={NEW_PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              visibilityLabel="repetición de la contraseña temporal"
              required
              aria-invalid={Boolean(repeatedPasswordError)}
              aria-describedby={`password-repetida-help${repeatedPasswordError ? " password-repetida-error" : ""}`}
            />
            <p
              id="password-repetida-help"
              className="text-xs text-muted-foreground"
            >
              Debe coincidir exactamente con la contraseña temporal nueva.
            </p>
            {repeatedPasswordError && (
              <p
                id="password-repetida-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {repeatedPasswordError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Asignar contraseña
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
