"use client";

import { Button } from "@/components/ui/button";
import { Pin, PinOff } from "lucide-react";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";

interface PinButtonProps {
  projectId: number;
  projectName: string;
  variant?: "ghost" | "outline" | "default" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showLabel?: boolean;
}

export function PinButton({
  projectId,
  projectName,
  variant = "ghost",
  size = "icon",
  className,
  showLabel = false,
}: PinButtonProps) {
  const { isPinned, togglePin } = usePinnedProjects();
  const pinned = isPinned(projectId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePin(projectId);
  };

  const icon = pinned ? (
    <Pin size={16} className="text-primary" />
  ) : (
    <PinOff size={16} />
  );

  if (showLabel) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className={className}
        aria-label={pinned ? `Unpin ${projectName}` : `Pin ${projectName}`}
        title={pinned ? `Unpin ${projectName}` : `Pin ${projectName}`}
      >
        {icon}
        <span className="ml-2">{pinned ? "Pinned" : "Pin"}</span>
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      aria-label={pinned ? `Unpin ${projectName}` : `Pin ${projectName}`}
      title={pinned ? `Unpin ${projectName}` : `Pin ${projectName}`}
    >
      {icon}
    </Button>
  );
}
