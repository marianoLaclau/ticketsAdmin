export type EstadoEmpleado = 'Activo' | 'Inactivo';

interface EstadoEmpleadoConfig {
  label: 'Activo' | 'Inactivo';
  dotClass: string;
  textClass: string;
}

const ESTADOS_EMPLEADO: Record<EstadoEmpleado, EstadoEmpleadoConfig> = {
  Activo: {
    label: 'Activo',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  Inactivo: {
    label: 'Inactivo',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-700',
  },
};

const EMPRESAS_NO_ASOCIADAS = new Set([
  'sin empresa asignada',
  'sin empresa asociada',
]);

/**
 * Devuelve la presentación del estado laboral únicamente cuando existe una
 * empresa asociada. Los valores ausentes o desconocidos no se muestran.
 */
export function getEstadoEmpleadoConfig(
  empresa: string | null | undefined,
  estado: string | null | undefined,
): EstadoEmpleadoConfig | null {
  const empresaNormalizada = (empresa ?? '').trim().toLowerCase();
  if (!empresaNormalizada || EMPRESAS_NO_ASOCIADAS.has(empresaNormalizada)) {
    return null;
  }

  const estadoNormalizado = (estado ?? '').trim().toLowerCase();
  if (estadoNormalizado === 'activo') return ESTADOS_EMPLEADO.Activo;
  if (estadoNormalizado === 'inactivo') return ESTADOS_EMPLEADO.Inactivo;
  return null;
}
