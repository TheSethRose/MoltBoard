"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { KEYBOARD_SHORTCUTS, type Shortcut } from "./shortcuts";

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutItem({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, index) => (
          <React.Fragment key={index}>
            <kbd className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground font-mono">
              {key}
            </kbd>
            {index < shortcut.keys.length - 1 && (
              <span className="text-xs text-muted-foreground">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ShortcutCategory({
  title,
  shortcuts,
}: {
  title: string;
  shortcuts: Shortcut[];
}) {
  if (shortcuts.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      <div className="border-t pt-2">
        {shortcuts.map((shortcut, index) => (
          <ShortcutItem key={index} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsProps) {
  // Group shortcuts by category
  const navigation = KEYBOARD_SHORTCUTS.filter(
    (s) => s.category === "navigation",
  );
  const editing = KEYBOARD_SHORTCUTS.filter((s) => s.category === "editing");
  const selection = KEYBOARD_SHORTCUTS.filter(
    (s) => s.category === "selection",
  );
  const help = KEYBOARD_SHORTCUTS.filter((s) => s.category === "help");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Press these keys to navigate and manage tasks faster.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <ShortcutCategory title="Navigation" shortcuts={navigation} />
          <ShortcutCategory title="Editing" shortcuts={editing} />
          <ShortcutCategory title="Selection" shortcuts={selection} />
          <ShortcutCategory title="Help" shortcuts={help} />
        </div>

        <div className="flex items-center justify-end border-t pt-4">
          <span className="text-xs text-muted-foreground">
            Press{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
