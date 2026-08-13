import type { ReactNode } from "react";
import { ErrorPage } from "@/components/ErrorPage";
import { useProtectedSessionUser } from "@/features/auth/useProtectedSessionUser";
import { puedeVerRendimiento } from "@/lib/roles";

/**
 * Frontera visual del espacio ejecutivo. El backend vuelve a validar la misma
 * capacidad en cada endpoint del módulo cuando exista información operativa.
 */
export function RendimientoRouteGuard({ children }: { children: ReactNode }) {
  const me = useProtectedSessionUser();

  if (!puedeVerRendimiento(me?.rol)) {
    return <ErrorPage status={403} embedded homeHref="/dashboard" />;
  }

  return <>{children}</>;
}
