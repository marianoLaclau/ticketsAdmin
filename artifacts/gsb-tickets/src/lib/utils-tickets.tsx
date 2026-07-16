import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TicketEstado, TicketPrioridad } from '@workspace/api-client-react';

export const getEstadoColor = (estado: string) => {
  switch (estado) {
    case TicketEstado.nuevo: return 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200';
    case TicketEstado.en_proceso: return 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200';
    case TicketEstado.pendiente: return 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200';
    case TicketEstado.resuelto: return 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200';
    case TicketEstado.cerrado: return 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

export const getPrioridadColor = (prioridad: string) => {
  switch (prioridad) {
    case TicketPrioridad.baja: return 'bg-slate-100 text-slate-800 border-slate-200';
    case TicketPrioridad.media: return 'bg-blue-100 text-blue-800 border-blue-200';
    case TicketPrioridad.alta: return 'bg-orange-100 text-orange-800 border-orange-200';
    case TicketPrioridad.urgente: return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

export const EstadoBadge = ({ estado, className = '' }: { estado: string, className?: string }) => (
  <Badge variant="outline" className={`font-medium ${getEstadoColor(estado)} ${className}`}>
    {estado.replace('_', ' ').toUpperCase()}
  </Badge>
);

export const PrioridadBadge = ({ prioridad, className = '' }: { prioridad: string, className?: string }) => (
  <Badge variant="outline" className={`font-medium ${getPrioridadColor(prioridad)} ${className}`}>
    {prioridad.toUpperCase()}
  </Badge>
);

export const formatShortId = (uuid: string) => {
  if (!uuid) return '';
  return uuid.split('-')[0].toUpperCase();
};

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
