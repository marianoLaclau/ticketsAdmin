// Formas que el panel del resumen de equipo espera recibir. Viven aparte
// porque las consumen tanto el panel como sus tests, y mantenerlas junto al
// JSX hacía que el archivo creciera sin relación con la presentación.

export interface ResumenEquipoPeriodo {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  timezone: string;
  generado_en: string;
}

export interface ResumenEquipoEstadoActual {
  total: number;
  abiertos: number;
  finalizados: number;
  vencidos_abiertos: number;
}

export interface ResumenEquipoResolucionConFecha {
  muestra: number;
  promedio_horas: number | null;
  mediana_horas: number | null;
}

export interface ResumenEquipoCumplimiento {
  muestra: number;
  cumplidos: number;
  porcentaje: number | null;
}

export interface ResumenEquipoCumplimientoTotal extends ResumenEquipoCumplimiento {
  muestra_auditable: number;
  cumplidos_auditables: number;
  muestra_historica_reconstruida: number;
  cumplidos_historicos_reconstruidos: number;
}

export interface ResumenEquipoBacklogVencido {
  abiertos: number;
  con_plazo: number;
  vencidos: number;
  porcentaje: number | null;
}

export interface ResumenEquipoAntiguedadBacklog {
  muestra: number;
  mediana_horas_habiles: number | null;
}

export interface ResumenEquipoCoberturaAsignacion {
  abiertos: number;
  asignados: number;
  sin_asignar: number;
  porcentaje: number | null;
}

export interface ResumenEquipoEstadoDistribucion {
  nuevo: number;
  en_proceso: number;
  pendiente: number;
  resuelto: number;
  cerrado: number;
}

export interface ResumenEquipoPrioridadDistribucion {
  baja: number;
  media: number;
  alta: number;
  urgente: number;
}

export interface ResumenEquipoPanelProps {
  periodo: ResumenEquipoPeriodo;
  periodFilterLabel: string;
  tickets_ingresados: number;
  estado_actual: ResumenEquipoEstadoActual;
  resolucion_con_fecha: ResumenEquipoResolucionConFecha;
  cumplimiento_plazo_auditable: ResumenEquipoCumplimiento;
  cumplimiento_plazo: ResumenEquipoCumplimientoTotal;
  backlog_vencido: ResumenEquipoBacklogVencido;
  antiguedad_backlog: ResumenEquipoAntiguedadBacklog;
  cobertura_asignacion: ResumenEquipoCoberturaAsignacion;
  distribucion_estado: ResumenEquipoEstadoDistribucion;
  distribucion_prioridad: ResumenEquipoPrioridadDistribucion;
  onClearFilters: () => void;
}
