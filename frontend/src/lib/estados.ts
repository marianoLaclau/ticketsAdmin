export const ESTADO_LABELS: Readonly<Record<string, string>> = {
  nuevo: 'Nuevo',
  en_proceso: 'En Proceso',
  pendiente: 'Pendiente (fue contactado)',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

export function getEstadoLabel(estado: string): string {
  return ESTADO_LABELS[estado] ?? estado.replaceAll('_', ' ');
}
