"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Trash2,
  FileX,
  FolderX,
  Loader2,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CascadeOption = "metadata" | "tasks" | "all";

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  taskCount: number;
  hasLocalPath: boolean;
  localPath?: string | null;
  hasGitHubRepo?: boolean;
  onConfirm: (cascade: CascadeOption) => void | Promise<void>;
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  projectName,
  taskCount,
  hasLocalPath,
  localPath,
  hasGitHubRepo = false,
  onConfirm,
}: ProjectDeleteDialogProps) {
  const [cascade, setCascade] = useState<CascadeOption>("metadata");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm(cascade);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const cascadeOptions: {
    value: CascadeOption;
    label: string;
    description: string;
    icon: React.ReactNode;
    scope: string;
    warning?: string;
    disabled?: boolean;
  }[] = [
    {
      value: "metadata",
      label: "Project reference only",
      description:
        taskCount > 0
          ? `Keep all ${taskCount} task${taskCount !== 1 ? "s" : ""} (they will become unassigned)`
          : "No tasks to preserve",
      icon: <Trash2 size={18} aria-hidden="true" />,
      scope: "Local dashboard only",
    },
    {
      value: "tasks",
      label: "Project and tasks",
      description:
        taskCount > 0
          ? `Permanently delete ${taskCount} task${taskCount !== 1 ? "s" : ""} from the dashboard`
          : "No tasks associated",
      icon: <FileX size={18} aria-hidden="true" />,
      scope: "Local dashboard only",
      warning: taskCount > 0 ? "Tasks cannot be recovered" : undefined,
    },
    {
      value: "all",
      label: "Project, tasks, and local files",
      description: hasLocalPath
        ? "Delete cloned repository files from your computer"
        : "No local files to delete",
      icon: <FolderX size={18} aria-hidden="true" />,
      scope: "Local computer only",
      warning: hasLocalPath ? "Local files cannot be recovered" : undefined,
      disabled: !hasLocalPath,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={20} aria-hidden="true" />
            <span>Delete Project</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>
                You are about to delete{" "}
                <strong className="text-foreground break-words">
                  {projectName}
                </strong>
                . Choose what should happen to associated data.
              </p>

              {/* Scope clarification banner */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border text-sm">
                <Monitor
                  size={16}
                  className="shrink-0 mt-0.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    This only affects your local dashboard
                  </p>
                  <p className="text-muted-foreground">
                    {hasGitHubRepo
                      ? "Your GitHub repository will not be modified or deleted."
                      : "No remote repositories will be affected."}
                  </p>
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <fieldset className="py-2" disabled={isDeleting}>
          <legend className="sr-only">Deletion options</legend>
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Choose what to delete"
          >
            {cascadeOptions.map((option) => {
              const isSelected = cascade === option.value;
              const isDisabled = option.disabled || isDeleting;

              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    isSelected && !isDisabled && "border-primary bg-primary/5",
                    !isSelected &&
                      !isDisabled &&
                      "border-border hover:bg-accent/50",
                    isDisabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <input
                    type="radio"
                    name="cascade"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => !isDisabled && setCascade(option.value)}
                    disabled={isDisabled}
                    className="mt-1 h-4 w-4 shrink-0"
                    aria-describedby={`${option.value}-desc`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          option.value === "metadata" &&
                            "text-muted-foreground",
                          option.value === "tasks" && "text-orange-500",
                          option.value === "all" && "text-red-500",
                        )}
                      >
                        {option.icon}
                      </span>
                      <span className="font-medium text-sm">
                        {option.label}
                      </span>
                    </div>
                    <p
                      id={`${option.value}-desc`}
                      className="text-xs text-muted-foreground mt-1"
                    >
                      {option.description}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                      <Monitor size={10} aria-hidden="true" />
                      {option.scope}
                    </p>
                    {option.warning && isSelected && (
                      <p
                        className="text-xs text-destructive mt-1.5 font-medium flex items-center gap-1"
                        role="alert"
                      >
                        <AlertTriangle size={12} aria-hidden="true" />
                        {option.warning}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {cascade === "all" && hasLocalPath && (
          <div
            className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg"
            role="alert"
          >
            <p className="text-xs font-medium flex items-start gap-2">
              <AlertTriangle
                size={14}
                className="shrink-0 mt-0.5 text-destructive"
                aria-hidden="true"
              />
              <span className="text-destructive">
                <strong>Warning:</strong> Local files at{" "}
                <code className="text-[10px] bg-destructive/20 px-1 py-0.5 rounded break-all">
                  {localPath}
                </code>{" "}
                will be permanently deleted from your computer.
              </span>
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            aria-describedby="delete-action-desc"
          >
            {isDeleting && (
              <Loader2
                size={14}
                className="mr-2 animate-spin"
                aria-hidden="true"
              />
            )}
            {isDeleting ? "Deleting…" : "Delete Project"}
          </Button>
        </DialogFooter>
        <p id="delete-action-desc" className="sr-only">
          This will delete the project from your local dashboard
          {cascade === "tasks" && ` and ${taskCount} associated tasks`}
          {cascade === "all" &&
            hasLocalPath &&
            " and local files from your computer"}
        </p>
      </DialogContent>
    </Dialog>
  );
}
