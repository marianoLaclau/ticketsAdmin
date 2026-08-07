export type AdminCredentialState = "missing" | "pending" | "ready";

export function getAdminCredentialState(
  currentKey: string,
  effectiveKey: string,
): AdminCredentialState {
  if (currentKey !== effectiveKey) return "pending";
  return effectiveKey ? "ready" : "missing";
}
