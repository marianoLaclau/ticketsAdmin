import {
  businessDayWindow,
  isBusinessDateRangeValid,
  normalizeBusinessDateQuery,
  type BusinessDateRange,
  type BusinessDayWindow,
} from "../../../shared/time/business-date-range";

export type DashboardDateRange = BusinessDateRange;
export type { BusinessDayWindow };
export { businessDayWindow };

export const normalizeDashboardDateQuery = normalizeBusinessDateQuery;
export const isDashboardDateRangeValid = isBusinessDateRangeValid;
