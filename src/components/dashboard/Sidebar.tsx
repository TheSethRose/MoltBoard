"use client";

import { useSyncExternalStore, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutList,
  Folder,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";

interface SidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/tasks", label: "Tasks", icon: LayoutList },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/status", label: "Status", icon: Settings2 },
];

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
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorage("sidebar-collapsed", false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

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
          <button
            onClick={toggleCollapsed}
            className="p-2 min-h-[36px] min-w-[36px] rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 touch-action-manipulation"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1" aria-label="Main navigation">
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
    </div>
  );
}
