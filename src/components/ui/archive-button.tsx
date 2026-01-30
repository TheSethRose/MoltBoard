"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Archive } from "lucide-react";

interface ArchiveButtonProps {
  onArchive: () => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  confirmAriaLabel?: string;
  cancelAriaLabel?: string;
}

const sizeConfig = {
  sm: { button: "h-7 w-7 min-h-[28px] min-w-[28px]", icon: "h-3.5 w-3.5" },
  md: { button: "h-8 w-8 min-h-[32px] min-w-[32px]", icon: "h-4 w-4" },
};

export function ArchiveButton({
  onArchive,
  size = "sm",
  className,
  disabled,
  ariaLabel = "Archive",
  confirmAriaLabel = "Confirm archive",
  cancelAriaLabel = "Cancel",
}: ArchiveButtonProps) {
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Handle mounting to avoid hydration mismatch
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    if (!isConfirming) {
      setIsConfirming(true);
      timeoutRef.current = setTimeout(() => {
        setIsConfirming(false);
      }, 3000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onArchive();
      setIsConfirming(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirming(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // Only animate after mount to avoid hydration mismatch
  const shouldAnimate = isMounted;

  return (
    <div className={cn("relative inline-flex items-center gap-1", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {isConfirming ? (
          <motion.div
            key="confirm"
            initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-0.5"
          >
            <button
              onClick={handleClick}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                sizeConfig[size].button,
              )}
              aria-label={confirmAriaLabel}
            >
              <Check className={sizeConfig[size].icon} />
            </button>
            <button
              onClick={handleCancel}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                sizeConfig[size].button,
              )}
              aria-label={cancelAriaLabel}
            >
              <X className={sizeConfig[size].icon} />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="archive"
            initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleClick}
            disabled={disabled}
            className={cn(
              "inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              sizeConfig[size].button,
              disabled && "opacity-50 cursor-not-allowed",
            )}
            aria-label={ariaLabel}
          >
            <Archive className={sizeConfig[size].icon} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
