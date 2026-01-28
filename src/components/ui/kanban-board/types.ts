import type { TaskStatus } from "@/types/task";

export interface KanbanTask {
  id: number;
  task_number: number;
  text: string;
  status: TaskStatus;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  createdAt?: string;
  notes?: string;
  blocked_by?: number[];
  project_id?: number | null;
}

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: KanbanTask[];
}

export interface KanbanProject {
  id: number;
  name: string;
}
