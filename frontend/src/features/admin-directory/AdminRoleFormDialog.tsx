import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AdminRoleFormState } from "@/features/admin-directory/model";

interface AdminRoleFormDialogProps {
  open: boolean;
  isEditing: boolean;
  isSystemRole: boolean;
  form: AdminRoleFormState;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<AdminRoleFormState>>;
  onSave: () => void;
}

export function AdminRoleFormDialog({
  open,
  isEditing,
  isSystemRole,
  form,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: AdminRoleFormDialogProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setNameError(null);
  }, [isEditing, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    if (!form.nombre.trim()) {
      setNameError("Ingresá un nombre para el rol.");
      nameInputRef.current?.focus();
      return;
    }
    setNameError(null);
    onSave();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setNameError(null);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar rol" : "Nuevo rol"}</DialogTitle>
            <DialogDescription>
              El nombre identifica el perfil que se asigna a los usuarios. Los
              campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Nombre *</Label>
            <Input
              id="role-name"
              ref={nameInputRef}
              value={form.nombre}
              onChange={(event) => {
                setNameError(null);
                onFormChange((current) => ({
                  ...current,
                  nombre: event.target.value,
                }));
              }}
              maxLength={100}
              required
              disabled={isSystemRole}
              aria-invalid={Boolean(nameError)}
              aria-describedby={
                [
                  isSystemRole ? "role-name-system-help" : null,
                  nameError ? "role-name-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            {isSystemRole && (
              <p
                id="role-name-system-help"
                className="text-xs text-muted-foreground"
              >
                El nombre de un rol del sistema es parte de la política de
                acceso y no se puede modificar.
              </p>
            )}
            {nameError && (
              <p
                id="role-name-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {nameError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-description">Descripción</Label>
            <Textarea
              id="role-description"
              value={form.descripcion}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  descripcion: event.target.value,
                }))
              }
              maxLength={500}
              rows={4}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="role-active">Rol activo</Label>
              <p
                id="role-active-help"
                className="text-xs text-muted-foreground"
              >
                {isSystemRole
                  ? "Los roles del sistema deben permanecer activos."
                  : "Los roles inactivos no permiten iniciar ni conservar una sesión."}
              </p>
            </div>
            <Switch
              id="role-active"
              checked={form.activo}
              onCheckedChange={(activo) =>
                onFormChange((current) => ({ ...current, activo }))
              }
              disabled={isSystemRole}
              aria-describedby="role-active-help"
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
              Guardar rol
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
