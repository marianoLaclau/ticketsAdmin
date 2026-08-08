import { usuariosTable } from "@workspace/db/schema";

// Nunca devolver password_hash en una respuesta HTTP: ni siquiera hasheada,
// una contraseña no tiene por qué viajar de vuelta al cliente.
export const PUBLIC_ADMIN_USER_COLUMNS = {
  id: usuariosTable.id,
  nombre: usuariosTable.nombre,
  apellido: usuariosTable.apellido,
  username: usuariosTable.username,
  email: usuariosTable.email,
  role_id: usuariosTable.role_id,
  activo: usuariosTable.activo,
  debe_cambiar_password: usuariosTable.debe_cambiar_password,
  fecha_creacion: usuariosTable.fecha_creacion,
  fecha_actualizacion: usuariosTable.fecha_actualizacion,
};
