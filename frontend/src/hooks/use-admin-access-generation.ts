import { useLayoutEffect, useRef, useState } from "react";

export function useAdminAccessGeneration(adminKey: string): number {
  const previousAdminKeyRef = useRef(adminKey);
  const [generation, setGeneration] = useState(0);

  useLayoutEffect(() => {
    if (previousAdminKeyRef.current === adminKey) return;
    previousAdminKeyRef.current = adminKey;
    setGeneration((current) => current + 1);
  }, [adminKey]);

  return generation;
}
