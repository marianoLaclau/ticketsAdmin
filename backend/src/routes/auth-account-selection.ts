import { rolesTable, usuariosTable } from "@workspace/db";

export interface AuthAccountRecord {
  id: number;
  username: string | null;
  nombre: string;
  apellido: string | null;
  email: string;
  password_hash: string;
  activo: boolean;
  rol: string;
  rol_activo: boolean;
  debe_cambiar_password: boolean;
}

export const AUTH_ACCOUNT_COLUMNS = {
  id: usuariosTable.id,
  username: usuariosTable.username,
  nombre: usuariosTable.nombre,
  apellido: usuariosTable.apellido,
  email: usuariosTable.email,
  password_hash: usuariosTable.password_hash,
  activo: usuariosTable.activo,
  rol: rolesTable.nombre,
  rol_activo: rolesTable.activo,
  debe_cambiar_password: usuariosTable.debe_cambiar_password,
};
