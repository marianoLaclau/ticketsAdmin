import { useCallback, useLayoutEffect, useRef } from "react";
import {
  isCurrentAdminOperation,
  type AdminAccessState,
} from "@/lib/admin-access-state";

export function useAdminOperationGuard(
  accessState: AdminAccessState,
  accessGeneration: number,
) {
  const isMountedRef = useRef(false);
  const latestAccessStateRef = useRef(accessState);
  const latestAccessGenerationRef = useRef(accessGeneration);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    latestAccessStateRef.current = accessState;
    latestAccessGenerationRef.current = accessGeneration;
  }, [accessGeneration, accessState]);

  const isCurrentOperation = useCallback(
    (operationGeneration: number) =>
      isMountedRef.current &&
      isCurrentAdminOperation(
        operationGeneration,
        latestAccessGenerationRef.current,
        latestAccessStateRef.current,
      ),
    [],
  );

  return {
    isCurrentOperation,
    operationGeneration: accessGeneration,
  };
}
