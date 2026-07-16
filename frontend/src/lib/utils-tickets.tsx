import React from 'react';
import { TicketEstado, TicketPrioridad } from '@workspace/api-client-react';

export const getEstadoColor = (estado: string) => {
  switch (estado) {
    case TicketEstado.nuevo: return 'bg-slate-400';
    case TicketEstado.en_proceso: return 'bg-blue-500';
    case TicketEstado.pendiente: return 'bg-amber-500';
    case TicketEstado.resuelto: return 'bg-green-500';
    case TicketEstado.cerrado: return 'bg-slate-800';
    default: return 'bg-slate-400';
  }
};

export const getPrioridadStyle = (prioridad: string) => {
  switch (prioridad) {
    case TicketPrioridad.baja: return 'bg-slate-100 text-slate-600';
    case TicketPrioridad.media: return 'bg-blue-50 text-blue-700';
    case TicketPrioridad.alta: return 'bg-orange-50 text-orange-700';
    case TicketPrioridad.urgente: return 'bg-red-50 text-red-700 font-bold';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export const EstadoBadge = ({ estado, className = '' }: { estado: string, className?: string }) => (
  <div className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 ${className}`}>
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getEstadoColor(estado)}`} />
    <span>{estado.replace('_', ' ').toUpperCase()}</span>
  </div>
);

export const PrioridadBadge = ({ prioridad, className = '' }: { prioridad: string, className?: string }) => (
  <div className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-semibold tracking-wide uppercase ${getPrioridadStyle(prioridad)} ${className}`}>
    {prioridad}
  </div>
);

export const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const isVencido = (fechaLimite?: string | null, estado?: string) => {
  if (!fechaLimite) return false;
  if (estado === TicketEstado.resuelto || estado === TicketEstado.cerrado) return false;
  return new Date(fechaLimite) < new Date();
};
