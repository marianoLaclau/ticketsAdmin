import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Evita aplicar el resultado de una operación administrativa sobre un
 * componente que ya se desmontó.
 *
 * Antes este guard también seguía el estado de la elevación administrativa y
 * su generación, para descartar respuestas emitidas bajo un permiso que había
 * cambiado. Al eliminarse esa segunda verificación, la sesión SysAdmin es la
 * única frontera y solo queda la comprobación de montaje.
 */
export function useAdminOperationGuard() {
  const isMountedRef = useRef(false);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}
