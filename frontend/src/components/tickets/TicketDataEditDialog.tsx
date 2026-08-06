import { useEffect, useMemo, useRef, useState } from 'react';
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
  buildFunctionalTicketUpdateFromBaseline,
  isValidOptionalEmail,
  ticketToFunctionalForm,
  type TicketFunctionalForm,
} from '@/lib/ticket-edit';
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  type TicketEditBaseline,
} from '@/lib/ticket-version';
import {
  transitionTicketDraftSession,
  type TicketDraftSession,
} from '@/lib/ticket-draft-session';
import { TicketVersionConflictAlert } from './TicketVersionConflictAlert';

interface TicketDataEditDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  hasVersionConflict: boolean;
  isReloadingConflict: boolean;
  onReloadLatest: () => Promise<Ticket>;
  onVersionConflictResolved: () => void;
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
  hasVersionConflict,
  isReloadingConflict,
  onReloadLatest,
  onVersionConflictResolved,
  onSave,
}: TicketDataEditDialogProps) {
  const initialForm = ticketToFunctionalForm(ticket);
  const [baseline, setBaseline] =
    useState<TicketEditBaseline<TicketFunctionalForm>>(() =>
      createTicketEditBaseline(ticket, initialForm),
    );
  const [form, setForm] = useState<TicketFunctionalForm>(initialForm);
  const [validationError, setValidationError] = useState('');
  const draftSessionRef = useRef<TicketDraftSession>({
    wasOpen: false,
    ticketId: null,
  });

  useEffect(() => {
    const transition = transitionTicketDraftSession(
      draftSessionRef.current,
      open,
      ticket.id,
    );
    draftSessionRef.current = transition.next;
    if (!transition.shouldReset) return;

    const snapshot = ticketToFunctionalForm(ticket);
    setBaseline(createTicketEditBaseline(ticket, snapshot));
    setForm({ ...snapshot });
    setValidationError('');
  }, [open, ticket]);

  const update = useMemo(
    () =>
      buildVersionedTicketUpdate(
        buildFunctionalTicketUpdateFromBaseline(baseline.values, form),
        baseline.expectedVersion,
      ),
    [baseline, form],
  );
  const hasChanges = update !== null;

  const submit = () => {
    if (!hasChanges) return;
    if (!form.motivo.trim()) {
      setValidationError('El motivo no puede quedar vacío.');
      return;
    }
    if (!isValidOptionalEmail(form.email)) {
      setValidationError('Ingresá un email válido o dejá el campo vacío.');
      return;
    }
    setValidationError('');
    if (update) onSave(update);
  };

  const reloadLatest = async () => {
    try {
      const latestTicket = await onReloadLatest();
      const snapshot = ticketToFunctionalForm(latestTicket);
      setBaseline(createTicketEditBaseline(latestTicket, snapshot));
      setForm({ ...snapshot });
      setValidationError('');
      onVersionConflictResolved();
    } catch {
      // El padre muestra el error y el draft se conserva para no perder trabajo.
    }
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

        {hasVersionConflict && (
          <TicketVersionConflictAlert
            isReloading={isReloadingConflict}
            onReload={() => void reloadLatest()}
          />
        )}

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
          <Button
            onClick={submit}
            disabled={!hasChanges || isSaving || hasVersionConflict}
          >
            {isSaving ? 'Guardando…' : 'Guardar datos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
