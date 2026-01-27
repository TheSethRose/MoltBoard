/**
 * TypeScript type definitions for the Task Manager
 */

/**
 * Valid task status values
 */
export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in-progress'
  | 'pending'
  | 'completed'
  | 'blocked';

/**
 * Valid task priority values
 */
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Task tags type
 */
export type TaskTags = string[];

/**
 * Blocked by relationship (array of task IDs)
 */
export type BlockedBy = number[];

/**
 * Core Task interface matching SQLite schema
 */
export interface Task {
  /** Primary key */
  id: number;
  /** Task description */
  text: string;
  /** Current status */
  status: TaskStatus;
  /** Priority level */
  priority?: TaskPriority;
  /** JSON array of tags */
  tags: TaskTags;
  /** Display sort order */
  sort_order: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Additional notes */
  notes: string;
  /** Short title */
  title: string;
  /** Full description */
  description: string;
  /** Human-readable task number */
  task_number: number;
  /** Array of blocking task IDs */
  blocked_by: BlockedBy;
  /** Optional project reference */
  project_id?: number;
  /** GitHub issue reference */
  github_issue_id?: number;
}

/**
 * Task display format with markers
 */
export interface TaskDisplay {
  marker: string;
  text: string;
  tags: TaskTags;
  priority?: TaskPriority;
}

/**
 * Options for listing tasks
 */
export interface TaskListOptions {
  filter?: 'all' | TaskStatus;
  sortBy?: 'sort_order' | 'id' | 'priority';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Options for adding a task
 */
export interface AddTaskOptions {
  text: string;
  status?: 'ready' | 'pending';
  priority?: TaskPriority;
  tags?: TaskTags;
  project_id?: number;
  title?: string;
  description?: string;
}

/**
 * Options for updating a task
 */
export interface UpdateTaskOptions {
  text?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: TaskTags;
  notes?: string;
  title?: string;
  description?: string;
  blocked_by?: BlockedBy;
  project_id?: number;
  github_issue_id?: number;
}

/**
 * Task count summary by status
 */
export interface TaskCounts {
  ready: number;
  in_progress: number;
  pending: number;
  completed: number;
  blocked: number;
}

/**
 * Task query result with pattern matching support
 */
export interface TaskQueryResult {
  found: boolean;
  task?: Task;
  message?: string;
}
