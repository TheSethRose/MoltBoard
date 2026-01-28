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

  if (pinned) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        aria-label={`Unpin ${projectName}`}
        title={`Unpin ${projectName}`}
      >
        <Pin size={16} className="text-primary" />
        {showLabel && <span className="ml-2">Pinned</span>}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      aria-label={`Pin ${projectName}`}
      title={`Pin ${projectName}`}
    >
      <PinOff size={16} />
      {showLabel && <span className="ml-2">Pin</span>}
    </Button>
  );
}
