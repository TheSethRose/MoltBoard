"use client";

import * as React from "react";
import {
  Search,
  CheckSquare,
  Folder,
  ArrowRight,
  Plus,
  Keyboard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  type: "task" | "project" | "action";
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Mock data - in production, fetch from API based on query
  const [results, setResults] = React.useState<CommandItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setSelectedIndex(0);
      // Load initial results
      loadInitialResults();
    }
  }, [open]);

  // Load initial suggestions
  const loadInitialResults = async () => {
    setLoading(true);
    try {
      // Fetch recent tasks and projects
      const [tasksRes, projectsRes] = await Promise.all([
        fetch("/api/tasks?project_id=8").then((r) => r.json()),
        fetch("/api/projects").then((r) => r.json()),
      ]);

      const tasks = (tasksRes.tasks || []).slice(0, 5).map((task: any) => ({
        id: `task-${task.id}`,
        type: "task" as const,
        title: `#${task.task_number}: ${task.text}`,
        subtitle: task.status,
        icon: <CheckSquare size={16} className="text-muted-foreground" />,
      }));

      const projects = (projectsRes.projects || []).slice(0, 5).map(
        (project: any) =>
          ({
            id: `project-${project.id}`,
            type: "project" as const,
            title: project.name,
            subtitle: `${project.open_task_count || 0} open tasks`,
            icon: <Folder size={16} className="text-muted-foreground" />,
          } as CommandItem),
      );

      const actions: CommandItem[] = [
        {
          id: "action-new-task",
          type: "action",
          title: "Create new task",
          subtitle: "Add a task to the current project",
          icon: <Plus size={16} className="text-muted-foreground" />,
        },
        {
          id: "action-new-project",
          type: "action",
          title: "Create new project",
          subtitle: "Set up a new project",
          icon: <Folder size={16} className="text-muted-foreground" />,
        },
      ];

      setResults([...actions, ...tasks, ...projects]);
    } catch (error) {
      console.error("Failed to load command palette results:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Search when query changes
  React.useEffect(() => {
    if (!query.trim()) {
      loadInitialResults();
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const [tasksRes, projectsRes] = await Promise.all([
          fetch(`/api/tasks?project_id=8`).then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()),
        ]);

        const queryLower = query.toLowerCase();

        const filteredTasks = (tasksRes.tasks || [])
          .filter((task: any) =>
            task.text.toLowerCase().includes(queryLower),
          )
          .slice(0, 5)
          .map((task: any) => ({
            id: `task-${task.id}`,
            type: "task" as const,
            title: `#${task.task_number}: ${task.text}`,
            subtitle: task.status,
            icon: <CheckSquare size={16} className="text-muted-foreground" />,
          }));

        const filteredProjects = (projectsRes.projects || [])
          .filter((project: any) =>
            project.name.toLowerCase().includes(queryLower),
          )
          .slice(0, 5)
          .map(
            (project: any) =>
              ({
                id: `project-${project.id}`,
                type: "project" as const,
                title: project.name,
                subtitle: `${project.open_task_count || 0} open tasks`,
                icon: <Folder size={16} className="text-muted-foreground" />,
              } as CommandItem),
          );

        setResults([...filteredTasks, ...filteredProjects]);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Failed to search:", error);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  // Scroll selected item into view
  React.useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, results.length]);

  const handleSelect = (item: CommandItem) => {
    if (item.action) {
      item.action();
    } else if (item.type === "task") {
      // Navigate to task or open task modal
      console.log("Navigate to task:", item.id);
    } else if (item.type === "project") {
      // Navigate to project
      console.log("Navigate to project:", item.id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl max-w-[500px]" hideCloseButton>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search size={16} className="text-muted-foreground" />
            <span>Command Palette</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, projects, or type a command..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <ul
              ref={listRef}
              className="space-y-1"
              role="listbox"
              aria-label="Command results"
            >
              {results.map((item, index) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors touch-action-manipulation",
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-foreground",
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{item.title}</div>
                    {item.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  {index === selectedIndex && (
                    <ArrowRight
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ↑
              </kbd>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ↵ Enter
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                esc
              </kbd>
              Close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
