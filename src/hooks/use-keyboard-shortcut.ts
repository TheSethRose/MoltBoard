"use client";

import { useEffect, useRef } from "react";

interface UseKeyboardShortcutOptions {
  onTrigger: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({
  onTrigger,
  enabled = true,
}: UseKeyboardShortcutOptions) {
  const triggerRef = useRef(onTrigger);

  // Update ref when onTrigger changes
  useEffect(() => {
    triggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      const isMac =
        typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      if (modifierKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        triggerRef.current();
      }

      // Also support Escape to close
      if (e.key === "Escape") {
        // This will be handled by the CommandPalette component
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [enabled]);
}
