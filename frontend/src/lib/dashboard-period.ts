export type DashboardPeriod = 'todo' | 'semana' | 'mes' | 'personalizado';

export type DashboardDateParams = {
  fecha_desde: string;
  fecha_hasta: string;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentMonthToToday(now = new Date()): DashboardDateParams {
  return {
    fecha_desde: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    fecha_hasta: formatLocalDate(now),
  };
}

export function getDashboardPeriodParams(
  period: Exclude<DashboardPeriod, 'personalizado'>,
  now = new Date(),
): DashboardDateParams | undefined {
  if (period === 'todo') return undefined;

  if (period === 'mes') {
    return {
      fecha_desde: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      fecha_hasta: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  // En JavaScript domingo es 0. Este desplazamiento convierte lunes en el
  // primer dia de la semana y conserva correctamente los cambios de mes/año.
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {
    fecha_desde: formatLocalDate(monday),
    fecha_hasta: formatLocalDate(sunday),
  };
}

export function validateDashboardDateRange(
  fechaDesde: string,
  fechaHasta: string,
): string | null {
  if (!fechaDesde || !fechaHasta) return 'Completá las fechas desde y hasta.';
  if (fechaDesde > fechaHasta) {
    return 'La fecha desde no puede ser posterior a la fecha hasta.';
  }
  return null;
}

export function getDashboardRangeLabel(range: DashboardDateParams): string {
  const toDisplayDate = (value: string) => {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  };
  return `${toDisplayDate(range.fecha_desde)} al ${toDisplayDate(range.fecha_hasta)}`;
}

export function getDashboardPeriodLabel(period: DashboardPeriod): string {
  switch (period) {
    case 'semana':
      return 'esta semana';
    case 'mes':
      return 'este mes';
    case 'personalizado':
      return 'en el período';
    default:
      return 'hoy';
  }
}
