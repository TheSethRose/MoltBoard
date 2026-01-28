import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { KeyedMutator } from "swr";
import type { Task } from "../types";

// Use negative temp IDs to avoid collision with real DB IDs
let tempIdCounter = -1;

interface UseTaskMutationsOptions {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  mutate: KeyedMutator<{ tasks: Task[] }>;
}

interface UseTaskMutationsReturn {
  addTask: (
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes?: string,
    blockedBy?: number[],
    projectId?: number | null,
  ) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  moveTask: (
    taskId: number,
    fromStatus: Task["status"],
    toStatus: Task["status"],
  ) => Promise<void>;
  saveTask: (
    id: number,
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes?: string,
    blockedBy?: number[],
    projectId?: number | null,
  ) => Promise<void>;
  reorderTasks: (status: Task["status"], taskIds: number[]) => Promise<void>;
  quickAdd: (text: string, defaultStatus: Task["status"]) => void;
  locallyModifiedTasks: React.MutableRefObject<Set<number>>;
}

export function useTaskMutations({
  tasks,
  setTasks,
  mutate,
}: UseTaskMutationsOptions): UseTaskMutationsReturn {
  const locallyModifiedTasks = useRef<Set<number>>(new Set());

  // Optimistic add - use negative temp ID, replace with real ID from response
  const addTask = useCallback(
    async (
      text: string,
      status: Task["status"],
      tags: string[],
      priority: Task["priority"],
      notes: string = "",
      blockedBy: number[] = [],
      projectId: number | null = null,
    ) => {
      const tempId = tempIdCounter--;
      const tempTaskNumber = tempIdCounter--;
      const optimisticTask: Task = {
        id: tempId,
        task_number: tempTaskNumber,
        text,
        status,
        tags,
        priority,
        notes,
        blocked_by: blockedBy,
        project_id: projectId,
        work_notes: [],
      };

      // Optimistic update
      setTasks((prev) => [...prev, optimisticTask]);

      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            status,
            tags,
            priority,
            notes,
            blocked_by: blockedBy,
            project_id: projectId,
          }),
        });

        if (!res.ok) throw new Error("Failed to add task");

        const { task: newTask } = await res.json();

        // Replace temp task with real task from DB
        setTasks((prev) =>
          prev.map((t) =>
            t.id === tempId
              ? {
                  ...newTask,
                  tags: newTask.tags || [],
                  blocked_by: newTask.blocked_by || [],
                }
              : t,
          ),
        );

        // Update SWR cache
        mutate();
        toast.success("Task added successfully");
      } catch {
        // Rollback on error
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        toast.error("Failed to add task");
      }
    },
    [setTasks, mutate],
  );

  // Quick add - add to specified status with defaults
  const quickAdd = useCallback(
    (text: string, defaultStatus: Task["status"]) => {
      addTask(text, defaultStatus, [], undefined, "", []);
    },
    [addTask],
  );

  // Optimistic delete
  const deleteTask = useCallback(
    async (id: number) => {
      const prevTasks = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));

      try {
        const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        // Update SWR cache
        mutate();
        toast.success("Task deleted");
      } catch {
        setTasks(prevTasks);
        toast.error("Failed to delete task");
      }
    },
    [tasks, setTasks, mutate],
  );

  // Optimistic move
  const moveTask = useCallback(
    async (
      taskId: number,
      fromStatus: Task["status"],
      toStatus: Task["status"],
    ) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: toStatus } : t)),
      );
      // Mark this task as locally modified so future refreshes preserve this change
      locallyModifiedTasks.current.add(taskId);

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status: toStatus }),
        });
        if (!res.ok) throw new Error("Failed to move");
        // Clear the local modification flag after successful sync
        locallyModifiedTasks.current.delete(taskId);
        // Update SWR cache
        mutate();
        toast.success("Task updated");
      } catch {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: fromStatus } : t)),
        );
        // Revert the local modification flag on error
        locallyModifiedTasks.current.delete(taskId);
        toast.error("Failed to update task");
      }
    },
    [setTasks, mutate],
  );

  // Optimistic reorder within column
  const reorderTasks = useCallback(
    async (status: Task["status"], taskIds: number[]) => {
      const prevTasks = tasks;

      setTasks((prev) =>
        prev.map((t) => {
          if (t.status !== status) return t;
          const newOrder = taskIds.indexOf(t.id);
          return newOrder !== -1 ? { ...t, order: newOrder * 10 } : t;
        }),
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, taskIds }),
        });
        if (!res.ok) throw new Error("Failed to reorder");
        // Update SWR cache
        mutate();
      } catch {
        setTasks(prevTasks);
        toast.error("Failed to reorder tasks");
      }
    },
    [tasks, setTasks, mutate],
  );

  // Optimistic edit
  const saveTask = useCallback(
    async (
      id: number,
      text: string,
      status: Task["status"],
      tags: string[],
      priority: Task["priority"],
      notes: string = "",
      blockedBy: number[] = [],
      projectId: number | null = null,
    ) => {
      const prevTask = tasks.find((t) => t.id === id);
      const statusChanged = prevTask && prevTask.status !== status;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                text,
                status,
                tags,
                priority,
                notes,
                blocked_by: blockedBy,
                project_id: projectId,
                work_notes: t.work_notes || [],
              }
            : t,
        ),
      );

      // Mark as locally modified if status changed
      if (statusChanged) {
        locallyModifiedTasks.current.add(id);
      }

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            text,
            status,
            tags,
            priority,
            notes,
            blocked_by: blockedBy,
            project_id: projectId,
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        // Clear the local modification flag after successful sync
        locallyModifiedTasks.current.delete(id);
        // Update SWR cache
        mutate();
        toast.success("Task saved");
      } catch {
        if (prevTask) {
          setTasks((prev) => prev.map((t) => (t.id === id ? prevTask : t)));
        }
        locallyModifiedTasks.current.delete(id);
        toast.error("Failed to update task");
      }
    },
    [tasks, setTasks, mutate],
  );

  return {
    addTask,
    deleteTask,
    moveTask,
    saveTask,
    reorderTasks,
    quickAdd,
    locallyModifiedTasks,
  };
}
