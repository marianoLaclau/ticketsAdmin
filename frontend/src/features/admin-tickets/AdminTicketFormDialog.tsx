import type { Dispatch, FormEvent, SetStateAction } from "react";
import { TicketEstado, TicketPrioridad } from "@workspace/api-client-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TicketVersionConflictAlert } from "@/components/tickets/TicketVersionConflictAlert";
import { getEstadoLabel } from "@/lib/estados";
import type {
  AdminTicketForm,
  AdminTicketTextField,
} from "@/lib/admin-ticket-form";

const CAMPOS_TEXTO: Array<{
  campo: AdminTicketTextField;
  label: string;
  requerido?: boolean;
}> = [
  { campo: "conversation_id", label: "Conversation ID", requerido: true },
  { campo: "hora", label: "Hora (HH:MM)", requerido: true },
  { campo: "nombre", label: "Nombre", requerido: true },
  { campo: "apellido", label: "Apellido" },
  { campo: "telefono", label: "Teléfono" },
  { campo: "dni", label: "DNI" },
  { campo: "empresa", label: "Empresa" },
  { campo: "email", label: "Email" },
  { campo: "audio_url", label: "URL del audio" },
];

interface AdminTicketFormDialogProps {
  open: boolean;
  editingId: number | null;
  form: AdminTicketForm;
  isSaving: boolean;
  isReloading: boolean;
  hasVersionConflict: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<AdminTicketForm>>;
  onReloadLatest: () => void;
  onSave: () => void;
}

export function AdminTicketFormDialog({
  open,
  editingId,
  form,
  isSaving,
  isReloading,
  hasVersionConflict,
  onOpenChange,
  onFormChange,
  onReloadLatest,
  onSave,
}: AdminTicketFormDialogProps) {
  const isSaveDisabled =
    isSaving ||
    isReloading ||
    hasVersionConflict ||
    !form.conversation_id.trim() ||
    !form.hora.trim() ||
    !form.nombre.trim() ||
    !form.motivo.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSaveDisabled) onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-4 sm:max-w-[640px] sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {editingId === null
              ? "Nuevo registro"
              : `Editar registro #${editingId}`}
          </DialogTitle>
          <DialogDescription>
            {editingId === null
              ? "Alta manual directa en la base (el flujo normal es la ingesta automática por llamada)."
              : "Edición directa de los campos habilitados del registro."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <p
            id="admin-ticket-required-fields"
            className="text-xs text-muted-foreground"
          >
            Los campos marcados con * son obligatorios.
          </p>
          {hasVersionConflict && (
            <TicketVersionConflictAlert
              isReloading={isReloading}
              onReload={onReloadLatest}
            />
          )}
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            {CAMPOS_TEXTO.map(({ campo, label, requerido }) => (
              <div key={campo} className="space-y-1">
                <Label htmlFor={`admin-ticket-${campo}`} className="text-xs">
                  {label}
                  {requerido && (
                    <span className="text-red-500" aria-hidden="true">
                      {" "}
                      *
                    </span>
                  )}
                </Label>
                <Input
                  id={`admin-ticket-${campo}`}
                  value={form[campo] ?? ""}
                  onChange={(event) =>
                    onFormChange((current) => ({
                      ...current,
                      [campo]: event.target.value,
                    }))
                  }
                  disabled={campo === "conversation_id" && editingId !== null}
                  required={requerido}
                  aria-describedby={
                    requerido ? "admin-ticket-required-fields" : undefined
                  }
                  className="h-8 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="admin-ticket-state" className="text-xs">
                Estado
              </Label>
              <Select
                value={form.estado}
                onValueChange={(estado) =>
                  onFormChange((current) => ({
                    ...current,
                    estado: estado as AdminTicketForm["estado"],
                  }))
                }
              >
                <SelectTrigger
                  id="admin-ticket-state"
                  className="h-9 text-sm sm:h-8"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TicketEstado).map((e) => (
                    <SelectItem key={e} value={e}>
                      {getEstadoLabel(e).toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-ticket-priority" className="text-xs">
                Prioridad
              </Label>
              <Select
                value={form.prioridad}
                onValueChange={(prioridad) =>
                  onFormChange((current) => ({
                    ...current,
                    prioridad: prioridad as AdminTicketForm["prioridad"],
                  }))
                }
              >
                <SelectTrigger
                  id="admin-ticket-priority"
                  className="h-9 text-sm sm:h-8"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TicketPrioridad).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="admin-ticket-reason" className="text-xs">
                Motivo
                <span className="text-red-500" aria-hidden="true">
                  {" "}
                  *
                </span>
              </Label>
              <Input
                id="admin-ticket-reason"
                value={form.motivo}
                required
                aria-describedby="admin-ticket-required-fields"
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    motivo: event.target.value,
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="admin-ticket-summary" className="text-xs">
                Resumen
              </Label>
              <Textarea
                id="admin-ticket-summary"
                value={form.resumen}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    resumen: event.target.value,
                  }))
                }
                className="h-20 text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="admin-ticket-notes" className="text-xs">
                Notas internas
              </Label>
              <Textarea
                id="admin-ticket-notes"
                value={form.notas}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    notas: event.target.value,
                  }))
                }
                className="h-16 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={isSaveDisabled}
            >
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
