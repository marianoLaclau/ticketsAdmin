import type { Dispatch, SetStateAction } from "react";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar rol" : "Nuevo rol"}</DialogTitle>
          <DialogDescription>
            El nombre identifica el perfil que se asigna a los usuarios.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Nombre *</Label>
            <Input
              id="role-name"
              value={form.nombre}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  nombre: event.target.value,
                }))
              }
              maxLength={100}
              disabled={isSystemRole}
            />
            {isSystemRole && (
              <p className="text-xs text-muted-foreground">
                El nombre de un rol del sistema es parte de la política de
                acceso y no se puede modificar.
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
              <p className="text-xs text-muted-foreground">
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
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar rol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
