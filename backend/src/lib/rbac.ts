export const ROL_SYSADMIN = "SysAdmin";
export const ROL_ADMINISTRADOR = "Administrador";
export const ROL_OPERADOR = "Operador";

export const ROLES_SISTEMA = [
  ROL_SYSADMIN,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
] as const;

const NOMBRES_RESERVADOS = new Set(
  ROLES_SISTEMA.map((nombre) => nombre.toLocaleLowerCase("es")),
);

export function esNombreRolReservado(nombre: string): boolean {
  return NOMBRES_RESERVADOS.has(nombre.trim().toLocaleLowerCase("es"));
}

export function esRolSistema(nombre: string): boolean {
  return ROLES_SISTEMA.some((rol) => rol === nombre);
}

export function puedeCerrarTickets(rol: string | undefined): boolean {
  return rol === ROL_SYSADMIN || rol === ROL_ADMINISTRADOR;
}
