import { useEffect, useMemo, useState } from 'react';
import type { Ticket, TicketUpdate } from '@workspace/api-client-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  buildFunctionalTicketUpdate,
  isValidOptionalEmail,
  ticketToFunctionalForm,
  type TicketFunctionalForm,
} from '@/lib/ticket-edit';

interface TicketDataEditDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onSave: (update: TicketUpdate) => void;
}

const CONTACT_FIELDS: Array<{
  field: keyof Pick<TicketFunctionalForm, 'nombre' | 'apellido' | 'telefono' | 'dni' | 'empresa' | 'email'>;
  label: string;
  type?: string;
}> = [
  { field: 'nombre', label: 'Nombre' },
  { field: 'apellido', label: 'Apellido' },
  { field: 'telefono', label: 'Teléfono', type: 'tel' },
  { field: 'dni', label: 'DNI / CUIT' },
  { field: 'empresa', label: 'Empresa' },
  { field: 'email', label: 'Email', type: 'email' },
];

export function TicketDataEditDialog({
  ticket,
  open,
  onOpenChange,
  isSaving,
  onSave,
}: TicketDataEditDialogProps) {
  const [form, setForm] = useState<TicketFunctionalForm>(() => ticketToFunctionalForm(ticket));
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(ticketToFunctionalForm(ticket));
    setValidationError('');
  }, [open, ticket.id]);

  const update = useMemo(() => buildFunctionalTicketUpdate(ticket, form), [ticket, form]);
  const hasChanges = Object.keys(update).length > 0;

  const submit = () => {
    if (!form.motivo.trim()) {
      setValidationError('El motivo no puede quedar vacío.');
      return;
    }
    if (!isValidOptionalEmail(form.email)) {
      setValidationError('Ingresá un email válido o dejá el campo vacío.');
      return;
    }
    setValidationError('');
    onSave(update);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Editar datos del ticket</DialogTitle>
          <DialogDescription>
            Completá o corregí la información obtenida de la llamada. Cada cambio quedará registrado en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          {CONTACT_FIELDS.map(({ field, label, type }) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`ticket-data-${field}`}>{label}</Label>
              <Input
                id={`ticket-data-${field}`}
                type={type}
                value={form[field]}
                aria-invalid={field === 'email' && Boolean(validationError)}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              />
            </div>
          ))}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ticket-data-motivo">Motivo</Label>
            <Input
              id="ticket-data-motivo"
              value={form.motivo}
              aria-invalid={Boolean(validationError)}
              onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ticket-data-resumen">Resumen del llamado</Label>
            <Textarea
              id="ticket-data-resumen"
              className="min-h-28 resize-y"
              value={form.resumen}
              onChange={(event) => setForm((current) => ({ ...current, resumen: event.target.value }))}
            />
          </div>
        </div>

        {validationError && <p className="text-sm text-destructive">{validationError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Guardando…' : 'Guardar datos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
