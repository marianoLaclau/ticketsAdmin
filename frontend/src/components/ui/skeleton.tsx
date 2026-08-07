import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export { Skeleton };
