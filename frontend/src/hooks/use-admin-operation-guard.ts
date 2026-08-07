import { useCallback, useLayoutEffect, useRef } from "react";
import {
  isCurrentAdminOperation,
  type AdminCredentialState,
} from "@/lib/admin-credential-state";

export function useAdminOperationGuard(
  credentialState: AdminCredentialState,
  accessGeneration: number,
) {
  const isMountedRef = useRef(false);
  const latestCredentialStateRef = useRef(credentialState);
  const latestAccessGenerationRef = useRef(accessGeneration);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    latestCredentialStateRef.current = credentialState;
    latestAccessGenerationRef.current = accessGeneration;
  }, [accessGeneration, credentialState]);

  const isCurrentOperation = useCallback(
    (operationGeneration: number) =>
      isMountedRef.current &&
      isCurrentAdminOperation(
        operationGeneration,
        latestAccessGenerationRef.current,
        latestCredentialStateRef.current,
      ),
    [],
  );

  return {
    isCurrentOperation,
    operationGeneration: accessGeneration,
  };
}
