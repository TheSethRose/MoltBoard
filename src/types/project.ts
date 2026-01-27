/**
 * Shared Project types for the dashboard application.
 */

/** Project interface with all fields from the database */
export interface Project {
  id: number;
  name: string;
  description: string;
  tech_stack: string[]; // JSON array of technologies
  local_path: string; // Local filesystem path to project
  github_repo_url: string; // GitHub repository URL
  github_repo_full_name?: string | null;
  github_parent_repo?: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  open_task_count?: number;
  closed_task_count?: number;
  tags?: string[];
}

/** Simplified Project interface for UI components */
export interface ProjectSummary {
  id: number;
  name: string;
  color: string;
}

/** Minimal Project interface for dropdown/select */
export interface ProjectLite {
  id: number;
  name: string;
}

/** Database row interface (raw from SQLite) */
export interface DbProject {
  id: number;
  name: string;
  description: string;
  tech_stack: string; // JSON string from SQLite
  local_path: string;
  github_repo_url: string;
  github_repo_full_name?: string | null;
  github_parent_repo?: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  open_task_count?: number;
  closed_task_count?: number;
  tags?: string[];
}

/** Parses a DbProject row into a Project */
export function parseDbProject(row: DbProject): Project {
  let tech_stack: string[] = [];
  try {
    tech_stack = row.tech_stack ? JSON.parse(row.tech_stack) : [];
  } catch {
    tech_stack = [];
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    tech_stack,
    local_path: row.local_path || "",
    github_repo_url: row.github_repo_url || "",
    color: row.color || "#3B82F6",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Project color options for UI */
export const PROJECT_COLORS = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Red", value: "#EF4444" },
  { name: "Yellow", value: "#F59E0B" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
  { name: "Gray", value: "#6B7280" },
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number]["value"];
