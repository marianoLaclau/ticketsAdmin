import { seguimientosTable } from "@workspace/db";

/**
 * Contrato HTTP vigente de un seguimiento.
 *
 * Los snapshots internos para analítica no se exponen hasta incorporarlos al
 * contrato OpenAPI de forma deliberada.
 */
export const PUBLIC_FOLLOWUP_COLUMNS = {
  id: seguimientosTable.id,
  ticket_id: seguimientosTable.ticket_id,
  nota: seguimientosTable.nota,
  estado_anterior: seguimientosTable.estado_anterior,
  estado_nuevo: seguimientosTable.estado_nuevo,
  prioridad_anterior: seguimientosTable.prioridad_anterior,
  prioridad_nueva: seguimientosTable.prioridad_nueva,
  asignado_anterior_usuario_id: seguimientosTable.asignado_anterior_usuario_id,
  asignado_anterior: seguimientosTable.asignado_anterior,
  asignado_nuevo_usuario_id: seguimientosTable.asignado_nuevo_usuario_id,
  asignado_nuevo: seguimientosTable.asignado_nuevo,
  campos_editados: seguimientosTable.campos_editados,
  autor_usuario_id: seguimientosTable.autor_usuario_id,
  autor: seguimientosTable.autor,
  fecha_creacion: seguimientosTable.fecha_creacion,
} as const;
