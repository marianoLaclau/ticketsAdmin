export const ROL_SYSADMIN = "SysAdmin";
export const ROL_CONTROLLER = "Controller";
export const ROL_ADMINISTRADOR = "Administrador";
export const ROL_OPERADOR = "Operador";

export const ROLES_SISTEMA = [
  ROL_SYSADMIN,
  ROL_CONTROLLER,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
] as const;

export const CAPACIDAD_VER_DASHBOARD = "ver_dashboard";
export const CAPACIDAD_VER_TICKETS = "ver_tickets";
export const CAPACIDAD_GESTIONAR_TICKETS = "gestionar_tickets";
export const CAPACIDAD_CERRAR_TICKETS = "cerrar_tickets";
export const CAPACIDAD_VER_RENDIMIENTO = "ver_rendimiento";
export const CAPACIDAD_ADMINISTRAR = "administrar";

export type Capacidad =
  | typeof CAPACIDAD_VER_DASHBOARD
  | typeof CAPACIDAD_VER_TICKETS
  | typeof CAPACIDAD_GESTIONAR_TICKETS
  | typeof CAPACIDAD_CERRAR_TICKETS
  | typeof CAPACIDAD_VER_RENDIMIENTO
  | typeof CAPACIDAD_ADMINISTRAR;

const CAPACIDADES_POR_ROL: ReadonlyMap<
  string,
  ReadonlySet<Capacidad>
> = new Map([
  [
    ROL_SYSADMIN,
    new Set<Capacidad>([
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
      CAPACIDAD_CERRAR_TICKETS,
      CAPACIDAD_VER_RENDIMIENTO,
      CAPACIDAD_ADMINISTRAR,
    ]),
  ],
  [
    ROL_CONTROLLER,
    new Set<Capacidad>([
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_VER_RENDIMIENTO,
    ]),
  ],
  [
    ROL_ADMINISTRADOR,
    new Set<Capacidad>([
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
      CAPACIDAD_CERRAR_TICKETS,
    ]),
  ],
  [
    ROL_OPERADOR,
    new Set<Capacidad>([
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
    ]),
  ],
]);

// Los roles personalizados conservan el alcance histórico del sistema:
// dashboard, lectura y gestión básica de tickets, sin cierre ni administración.
// Controller es la primera identidad explícitamente de solo lectura.
const CAPACIDADES_ROL_PERSONALIZADO = new Set<Capacidad>([
  CAPACIDAD_VER_DASHBOARD,
  CAPACIDAD_VER_TICKETS,
  CAPACIDAD_GESTIONAR_TICKETS,
]);

const NOMBRES_RESERVADOS = new Set(
  ROLES_SISTEMA.map((nombre) => nombre.toLocaleLowerCase("es")),
);

export function esNombreRolReservado(nombre: string): boolean {
  return NOMBRES_RESERVADOS.has(nombre.trim().toLocaleLowerCase("es"));
}

export function esRolSistema(nombre: string): boolean {
  return ROLES_SISTEMA.some((rol) => rol === nombre);
}

export function tieneCapacidad(
  rol: string | undefined,
  capacidad: Capacidad,
): boolean {
  if (!rol) return false;
  return (CAPACIDADES_POR_ROL.get(rol) ?? CAPACIDADES_ROL_PERSONALIZADO).has(
    capacidad,
  );
}

export function puedeGestionarTickets(rol: string | undefined): boolean {
  return tieneCapacidad(rol, CAPACIDAD_GESTIONAR_TICKETS);
}

export function puedeCerrarTickets(rol: string | undefined): boolean {
  return tieneCapacidad(rol, CAPACIDAD_CERRAR_TICKETS);
}

export function puedeVerRendimiento(rol: string | undefined): boolean {
  return tieneCapacidad(rol, CAPACIDAD_VER_RENDIMIENTO);
}
