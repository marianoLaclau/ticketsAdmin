export type AdminAccessState = "missing" | "pending" | "ready";

export function isCurrentAdminOperation(
  operationGeneration: number,
  currentGeneration: number,
  accessState: AdminAccessState,
): boolean {
  return accessState === "ready" && operationGeneration === currentGeneration;
}
