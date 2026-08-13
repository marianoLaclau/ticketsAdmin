// Compatibilidad para consumidores existentes. El código nuevo debe importar
// exclusivamente desde la API pública del módulo Dashboard.
export {
  consultarDashboardStats,
  consultarMotivosDashboard,
  type DashboardMotivoResult,
  type DashboardStatsResult,
} from "../modules/dashboard";
