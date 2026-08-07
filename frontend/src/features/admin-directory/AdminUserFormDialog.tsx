import type { Dispatch, SetStateAction } from "react";
import type { AdminRole } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AdminUserFormState } from "@/features/admin-directory/model";
import {
  NEW_PASSWORD_HELP,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordError,
} from "@/lib/password-policy";

interface AdminUserFormDialogProps {
  open: boolean;
  isEditing: boolean;
  roles: readonly AdminRole[];
  form: AdminUserFormState;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<AdminUserFormState>>;
  onSave: () => void;
}

export function AdminUserFormDialog({
  open,
  isEditing,
  roles,
  form,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: AdminUserFormDialogProps) {
  const passwordError =
    form.password.length > 0 ? getNewPasswordError(form.password) : null;
  const passwordMismatch =
    form.passwordRepetida.length > 0 && form.passwordRepetida !== form.password;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar usuario" : "Nuevo usuario"}
          </DialogTitle>
          <DialogDescription>
            Definí sus datos, rol previsto y estado operativo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Nombre *</Label>
              <Input
                id="user-name"
                value={form.nombre}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-last-name">Apellido</Label>
              <Input
                id="user-last-name"
                value={form.apellido}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    apellido: event.target.value,
                  }))
                }
                maxLength={100}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-username">Nombre de usuario *</Label>
            <Input
              id="user-username"
              value={form.username}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              maxLength={60}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Es lo que el usuario va a escribir para iniciar sesión — no tiene
              que ser el email.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              maxLength={254}
            />
          </div>
          {!isEditing && (
            <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <KeyRound className="h-3.5 w-3.5" /> Credenciales iniciales —
                  se las entregás vos al usuario
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">Contraseña temporal *</Label>
                <PasswordInput
                  id="user-password"
                  value={form.password}
                  onChange={(event) =>
                    onFormChange((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  minLength={NEW_PASSWORD_MIN_LENGTH}
                  maxLength={NEW_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? "user-password-error" : "user-password-help"
                  }
                />
                {passwordError && (
                  <p
                    id="user-password-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {passwordError}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password-repeat">
                  Repetir contraseña temporal *
                </Label>
                <PasswordInput
                  id="user-password-repeat"
                  value={form.passwordRepetida}
                  onChange={(event) =>
                    onFormChange((current) => ({
                      ...current,
                      passwordRepetida: event.target.value,
                    }))
                  }
                  minLength={NEW_PASSWORD_MIN_LENGTH}
                  maxLength={NEW_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  required
                  aria-invalid={passwordMismatch}
                  aria-describedby={
                    passwordMismatch
                      ? "user-password-repeat-error"
                      : "user-password-help"
                  }
                />
                {passwordMismatch && (
                  <p
                    id="user-password-repeat-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    Las contraseñas no coinciden.
                  </p>
                )}
              </div>
              <p
                id="user-password-help"
                className="text-xs text-muted-foreground sm:col-span-2"
              >
                {NEW_PASSWORD_HELP} El usuario deberá reemplazarla en su primer
                ingreso.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Rol *</Label>
            <Select
              value={form.roleId}
              onValueChange={(roleId) =>
                onFormChange((current) => ({ ...current, roleId }))
              }
            >
              <SelectTrigger id="user-role">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem
                    key={role.id}
                    value={String(role.id)}
                    disabled={!role.activo && String(role.id) !== form.roleId}
                  >
                    {role.nombre}
                    {role.activo ? "" : " (inactivo)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="user-active">Usuario activo</Label>
              <p className="text-xs text-muted-foreground">
                Puede utilizarse en futuras asignaciones de acceso.
              </p>
            </div>
            <Switch
              id="user-active"
              checked={form.activo}
              onCheckedChange={(activo) =>
                onFormChange((current) => ({ ...current, activo }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
