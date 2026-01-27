/**
 * Shared Task types for the dashboard application.
 */

/** Task status enum (configurable via env) */
export type TaskStatus = string;

/** Task priority enum */
export type TaskPriority =
  | "urgent"
  | "high"
  | "medium"
  | "low"
  | undefined
  | null;

/** Task priority level enum (non-nullable) */
export type TaskPriorityLevel = "urgent" | "high" | "medium" | "low";

/** Full Task interface with all fields from the database */
export interface Task {
  id: number;
  task_number: number;
  status: TaskStatus;
  text: string;
  notes: string;
  tags: string[];
  priority: TaskPriorityLevel | null;
  sort_order: number;
  project_id: number | null; // Foreign key to projects table
  github_issue_id: number | null; // GitHub issue number for linked PRs
  github_issue_repo: string | null; // GitHub repo full name for linked issues
  created_at: string;
  updated_at: string;
  blocked_by: number[]; // Array of task_numbers this task depends on
  work_notes: WorkNote[]; // Array of timestamped comment objects
}

/** Work note entry for task progress tracking */
export interface WorkNote {
  id: string;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
}

/** Simplified Task interface for UI components */
export interface TaskSummary {
  id: number;
  task_number: number;
  status: TaskStatus;
  text: string;
  tags?: string[];
  priority?: TaskPriorityLevel;
  order?: number;
}

/** Minimal Task interface for status display */
export interface TaskLite {
  status: TaskStatus;
  text: string;
}

/** Database row interface (raw from SQLite) */
export interface DbTask {
  id: number;
  task_number: number | null;
  status: string;
  text: string;
  notes: string;
  tags: string;
  priority: string | null;
  sort_order: number;
  project_id: number | null;
  github_issue_id: number | null;
  github_issue_repo: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: string; // JSON array of task_numbers
  work_notes: string; // JSON array of WorkNote objects
}

/** Parses a DbTask row into a Task */
export function parseDbTask(row: DbTask): Task {
  return {
    id: row.id,
    task_number: row.task_number || row.id,
    status: row.status as TaskStatus,
    text: row.text,
    notes: row.notes || "",
    tags: JSON.parse(row.tags || "[]"),
    priority: row.priority as TaskPriorityLevel | null,
    sort_order: row.sort_order,
    project_id: row.project_id || null,
    github_issue_id: row.github_issue_id || null,
    github_issue_repo: row.github_issue_repo || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    blocked_by: JSON.parse(row.blocked_by || "[]"),
    work_notes: JSON.parse(row.work_notes || "[]"),
  };
}
