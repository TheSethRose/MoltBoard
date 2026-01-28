"use client";

import { useSyncExternalStore, useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import useSWR from "swr";
import {
  LayoutList,
  Folder,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Search,
  Command,
  Pin,
} from "lucide-react";
import { CommandPalette } from "@/components/ui/command-palette";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";

interface SidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/status", label: "Status", icon: Settings2 },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Project {
  id: number;
  name: string;
}

// Custom hook for localStorage with SSR support
function useLocalStorage(
  key: string,
  initialValue: boolean,
): [boolean, (value: boolean) => void] {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : initialValue;
  }, [key, initialValue]);

  const getServerSnapshot = useCallback(() => initialValue, [initialValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (newValue: boolean) => {
      localStorage.setItem(key, JSON.stringify(newValue));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key],
  );

  return [value, setValue];
}

export function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [collapsed, setCollapsed] = useLocalStorage("sidebar-collapsed", false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { pinnedIds } = usePinnedProjects();

  // Fetch projects to get names for pinned projects
  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    "/api/projects",
    fetcher,
    { fallbackData: { projects: [] } },
  );

  // Get pinned projects with their full details
  const pinnedProjects = (projectsData?.projects || []).filter((p) =>
    pinnedIds.includes(p.id),
  );

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Keyboard shortcut for command palette
  useKeyboardShortcut({
    onTrigger: () => setCommandPaletteOpen(true),
    enabled: mounted,
  });

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`bg-card border-r border-border flex flex-col transition-all ${collapsed ? "w-16" : "w-64"}`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          {!collapsed && (
            <h1 className="font-bold text-card-foreground">MoltBoard</h1>
          )}
          {collapsed && pinnedProjects.length > 0 && (
            <div className="flex items-center justify-center w-full">
              <Pin size={14} className="text-primary" aria-label={`${pinnedProjects.length} pinned projects`} />
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-2 min-h-[36px] min-w-[36px] rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 touch-action-manipulation"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {/* Pinned Projects */}
          {pinnedProjects.length > 0 && !collapsed && (
            <div className="mb-4">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pinned
              </p>
              <div className="space-y-1">
                {pinnedProjects.map((project) => {
                  const isActive = pathname === `/projects/${project.id}`;
                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className={`flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-md transition-colors touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Pin size={16} className="text-primary" aria-hidden="true" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main Navigation Items */}
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-md transition-colors touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          {!collapsed && mounted && (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
              <span>
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </button>
          )}
          {collapsed && mounted && (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center px-3 py-2 min-h-[40px] rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          )}
          {!collapsed && (
            <p className="text-xs text-muted-foreground pt-2">v2026.1.23</p>
          )}
        </div>
      </aside>

      {/* Main Content - fills remaining space */}
      <main className="flex-1 overflow-hidden flex flex-col p-4">
        {children}
      </main>

      {/* Command Palette */}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

      {/* Command Palette Trigger Button */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg shadow-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring z-40"
        aria-label="Open command palette (Cmd+K)"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          <Command size={10} />
          K
        </kbd>
      </button>
    </div>
  );
}
