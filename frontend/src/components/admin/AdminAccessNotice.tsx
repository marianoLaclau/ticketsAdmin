import { AlertTriangle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminAccessState } from "@/lib/admin-access-state";

interface AdminAccessNoticeProps {
  state: Exclude<AdminAccessState, "ready">;
  pendingDescription: string;
  missingDescription: string;
}

export function AdminAccessNotice({
  state,
  pendingDescription,
  missingDescription,
}: AdminAccessNoticeProps) {
  const isPending = state === "pending";

  return (
    <Alert
      className="border-amber-200 bg-amber-50/50"
      role={isPending ? "status" : "alert"}
      aria-live={isPending ? "polite" : "assertive"}
      aria-atomic="true"
    >
      {isPending ? (
        <Loader2
          className="h-4 w-4 animate-spin text-amber-600 motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
      )}
      <AlertTitle>
        {isPending
          ? "Verificando el acceso administrativo"
          : "Habilitá el acceso administrativo"}
      </AlertTitle>
      <AlertDescription>
        {isPending ? pendingDescription : missingDescription}
      </AlertDescription>
    </Alert>
  );
}
