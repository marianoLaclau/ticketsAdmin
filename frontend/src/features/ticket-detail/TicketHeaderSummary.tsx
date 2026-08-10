import type { Ticket } from "@workspace/api-client-react";
import { ArrowLeft, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAssignedDisplayName } from "@/lib/asignacion";
import { formatDate } from "@/lib/utils-tickets";

interface TicketHeaderSummaryProps {
  reason: Ticket["motivo"];
  createdAt: Ticket["fecha_creacion"];
  assignedTo: Ticket["asignado_a"];
  overdue: boolean;
  backLabel: string;
  onBack: () => void;
}

export function TicketHeaderSummary({
  reason,
  createdAt,
  assignedTo,
  overdue,
  backLabel,
  onBack,
}: TicketHeaderSummaryProps) {
  return (
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <Button
        variant="outline"
        size="icon"
        onClick={onBack}
        className="mt-1 shrink-0 bg-white"
        aria-label={backLabel}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {reason?.trim() || "Sin motivo proporcionado"}
          </h1>
          {overdue && (
            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 border border-red-200">
              <Clock className="h-3 w-3" aria-hidden="true" /> Vencido
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Creado: {formatDate(createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            Asignado a: {getAssignedDisplayName(assignedTo)}
          </span>
        </div>
      </div>
    </div>
  );
}
