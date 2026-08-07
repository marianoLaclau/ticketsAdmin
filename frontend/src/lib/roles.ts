// Espejo de backend/src/lib/auth.ts. Cuando exista el sistema de permisos
// con checkboxes, estas verificaciones pasarán a ser por permiso y no por
// nombre de rol.
// - SysAdmin: usuario Dios — todo, incluido el panel de administración.
// - Administrador: todo sobre tickets (incluye cerrarlos), sin panel admin.
// - Operador: gestión básica — no puede cerrar tickets.
export const ROL_SYSADMIN = "SysAdmin";
export const ROL_ADMINISTRADOR = "Administrador";
export const ROL_OPERADOR = "Operador";

export const ROLES_SISTEMA = [
  ROL_SYSADMIN,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
] as const;

const NOMBRES_RESERVADOS = new Set(
  ROLES_SISTEMA.map((rol) => rol.toLocaleLowerCase("es")),
);

export function esNombreRolReservado(rol: string): boolean {
  return NOMBRES_RESERVADOS.has(rol.trim().toLocaleLowerCase("es"));
}

export function esRolSistema(rol: string): boolean {
  return ROLES_SISTEMA.some((nombre) => nombre === rol);
}

export function puedeCerrarTickets(rol: string | undefined): boolean {
  return rol === ROL_SYSADMIN || rol === ROL_ADMINISTRADOR;
}
