import { TicketEstado, TicketPrioridad } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { TicketVersionConflictAlert } from '@/components/tickets/TicketVersionConflictAlert';
import { getEstadoLabel } from '@/lib/estados';
import type { TicketManagementForm } from '@/lib/ticket-edit';

interface TicketManagementDialogProps {
  open: boolean;
  form: TicketManagementForm;
  canCloseTickets: boolean;
  showTechnicalDeadline: boolean;
  isReloadingConflict: boolean;
  hasVersionConflict: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onReloadLatest: () => void;
  onStateChange: (estado: TicketManagementForm['estado']) => void;
  onPriorityChange: (prioridad: TicketManagementForm['prioridad']) => void;
  onProgressChange: (progreso: number | undefined) => void;
  onDeadlineChange: (fechaLimite: string) => void;
  onNotesChange: (notas: string) => void;
  onSave: () => void;
}

export function TicketManagementDialog({
  open,
  form,
  canCloseTickets,
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-white"
          disabled={isReloadingConflict}
        >
          Editar Estado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
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
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={form.estado}
                onValueChange={(estado) =>
                  onStateChange(estado as TicketManagementForm['estado'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TicketEstado).map((estado: string) => (
                    <SelectItem
                      key={estado}
                      value={estado}
                      disabled={
                        estado === TicketEstado.cerrado && !canCloseTickets
                      }
                    >
                      {getEstadoLabel(estado).toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canCloseTickets && (
                <p className="text-[11px] text-muted-foreground">
                  Solo puede ser cerrado por un administrador
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridad</label>
              <Select
                value={form.prioridad}
                onValueChange={(prioridad) =>
                  onPriorityChange(
                    prioridad as TicketManagementForm['prioridad'],
                  )
                }
              >
                <SelectTrigger>
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
              <label className="text-sm font-medium">Progreso</label>
              <span className="text-sm text-slate-500">{form.progreso}%</span>
            </div>
            <Slider
              value={[form.progreso]}
              onValueChange={(value) => onProgressChange(value[0])}
              max={100}
              step={5}
            />
          </div>

          {showTechnicalDeadline && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Límite</label>
              <Input
                type="datetime-local"
                value={form.fecha_limite}
                onChange={(event) => onDeadlineChange(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Campo técnico protegido por la llave de administración.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Notas Internas</label>
            <Textarea
              value={form.notas}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Notas visibles solo para agentes..."
              className="h-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving || hasVersionConflict}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
