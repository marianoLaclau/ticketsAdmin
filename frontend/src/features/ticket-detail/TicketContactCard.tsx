import type { Ticket } from "@workspace/api-client-react";
import { Building, Mail, Pencil, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getContactDisplayEmail,
  getContactDisplayName,
  getContactDisplayPhone,
} from "@/lib/contacto";
import { getEstadoEmpleadoConfig } from "@/lib/estado-empleado";

type TicketContact = Pick<
  Ticket,
  | "nombre"
  | "apellido"
  | "empresa"
  | "estado_empleado"
  | "dni"
  | "telefono"
  | "email"
>;

interface TicketContactCardProps {
  ticket: TicketContact;
  onEdit: () => void;
  isEditDisabled: boolean;
  showEditAction: boolean;
}

export function TicketContactCard({
  ticket,
  onEdit,
  isEditDisabled,
  showEditAction,
}: TicketContactCardProps) {
  const contactoLabel = getContactDisplayName(ticket);
  const telefonoLabel = getContactDisplayPhone(ticket.telefono);
  const emailLabel = getContactDisplayEmail(ticket.email);
  const empresaLabel = ticket.empresa?.trim();
  const estadoEmpleado = getEstadoEmpleadoConfig(
    empresaLabel,
    ticket.estado_empleado,
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
          <User className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">Datos del Contacto</span>
          {showEditAction && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-9 w-9 shrink-0 text-slate-500"
              onClick={onEdit}
              disabled={isEditDisabled}
              aria-label="Editar datos del contacto"
              title="Editar datos del contacto"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Nombre Completo
          </h4>
          <p className="font-medium text-slate-900">{contactoLabel}</p>
        </div>

        {empresaLabel && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Empresa
            </h4>
            <p className="text-slate-900 flex items-center gap-2">
              <Building
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">{empresaLabel}</span>
            </p>
            {estadoEmpleado && (
              <p
                className={`mt-1 flex items-center pl-6 text-sm font-medium ${estadoEmpleado.textClass}`}
              >
                <span
                  className={`mr-2 h-2 w-2 rounded-full ${estadoEmpleado.dotClass}`}
                  aria-hidden="true"
                />
                {estadoEmpleado.label}
              </p>
            )}
          </div>
        )}

        {ticket.dni && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              DNI / CUIT
            </h4>
            <p className="text-slate-900 font-mono text-sm">{ticket.dni}</p>
          </div>
        )}

        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          <div className="flex min-h-10 items-center gap-3 py-1 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-50">
              <Phone className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </div>
            {telefonoLabel ? (
              <span className="break-all text-slate-700">{telefonoLabel}</span>
            ) : (
              <span className="italic text-slate-500">
                Teléfono no proporcionado
              </span>
            )}
          </div>

          <div className="flex min-h-10 items-center gap-3 py-1 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-50">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </div>
            {emailLabel ? (
              <span className="break-all text-slate-700">{emailLabel}</span>
            ) : (
              <span className="italic text-slate-500">
                Email no proporcionado
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
