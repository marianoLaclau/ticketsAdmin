import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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

type TicketDataValidationErrors = Partial<
  Record<'email' | 'motivo', string>
>;

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
  const isEditingDisabled = isSaving || isReloadingConflict;
  const [baseline, setBaseline] =
    useState<TicketEditBaseline<TicketFunctionalForm>>(() =>
      createTicketEditBaseline(ticket, initialForm),
    );
  const [form, setForm] = useState<TicketFunctionalForm>(initialForm);
  const [validationErrors, setValidationErrors] =
    useState<TicketDataValidationErrors>({});
  const emailInputRef = useRef<HTMLInputElement>(null);
  const motivoInputRef = useRef<HTMLInputElement>(null);
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
    setValidationErrors({});
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

  const clearValidationError = (field: keyof TicketDataValidationErrors) => {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isEditingDisabled) return;
    if (!hasChanges) return;

    const nextErrors: TicketDataValidationErrors = {};
    if (!isValidOptionalEmail(form.email)) {
      nextErrors.email = 'Ingresá un email válido o dejá el campo vacío.';
    }
    if (!form.motivo.trim()) {
      nextErrors.motivo = 'El motivo no puede quedar vacío.';
    }
    setValidationErrors(nextErrors);
    if (nextErrors.email) {
      emailInputRef.current?.focus();
      return;
    }
    if (nextErrors.motivo) {
      motivoInputRef.current?.focus();
      return;
    }

    if (update) onSave(update);
  };

  const reloadLatest = async () => {
    try {
      const latestTicket = await onReloadLatest();
      const snapshot = ticketToFunctionalForm(latestTicket);
      setBaseline(createTicketEditBaseline(latestTicket, snapshot));
      setForm({ ...snapshot });
      setValidationErrors({});
      onVersionConflictResolved();
    } catch {
      // El padre muestra el error y el draft se conserva para no perder trabajo.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-[680px] sm:p-6">
        <DialogHeader>
          <DialogTitle>Editar datos del ticket</DialogTitle>
          <DialogDescription>
            Completá o corregí la información obtenida de la llamada. Cada cambio quedará registrado en el historial.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" noValidate onSubmit={submit}>
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
                  ref={field === 'email' ? emailInputRef : undefined}
                  type={type}
                  value={form[field]}
                  disabled={isEditingDisabled}
                  aria-invalid={
                    field === 'email' && Boolean(validationErrors.email)
                  }
                  aria-describedby={
                    field === 'email' && validationErrors.email
                      ? 'ticket-data-email-error'
                      : undefined
                  }
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }));
                    if (field === 'email') clearValidationError('email');
                  }}
                />
                {field === 'email' && validationErrors.email && (
                  <p
                    id="ticket-data-email-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {validationErrors.email}
                  </p>
                )}
              </div>
            ))}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ticket-data-motivo">
                Motivo
                <span aria-hidden="true" className="text-destructive">
                  {' '}*
                </span>
              </Label>
              <Input
                id="ticket-data-motivo"
                ref={motivoInputRef}
                value={form.motivo}
                disabled={isEditingDisabled}
                required
                aria-invalid={Boolean(validationErrors.motivo)}
                aria-describedby={
                  validationErrors.motivo
                    ? 'ticket-data-motivo-error'
                    : undefined
                }
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    motivo: event.target.value,
                  }));
                  clearValidationError('motivo');
                }}
              />
              {validationErrors.motivo && (
                <p
                  id="ticket-data-motivo-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {validationErrors.motivo}
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ticket-data-resumen">Resumen del llamado</Label>
              <Textarea
                id="ticket-data-resumen"
                className="min-h-28 resize-y"
                value={form.resumen}
                disabled={isEditingDisabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    resumen: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={!hasChanges || isEditingDisabled || hasVersionConflict}
            >
              {isSaving ? 'Guardando…' : 'Guardar datos'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
