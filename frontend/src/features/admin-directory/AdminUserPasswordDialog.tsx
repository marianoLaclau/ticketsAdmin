import type { AdminUser } from "@workspace/api-client-react";
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
  const passwordError = getNewPasswordError(password);
  const visiblePasswordError = password.length > 0 ? passwordError : null;
  const passwordMismatch =
    repeatedPassword.length > 0 && repeatedPassword !== password;
  const userDescription = user
    ? `${user.nombre} ${user.apellido ?? ""} (${user.email}). `
    : "";

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-600" />
            Asignar contraseña temporal
          </DialogTitle>
          <DialogDescription>
            {userDescription}Al guardar se cerrarán sus sesiones. En el próximo
            ingreso deberá crear su contraseña definitiva antes de usar el
            sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="password-nueva">Nueva contraseña temporal</Label>
            <PasswordInput
              id="password-nueva"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              minLength={NEW_PASSWORD_MIN_LENGTH}
              maxLength={NEW_PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              autoFocus
              required
              aria-invalid={Boolean(visiblePasswordError)}
              aria-describedby={
                visiblePasswordError
                  ? "password-nueva-error"
                  : "password-nueva-help"
              }
            />
            {visiblePasswordError ? (
              <p
                id="password-nueva-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {visiblePasswordError}
              </p>
            ) : (
              <p
                id="password-nueva-help"
                className="text-xs text-muted-foreground"
              >
                {NEW_PASSWORD_HELP}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-repetida">
              Repetir contraseña temporal
            </Label>
            <PasswordInput
              id="password-repetida"
              value={repeatedPassword}
              onChange={(event) => onRepeatedPasswordChange(event.target.value)}
              minLength={NEW_PASSWORD_MIN_LENGTH}
              maxLength={NEW_PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              required
              aria-invalid={passwordMismatch}
              aria-describedby={
                passwordMismatch ? "password-repetida-error" : undefined
              }
            />
            {passwordMismatch && (
              <p
                id="password-repetida-error"
                className="text-xs text-destructive"
                role="alert"
              >
                Las contraseñas no coinciden.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={
              isSaving ||
              Boolean(passwordError) ||
              password !== repeatedPassword
            }
          >
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Asignar contraseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
