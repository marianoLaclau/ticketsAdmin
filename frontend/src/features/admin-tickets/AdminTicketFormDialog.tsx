import type { Dispatch, SetStateAction } from 'react';
import { TicketEstado, TicketPrioridad } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TicketVersionConflictAlert } from '@/components/tickets/TicketVersionConflictAlert';
import { getEstadoLabel } from '@/lib/estados';
import type {
  AdminTicketForm,
  AdminTicketTextField,
} from '@/lib/admin-ticket-form';

const CAMPOS_TEXTO: Array<{
  campo: AdminTicketTextField;
  label: string;
  requerido?: boolean;
}> = [
  { campo: 'conversation_id', label: 'Conversation ID', requerido: true },
  { campo: 'hora', label: 'Hora (HH:MM)', requerido: true },
  { campo: 'nombre', label: 'Nombre', requerido: true },
  { campo: 'apellido', label: 'Apellido' },
  { campo: 'telefono', label: 'Teléfono' },
  { campo: 'dni', label: 'DNI' },
  { campo: 'empresa', label: 'Empresa' },
  { campo: 'email', label: 'Email' },
  { campo: 'audio_url', label: 'URL del audio' },
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId === null
              ? 'Nuevo registro'
              : `Editar registro #${editingId}`}
          </DialogTitle>
          <DialogDescription>
            {editingId === null
              ? 'Alta manual directa en la base (el flujo normal es la ingesta automática por llamada).'
              : 'Edición directa de los campos habilitados del registro.'}
          </DialogDescription>
        </DialogHeader>
        {hasVersionConflict && (
          <TicketVersionConflictAlert
            isReloading={isReloading}
            onReload={onReloadLatest}
          />
        )}
        <div className="grid grid-cols-2 gap-3 py-2">
          {CAMPOS_TEXTO.map(({ campo, label, requerido }) => (
            <div key={campo} className="space-y-1">
              <Label className="text-xs">
                {label}
                {requerido && <span className="text-red-500"> *</span>}
              </Label>
              <Input
                value={form[campo] ?? ''}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    [campo]: event.target.value,
                  }))
                }
                disabled={campo === 'conversation_id' && editingId !== null}
                className="h-8 text-sm"
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <Select
              value={form.estado}
              onValueChange={(estado) =>
                onFormChange((current) => ({
                  ...current,
                  estado: estado as AdminTicketForm['estado'],
                }))
              }
            >
              <SelectTrigger className="h-8 text-sm">
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
            <Label className="text-xs">Prioridad</Label>
            <Select
              value={form.prioridad}
              onValueChange={(prioridad) =>
                onFormChange((current) => ({
                  ...current,
                  prioridad: prioridad as AdminTicketForm['prioridad'],
                }))
              }
            >
              <SelectTrigger className="h-8 text-sm">
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
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">
              Motivo<span className="text-red-500"> *</span>
            </Label>
            <Input
              value={form.motivo}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  motivo: event.target.value,
                }))
              }
              className="h-8 text-sm"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Resumen</Label>
            <Textarea
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
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Notas internas</Label>
            <Textarea
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={
              isSaving ||
              isReloading ||
              hasVersionConflict ||
              !form.conversation_id.trim() ||
              !form.hora.trim() ||
              !form.nombre.trim() ||
              !form.motivo.trim()
            }
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
