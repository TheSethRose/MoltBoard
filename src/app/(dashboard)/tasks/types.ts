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

export const TAG_OPTIONS = [
  "bug",
  "feature",
  "task",
  "chore",
  "research",
  "spike",
  "maintenance",
  "safety",
  "audit",
];

export const TAG_COLORS: Record<string, string> = {
  bug: "bg-red-500/20 text-red-400 border-red-500/30",
  feature: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  task: "bg-green-500/20 text-green-400 border-green-500/30",
  chore: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  research: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  spike: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  maintenance: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  safety: "bg-red-500/20 text-red-400 border-red-500/30",
  audit: "bg-green-500/20 text-green-400 border-green-500/30",
};

export const PRIORITY_OPTIONS: {
  value: "urgent" | "high" | "medium" | "low";
  label: string;
}[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-emerald-500",
};
