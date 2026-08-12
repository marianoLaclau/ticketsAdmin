import type { Ticket } from "@workspace/api-client-react";
import { Link } from "wouter";
import { CheckCircle2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getContactDisplayName } from "@/lib/contacto";
import { PrioridadBadge } from "@/lib/utils-tickets";

interface DashboardOverdueTicketsPanelProps {
  tickets: readonly Ticket[] | undefined;
  overdueCount: number;
  isLoading: boolean;
  referenceTimeMs: number;
}

// La API devuelve hasta veinte vencidos. Mostrarlos todos estiraba el dashboard
// y dejaba la página con un scroll largo, así que el panel acota su alto y
// desplaza el resto adentro, con el encabezado fijo para no perder las columnas.
//
// El valor sale de medir en el navegador: una fila mide entre 40px (solo
// contacto) y 56px (con empresa debajo), más 29px del encabezado. 570px deja
// alrededor de diez filas visibles en el caso típico.
const ALTO_MAXIMO_LISTA = "570px";

function getOverdueLabel(deadline: string, referenceTimeMs: number): string {
  const diffHours = Math.floor(
    (referenceTimeMs - new Date(deadline).getTime()) / (1000 * 60 * 60),
  );
  return diffHours > 24 ? `${Math.floor(diffHours / 24)}d` : `${diffHours}h`;
}

export function DashboardOverdueTicketsPanel({
  tickets,
  overdueCount,
  isLoading,
  referenceTimeMs,
}: DashboardOverdueTicketsPanelProps) {
  return (
    <div className="bg-card border border-red-100 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-red-50 px-5 py-3 border-b border-red-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-red-800 flex items-center gap-2 uppercase tracking-wider">
          <Clock className="h-3.5 w-3.5" />
          Requieren Atención Inmediata
        </h3>
        {overdueCount ? (
          <span className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
            {overdueCount} vencidos
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : !tickets || tickets.length === 0 ? (
        <div className="p-8 text-center flex flex-col items-center gap-2">
          <CheckCircle2 className="h-7 w-7 text-emerald-300" />
          <p className="text-sm text-slate-400">
            Todos los tickets están al día
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto overflow-y-auto scroll-sutil"
          style={{ maxHeight: ALTO_MAXIMO_LISTA }}
        >
          <table className="w-full text-sm text-left">
            <caption className="sr-only">
              Tickets vencidos que requieren atención inmediata
            </caption>
            <thead className="sticky top-0 z-10 text-[11px] uppercase text-muted-foreground bg-slate-50 shadow-[0_1px_0_0_theme(colors.slate.200)]">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">
                  Contacto
                </th>
                <th scope="col" className="px-5 py-2 font-medium">
                  Motivo
                </th>
                <th scope="col" className="px-5 py-2 font-medium">
                  Prioridad
                </th>
                <th scope="col" className="px-5 py-2 font-medium text-right">
                  Venció hace
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => {
                if (!ticket.fecha_limite) return null;

                return (
                  <tr key={ticket.id}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="-m-1 block rounded-md p-1 underline-offset-4 hover:bg-red-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="block text-sm font-medium text-foreground hover:underline">
                          {getContactDisplayName(ticket)}
                        </span>
                        {ticket.empresa && (
                          <span className="block text-[11px] text-slate-400">
                            {ticket.empresa}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td
                      className="px-5 py-2.5 text-slate-600 text-sm truncate max-w-[180px]"
                      title={ticket.motivo}
                    >
                      {ticket.motivo}
                    </td>
                    <td className="px-5 py-2.5">
                      <PrioridadBadge prioridad={ticket.prioridad} />
                    </td>
                    <td className="px-5 py-2.5 text-right font-bold text-red-600 text-xs">
                      {getOverdueLabel(ticket.fecha_limite, referenceTimeMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
