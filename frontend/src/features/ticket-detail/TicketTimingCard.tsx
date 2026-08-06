import type { Ticket } from '@workspace/api-client-react';
import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils-tickets';

interface TicketTimingCardProps {
  deadline: Ticket['fecha_limite'];
  resolvedAt: Ticket['fecha_resolucion'];
  overdue: boolean;
}

export function TicketTimingCard({
  deadline,
  resolvedAt,
  overdue,
}: TicketTimingCardProps) {
  return (
    <Card className={`shadow-sm ${overdue ? 'border-red-200' : ''}`}>
      <CardHeader
        className={`pb-3 border-b ${overdue ? 'bg-red-50/50 border-red-100' : 'border-slate-100'}`}
      >
        <CardTitle
          className={`text-lg flex items-center gap-2 ${overdue ? 'text-red-700' : ''}`}
        >
          <Clock className="h-5 w-5" />
          Tiempos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Fecha Límite
          </h4>
          <p
            className={`font-medium ${overdue ? 'text-red-600' : 'text-slate-900'}`}
          >
            {deadline ? formatDate(deadline) : 'No definida'}
          </p>
        </div>

        {resolvedAt && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Resolución
            </h4>
            <p className="text-slate-900">{formatDate(resolvedAt)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
