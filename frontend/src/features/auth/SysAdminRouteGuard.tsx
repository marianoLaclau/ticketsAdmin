import type { ReactNode } from "react";
import { ErrorPage } from "@/components/ErrorPage";
import { useProtectedSessionUser } from "@/features/auth/useProtectedSessionUser";
import { ROL_SYSADMIN } from "@/lib/roles";

/**
 * Autoriza la rama visual SysAdmin usando exclusivamente la identidad que
 * AuthGate ya verificó. El backend conserva la autorización definitiva.
 */
export function SysAdminRouteGuard({
  children,
  homeHref,
}: {
  children: ReactNode;
  homeHref?: string;
}) {
  const me = useProtectedSessionUser();

  if (me?.rol !== ROL_SYSADMIN) {
    return (
      <ErrorPage
        status={403}
        embedded
        {...(homeHref === undefined ? {} : { homeHref })}
      />
    );
  }
  return <>{children}</>;
}
