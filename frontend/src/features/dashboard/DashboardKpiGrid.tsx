import { AlertCircle, CheckCircle2, Inbox, PhoneIncoming } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardKpiGridProps {
  isLoading: boolean;
  unreviewedCount: number;
  inProgressCount: number;
  overdueCount: number;
  resolvedCount: number;
  resolvedPeriodLabel: string;
}

export function DashboardKpiGrid({
  isLoading,
  unreviewedCount,
  inProgressCount,
  overdueCount,
  resolvedCount,
  resolvedPeriodLabel,
}: DashboardKpiGridProps) {
  const hasOverdue = overdueCount > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Inbox className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Sin revisar
          </p>
          {isLoading ? (
            <Skeleton className="h-8 w-10 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-amber-800 leading-none mt-1">
              {unreviewedCount}
            </p>
          )}
          <p className="text-[11px] text-amber-600 mt-0.5">tickets nuevos</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <PhoneIncoming className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            En proceso
          </p>
          {isLoading ? (
            <Skeleton className="h-8 w-10 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-blue-800 leading-none mt-1">
              {inProgressCount}
            </p>
          )}
          <p className="text-[11px] text-blue-600 mt-0.5">en atención</p>
        </div>
      </div>

      <div
        className={`rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm border ${hasOverdue ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}
      >
        <div
          className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${hasOverdue ? 'bg-red-100' : 'bg-slate-100'}`}
        >
          <AlertCircle
            className={`h-5 w-5 ${hasOverdue ? 'text-red-600' : 'text-slate-400'}`}
          />
        </div>
        <div>
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider ${hasOverdue ? 'text-red-700' : 'text-muted-foreground'}`}
          >
            Vencidos
          </p>
          {isLoading ? (
            <Skeleton className="h-8 w-10 mt-1" />
          ) : (
            <p
              className={`text-3xl font-bold leading-none mt-1 ${hasOverdue ? 'text-red-800' : 'text-foreground'}`}
            >
              {overdueCount}
            </p>
          )}
          <p
            className={`text-[11px] mt-0.5 ${hasOverdue ? 'text-red-600' : 'text-muted-foreground'}`}
          >
            fuera de plazo
          </p>
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Resueltos {resolvedPeriodLabel}
          </p>
          {isLoading ? (
            <Skeleton className="h-8 w-10 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-emerald-800 leading-none mt-1">
              {resolvedCount}
            </p>
          )}
          <p className="text-[11px] text-emerald-600 mt-0.5">cerrados</p>
        </div>
      </div>
    </div>
  );
}
