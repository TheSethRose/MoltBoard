/**
 * Source of truth for keyboard shortcuts
 * Used by both useKeyboardNav hook and keyboard shortcuts help modal
 */

export interface Shortcut {
  /** Display name for the action */
  label: string;
  /** Keyboard keys to press (display format) */
  keys: string[];
  /** Description of what the shortcut does */
  description: string;
  /** Category for grouping */
  category: "navigation" | "editing" | "selection" | "help";
}

export const KEYBOARD_SHORTCUTS: Shortcut[] = [
  // Navigation
  {
    label: "Add new task",
    keys: ["n"],
    description: "Open the add task modal",
    category: "navigation",
  },
  {
    label: "Edit selected task",
    keys: ["e"],
    description: "Open edit modal for selected task",
    category: "navigation",
  },
  {
    label: "Move selection right",
    keys: ["→"],
    description: "Navigate to next column",
    category: "navigation",
  },
  {
    label: "Move selection left",
    keys: ["←"],
    description: "Navigate to previous column",
    category: "navigation",
  },
  {
    label: "Move selection down",
    keys: ["↓"],
    description: "Navigate to next task",
    category: "navigation",
  },
  {
    label: "Move selection up",
    keys: ["↑"],
    description: "Navigate to previous task",
    category: "navigation",
  },
  {
    label: "Go to first task",
    keys: ["Home"],
    description: "Jump to first task in first column",
    category: "navigation",
  },
  {
    label: "Go to last task",
    keys: ["End"],
    description: "Jump to last task in last column",
    category: "navigation",
  },
  {
    label: "Move task right",
    keys: ["Alt", "→"],
    description: "Move selected task to next column",
    category: "editing",
  },
  {
    label: "Move task left",
    keys: ["Alt", "←"],
    description: "Move selected task to previous column",
    category: "editing",
  },
  {
    label: "Delete task",
    keys: ["Delete"],
    description: "Open delete confirmation for selected task",
    category: "editing",
  },
  {
    label: "Quick delete task",
    keys: ["d"],
    description: "Immediately delete selected task (no confirmation)",
    category: "editing",
  },
  {
    label: "Clear selection",
    keys: ["Escape"],
    description: "Deselect current task",
    category: "selection",
  },
  {
    label: "Select left column",
    keys: ["h"],
    description: "Jump to same position in previous column",
    category: "selection",
  },
  {
    label: "Show keyboard shortcuts",
    keys: ["?"],
    description: "Open keyboard shortcuts help dialog",
    category: "help",
  },
  {
    label: "Show keyboard shortcuts",
    keys: ["Ctrl", "/"],
    description: "Open keyboard shortcuts help dialog",
    category: "help",
  },
  {
    label: "Show keyboard shortcuts (Mac)",
    keys: ["⌘", "/"],
    description: "Open keyboard shortcuts help dialog",
    category: "help",
  },
];

export function getShortcutsByCategory(category: Shortcut["category"]) {
  return KEYBOARD_SHORTCUTS.filter((s) => s.category === category);
}

export function getAllShortcuts() {
  return KEYBOARD_SHORTCUTS;
}
