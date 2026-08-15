import { TicketEstado, TicketPrioridad } from "@workspace/api-client-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { TicketVersionConflictAlert } from "@/components/tickets/TicketVersionConflictAlert";
import { getEstadoLabel } from "@/lib/estados";
import type { TicketManagementForm } from "@/features/ticket-detail/ticket-edit";

interface TicketManagementDialogProps {
  open: boolean;
  form: TicketManagementForm;
  canCloseTickets: boolean;
  canReturnToNew: boolean;
  showTechnicalDeadline: boolean;
  isReloadingConflict: boolean;
  hasVersionConflict: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onReloadLatest: () => void;
  onStateChange: (estado: TicketManagementForm["estado"]) => void;
  onPriorityChange: (prioridad: TicketManagementForm["prioridad"]) => void;
  onProgressChange: (progreso: number | undefined) => void;
  onDeadlineChange: (fechaLimite: string) => void;
  onNotesChange: (notas: string) => void;
  onSave: () => void;
}

export function TicketManagementDialog({
  open,
  form,
  canCloseTickets,
  canReturnToNew,
  showTechnicalDeadline,
  isReloadingConflict,
  hasVersionConflict,
  isSaving,
  onOpenChange,
  onReloadLatest,
  onStateChange,
  onPriorityChange,
  onProgressChange,
  onDeadlineChange,
  onNotesChange,
  onSave,
}: TicketManagementDialogProps) {
  const isEditingDisabled = isSaving || isReloadingConflict;
  const stateHelpId = "ticket-management-state-help";
  const deadlineHelpId = "ticket-management-deadline-help";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isEditingDisabled || hasVersionConflict) return;
    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-white"
          disabled={isEditingDisabled}
        >
          Editar Estado
        </Button>
      </DialogTrigger>
      <DialogContent className="p-4 sm:max-w-[500px] sm:p-6">
        <DialogHeader>
          <DialogTitle>Actualizar Ticket</DialogTitle>
          <DialogDescription>
            Modifica el estado, prioridad o notas de gestión.
          </DialogDescription>
        </DialogHeader>
        {hasVersionConflict && (
          <TicketVersionConflictAlert
            isReloading={isReloadingConflict}
            onReload={onReloadLatest}
          />
        )}
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="ticket-management-state"
                  className="text-sm font-medium"
                >
                  Estado
                </label>
                <Select
                  value={form.estado}
                  disabled={isEditingDisabled}
                  onValueChange={(estado) =>
                    onStateChange(estado as TicketManagementForm["estado"])
                  }
                >
                  <SelectTrigger
                    id="ticket-management-state"
                    aria-describedby={
                      !canCloseTickets ? stateHelpId : undefined
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TicketEstado).map((estado: string) => (
                      <SelectItem
                        key={estado}
                        value={estado}
                        disabled={
                          (estado === TicketEstado.cerrado &&
                            !canCloseTickets) ||
                          (estado === TicketEstado.nuevo && !canReturnToNew)
                        }
                      >
                        {getEstadoLabel(estado).toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canCloseTickets && (
                  <p
                    id={stateHelpId}
                    className="text-[11px] text-muted-foreground"
                  >
                    Solo puede ser cerrado por un administrador
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="ticket-management-priority"
                  className="text-sm font-medium"
                >
                  Prioridad
                </label>
                <Select
                  value={form.prioridad}
                  disabled={isEditingDisabled}
                  onValueChange={(prioridad) =>
                    onPriorityChange(
                      prioridad as TicketManagementForm["prioridad"],
                    )
                  }
                >
                  <SelectTrigger id="ticket-management-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TicketPrioridad).map((prioridad: string) => (
                      <SelectItem key={prioridad} value={prioridad}>
                        {prioridad.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between">
                <span
                  id="ticket-management-progress-label"
                  className="text-sm font-medium"
                >
                  Progreso
                </span>
                <span className="text-sm text-slate-500">{form.progreso}%</span>
              </div>
              <Slider
                value={[form.progreso]}
                disabled={isEditingDisabled}
                thumbProps={{
                  "aria-labelledby": "ticket-management-progress-label",
                  "aria-valuetext": `${form.progreso} por ciento`,
                }}
                onValueChange={(value) => onProgressChange(value[0])}
                max={100}
                step={5}
              />
            </div>

            {showTechnicalDeadline && (
              <div className="space-y-2">
                <label
                  htmlFor="ticket-management-deadline"
                  className="text-sm font-medium"
                >
                  Fecha Límite
                </label>
                <Input
                  id="ticket-management-deadline"
                  type="datetime-local"
                  value={form.fecha_limite}
                  disabled={isEditingDisabled}
                  aria-describedby={deadlineHelpId}
                  onChange={(event) => onDeadlineChange(event.target.value)}
                />
                <p
                  id={deadlineHelpId}
                  className="text-[11px] text-muted-foreground"
                >
                  Campo técnico protegido por la llave de administración.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="ticket-management-notes"
                className="text-sm font-medium"
              >
                Notas Internas
              </label>
              <Textarea
                id="ticket-management-notes"
                value={form.notas}
                disabled={isEditingDisabled}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Notas visibles solo para agentes..."
                className="h-24"
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
              disabled={isEditingDisabled || hasVersionConflict}
            >
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
