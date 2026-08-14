import { TicketEstado, type Ticket } from "@workspace/api-client-react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getEstadoLabel } from "@/lib/estados";
import { TICKET_STATE_PROGRESS } from "@/features/ticket-detail/ticket-edit";

const PROGRESS_STATES = [
  TicketEstado.nuevo,
  TicketEstado.en_proceso,
  TicketEstado.pendiente,
  TicketEstado.resuelto,
  TicketEstado.cerrado,
] as const;

interface TicketProgressCardProps {
  estado: Ticket["estado"];
  progreso: Ticket["progreso"];
}

export function TicketProgressCard({
  estado,
  progreso,
}: TicketProgressCardProps) {
  const displayProgress = progreso || 0;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-semibold text-sm text-slate-700">
          Progreso del Caso
        </h3>
        <span className="font-bold text-primary">{displayProgress}%</span>
      </div>
      <CardContent className="p-6">
        <div className="relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${displayProgress}%` }}
            />
          </div>

          <div className="relative flex justify-between">
            {PROGRESS_STATES.map((stepEstado) => {
              const value = TICKET_STATE_PROGRESS[stepEstado];
              const label = getEstadoLabel(stepEstado);
              const isCompleted = displayProgress >= value;
              const isCurrent = estado === stepEstado;

              return (
                <div
                  key={value}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center border-2 transition-colors z-10 bg-white
                        ${isCompleted ? "border-primary text-primary" : "border-slate-200 text-slate-300"}
                        ${isCurrent ? "ring-4 ring-primary/20" : ""}
                      `}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-current" />
                    )}
                  </div>
                  <span
                    className={`max-w-full px-1 text-center text-xs font-medium leading-tight ${isCurrent ? "text-primary" : isCompleted ? "text-slate-700" : "text-slate-400"}`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
