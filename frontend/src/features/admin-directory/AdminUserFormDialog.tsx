import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
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

interface AdminUserValidationErrors {
  nombre?: string;
  username?: string;
  email?: string;
  password?: string;
  passwordRepetida?: string;
  roleId?: string;
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
  const [validationErrors, setValidationErrors] =
    useState<AdminUserValidationErrors>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const repeatedPasswordInputRef = useRef<HTMLInputElement>(null);
  const roleTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setValidationErrors({});
  }, [isEditing, open]);

  const livePasswordError =
    form.password.length > 0 ? getNewPasswordError(form.password) : null;
  const passwordError = livePasswordError ?? validationErrors.password ?? null;
  const livePasswordMismatch =
    form.passwordRepetida.length > 0 && form.passwordRepetida !== form.password;
  const repeatedPasswordError = livePasswordMismatch
    ? "Las contraseñas no coinciden."
    : (validationErrors.passwordRepetida ?? null);

  const clearValidationError = (field: keyof AdminUserValidationErrors) => {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextErrors: AdminUserValidationErrors = {};
    if (!form.nombre.trim()) nextErrors.nombre = "Ingresá el nombre.";
    if (!form.username.trim()) {
      nextErrors.username = "Ingresá el nombre de usuario.";
    }
    if (!form.email.trim()) {
      nextErrors.email = "Ingresá el email.";
    } else if (emailInputRef.current?.validity.valid === false) {
      nextErrors.email = "Ingresá un email válido.";
    }

    if (!isEditing) {
      const nextPasswordError = getNewPasswordError(form.password);
      if (nextPasswordError) nextErrors.password = nextPasswordError;
      if (!form.passwordRepetida) {
        nextErrors.passwordRepetida = "Repetí la contraseña temporal.";
      } else if (form.passwordRepetida !== form.password) {
        nextErrors.passwordRepetida = "Las contraseñas no coinciden.";
      }
    }

    const roleId = Number(form.roleId);
    if (!Number.isInteger(roleId) || roleId < 1) {
      nextErrors.roleId = "Seleccioná un rol.";
    }

    setValidationErrors(nextErrors);
    if (nextErrors.nombre) nameInputRef.current?.focus();
    else if (nextErrors.username) usernameInputRef.current?.focus();
    else if (nextErrors.email) emailInputRef.current?.focus();
    else if (nextErrors.password) passwordInputRef.current?.focus();
    else if (nextErrors.passwordRepetida) {
      repeatedPasswordInputRef.current?.focus();
    } else if (nextErrors.roleId) roleTriggerRef.current?.focus();
    else onSave();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setValidationErrors({});
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Editar usuario" : "Nuevo usuario"}
            </DialogTitle>
            <DialogDescription>
              Definí sus datos, rol previsto y estado operativo. Los campos
              marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Nombre *</Label>
              <Input
                id="user-name"
                ref={nameInputRef}
                value={form.nombre}
                onChange={(event) => {
                  clearValidationError("nombre");
                  onFormChange((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }));
                }}
                maxLength={100}
                required
                aria-invalid={Boolean(validationErrors.nombre)}
                aria-describedby={
                  validationErrors.nombre ? "user-name-error" : undefined
                }
              />
              {validationErrors.nombre && (
                <p
                  id="user-name-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {validationErrors.nombre}
                </p>
              )}
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
              ref={usernameInputRef}
              value={form.username}
              onChange={(event) => {
                clearValidationError("username");
                onFormChange((current) => ({
                  ...current,
                  username: event.target.value,
                }));
              }}
              maxLength={60}
              autoComplete="off"
              required
              aria-invalid={Boolean(validationErrors.username)}
              aria-describedby={[
                "user-username-help",
                validationErrors.username ? "user-username-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <p
              id="user-username-help"
              className="text-xs text-muted-foreground"
            >
              Es lo que el usuario va a escribir para iniciar sesión — no tiene
              que ser el email.
            </p>
            {validationErrors.username && (
              <p
                id="user-username-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {validationErrors.username}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              ref={emailInputRef}
              type="email"
              value={form.email}
              onChange={(event) => {
                clearValidationError("email");
                onFormChange((current) => ({
                  ...current,
                  email: event.target.value,
                }));
              }}
              maxLength={254}
              autoComplete="email"
              required
              aria-invalid={Boolean(validationErrors.email)}
              aria-describedby={
                validationErrors.email ? "user-email-error" : undefined
              }
            />
            {validationErrors.email && (
              <p
                id="user-email-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {validationErrors.email}
              </p>
            )}
          </div>
          {!isEditing && (
            <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Credenciales iniciales — se las entregás vos al usuario
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">Contraseña temporal *</Label>
                <PasswordInput
                  id="user-password"
                  ref={passwordInputRef}
                  value={form.password}
                  onChange={(event) => {
                    clearValidationError("password");
                    onFormChange((current) => ({
                      ...current,
                      password: event.target.value,
                    }));
                  }}
                  minLength={NEW_PASSWORD_MIN_LENGTH}
                  maxLength={NEW_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  visibilityLabel="contraseña temporal"
                  required
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={`user-password-help${passwordError ? " user-password-error" : ""}`}
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
                  ref={repeatedPasswordInputRef}
                  value={form.passwordRepetida}
                  onChange={(event) => {
                    clearValidationError("passwordRepetida");
                    onFormChange((current) => ({
                      ...current,
                      passwordRepetida: event.target.value,
                    }));
                  }}
                  minLength={NEW_PASSWORD_MIN_LENGTH}
                  maxLength={NEW_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  visibilityLabel="repetición de la contraseña temporal"
                  required
                  aria-invalid={Boolean(repeatedPasswordError)}
                  aria-describedby={`user-password-help${repeatedPasswordError ? " user-password-repeat-error" : ""}`}
                />
                {repeatedPasswordError && (
                  <p
                    id="user-password-repeat-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {repeatedPasswordError}
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
              onValueChange={(roleId) => {
                clearValidationError("roleId");
                onFormChange((current) => ({ ...current, roleId }));
              }}
            >
              <SelectTrigger
                id="user-role"
                ref={roleTriggerRef}
                aria-invalid={Boolean(validationErrors.roleId)}
                aria-describedby={
                  validationErrors.roleId ? "user-role-error" : undefined
                }
              >
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
            {validationErrors.roleId && (
              <p
                id="user-role-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {validationErrors.roleId}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="user-active">Usuario activo</Label>
              <p
                id="user-active-help"
                className="text-xs text-muted-foreground"
              >
                Puede utilizarse en futuras asignaciones de acceso.
              </p>
            </div>
            <Switch
              id="user-active"
              checked={form.activo}
              onCheckedChange={(activo) =>
                onFormChange((current) => ({ ...current, activo }))
              }
              aria-describedby="user-active-help"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Guardar usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
