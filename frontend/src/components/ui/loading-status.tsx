import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LoadingStatusProps {
  children?: ReactNode;
  className?: string;
}

export function LoadingStatus({
  children = "Cargando datos",
  className,
}: LoadingStatusProps) {
  return (
    <span role="status" className={cn("sr-only", className)}>
      {children}
    </span>
  );
}
