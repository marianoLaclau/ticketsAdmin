import { LoaderCircle } from "lucide-react";

interface RendimientoRefreshStatusProps {
  visible: boolean;
}

/** Feedback discreto cuando se conserva el último snapshot durante un refetch. */
export function RendimientoRefreshStatus({
  visible,
}: RendimientoRefreshStatusProps) {
  if (!visible) return null;

  return (
    <div className="flex justify-end" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Actualizando indicadores…
      </span>
    </div>
  );
}
