"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  getColorLabel?: (value: number) => string;
}

function Progress({
  value,
  max = 100,
  className,
  getColorLabel,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  // Determine color based on percentage with redundant cues
  const getColorClass = (p: number) => {
    if (p >= 90) return "bg-red-500";
    if (p >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const colorLabel = getColorLabel
    ? getColorLabel(percentage)
    : percentage >= 90
      ? "Critical"
      : percentage >= 70
        ? "Warning"
        : "Normal";

  return (
    <div data-slot="progress" className="flex flex-col gap-1 w-full">
      <div
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${colorLabel}: ${Math.round(percentage)}%`}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-muted",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full transition-all duration-300 ease-in-out",
            getColorClass(percentage),
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {percentage.toFixed(0)}%
        </span>
        <span
          className={cn(
            percentage >= 90
              ? "text-red-300"
              : percentage >= 70
                ? "text-amber-300"
                : "text-green-300",
          )}
        >
          {colorLabel}
        </span>
      </div>
    </div>
  );
}

export { Progress };
