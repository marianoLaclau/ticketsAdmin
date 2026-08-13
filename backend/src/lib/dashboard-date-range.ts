// Compatibilidad para consumidores existentes. El código nuevo debe importar
// exclusivamente desde la API pública del módulo Dashboard.
export {
  businessDayWindow,
  isDashboardDateRangeValid,
  normalizeDashboardDateQuery,
  type BusinessDayWindow,
  type DashboardDateRange,
} from "../modules/dashboard";
