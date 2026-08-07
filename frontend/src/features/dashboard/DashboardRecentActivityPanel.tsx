import type { ActividadItem } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { SIN_NOMBRE_PROPORCIONADO } from "@/lib/contacto";
import { formatDate } from "@/lib/utils-tickets";

interface DashboardRecentActivityPanelProps {
  activities: readonly ActividadItem[] | undefined;
  isLoading: boolean;
  title: string;
}

export function DashboardRecentActivityPanel({
  activities,
  isLoading,
  title,
}: DashboardRecentActivityPanelProps) {
  return (
    <div className="lg:col-span-1">
      <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
          <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">
            en vivo
          </span>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : !activities || activities.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Sin actividad reciente
            </p>
          ) : (
            <div className="space-y-4">
              {activities.map((activity, idx) => {
                const isNew = activity.tipo === "ticket_creado";
                return (
                  <div key={idx} className="relative pl-5">
                    {idx !== activities.length - 1 && (
                      <div className="absolute left-[7px] top-4 bottom-[-16px] w-px bg-slate-100" />
                    )}
                    <div
                      className={`absolute left-0.5 top-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${isNew ? "bg-amber-400" : "bg-blue-400"}`}
                    />
                    <div>
                      <Link
                        href={`/tickets/${activity.ticket_id}`}
                        className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {activity.nombre_contacto?.trim() ||
                          SIN_NOMBRE_PROPORCIONADO}
                      </Link>
                      <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                        {activity.descripcion}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {formatDate(activity.fecha)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
