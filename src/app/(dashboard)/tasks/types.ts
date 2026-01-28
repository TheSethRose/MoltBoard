import type { TaskStatus } from "@/types/task";

export interface Task {
  id: number;
  task_number: number;
  status: TaskStatus;
  text: string;
  notes?: string;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  blocked_by?: number[]; // Array of task_numbers this task depends on
  project_id?: number | null;
  work_notes?: WorkNote[];
}

export interface WorkNote {
  id: string;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
}

export interface Project {
  id: number;
  name: string;
}

export {
  TAG_OPTIONS,
  TAG_COLORS,
  PRIORITY_OPTIONS,
  PRIORITY_COLORS,
} from "@/lib/constants";
