import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible label for screen readers. Defaults to "Loading..." */
  ariaLabel?: string;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ariaLabel = "Loading...", ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton"
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
