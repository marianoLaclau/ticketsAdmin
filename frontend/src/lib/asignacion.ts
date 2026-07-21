export const SIN_ASIGNAR = 'Sin asignar';

export function hasAssignedDisplayName(asignadoA?: string | null): boolean {
  return Boolean(asignadoA?.trim());
}

/** Devuelve el nombre visible del responsable sin alterar los datos del ticket. */
export function getAssignedDisplayName(asignadoA?: string | null): string {
  return asignadoA?.trim() || SIN_ASIGNAR;
}
