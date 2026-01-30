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
  const updateCache = useCallback(
    (nextTasks: Task[]) => {
      mutate({ tasks: nextTasks }, false);
    },
    [mutate],
  );

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
      const prevTasks = tasks;
      const optimisticTasks = [...prevTasks, optimisticTask];
      setTasks(optimisticTasks);
      updateCache(optimisticTasks);

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
        const syncedTasks = optimisticTasks.map((t) =>
          t.id === tempId
            ? {
                ...newTask,
                tags: newTask.tags || [],
                blocked_by: newTask.blocked_by || [],
              }
            : t,
        );
        setTasks(syncedTasks);
        updateCache(syncedTasks);
        toast.success("Task added successfully");
      } catch {
        // Rollback on error
        setTasks(prevTasks);
        updateCache(prevTasks);
        toast.error("Failed to add task");
      }
    },
    [tasks, setTasks, updateCache],
  );

  // Optimistic archive - move task to completed with archive flag
  const archiveTask = useCallback(
    async (id: number) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      const prevTasks = tasks;
      const updatedTasks = prevTasks.map((t) =>
        t.id === id ? { ...t, status: "completed" as const } : t,
      );
      setTasks(updatedTasks);
      updateCache(updatedTasks);

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            status: "completed",
            append_work_note: true,
            work_notes: {
              content: "Task archived from task card",
              author: "human",
            },
          }),
        });
        if (!res.ok) throw new Error("Failed to archive");
        toast.success("Task archived");
      } catch {
        setTasks(prevTasks);
        updateCache(prevTasks);
        toast.error("Failed to archive task");
      }
    },
    [tasks, setTasks, updateCache],
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
      let updatedTasks: Task[] | null = null;
      setTasks((prev) => {
        updatedTasks = prev.filter((t) => t.id !== id);
        return updatedTasks;
      });
      if (updatedTasks) {
        updateCache(updatedTasks);
      }

      try {
        const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        // Update SWR cache without revalidation
        if (updatedTasks) {
          updateCache(updatedTasks);
        }
        toast.success("Task deleted");
      } catch {
        setTasks(prevTasks);
        updateCache(prevTasks);
        toast.error("Failed to delete task");
      }
    },
    [tasks, setTasks, updateCache],
  );

  // Optimistic move
  const moveTask = useCallback(
    async (
      taskId: number,
      fromStatus: Task["status"],
      toStatus: Task["status"],
    ) => {
      const prevTasks = tasks;
      const updatedTasks = prevTasks.map((t) =>
        t.id === taskId ? { ...t, status: toStatus } : t,
      );
      setTasks(updatedTasks);
      updateCache(updatedTasks);
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
        toast.success("Task updated");
      } catch {
        const rolledBackTasks = prevTasks.map((t) =>
          t.id === taskId ? { ...t, status: fromStatus } : t,
        );
        setTasks(rolledBackTasks);
        updateCache(rolledBackTasks);
        // Revert the local modification flag on error
        locallyModifiedTasks.current.delete(taskId);
        toast.error("Failed to update task");
      }
    },
    [tasks, setTasks, updateCache],
  );

  // Optimistic reorder within column
  const reorderTasks = useCallback(
    async (status: Task["status"], taskIds: number[]) => {
      const prevTasks = tasks;
      const updatedTasks = prevTasks.map((t) => {
        if (t.status !== status) return t;
        const newOrder = taskIds.indexOf(t.id);
        return newOrder !== -1 ? { ...t, order: newOrder * 10 } : t;
      });
      setTasks(updatedTasks);
      updateCache(updatedTasks);

      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, taskIds }),
        });
        if (!res.ok) throw new Error("Failed to reorder");
      } catch {
        setTasks(prevTasks);
        updateCache(prevTasks);
        toast.error("Failed to reorder tasks");
      }
    },
    [tasks, setTasks, updateCache],
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
      const updatedTasks = tasks.map((t) =>
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
      );
      setTasks(updatedTasks);
      updateCache(updatedTasks);

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
        toast.success("Task saved");
      } catch {
        if (prevTask) {
          const rolledBackTasks = tasks.map((t) =>
            t.id === id ? prevTask : t,
          );
          setTasks(rolledBackTasks);
          updateCache(rolledBackTasks);
        }
        locallyModifiedTasks.current.delete(id);
        toast.error("Failed to update task");
      }
    },
    [tasks, setTasks, updateCache],
  );

  return {
    addTask,
    deleteTask,
    archiveTask,
    moveTask,
    saveTask,
    reorderTasks,
    quickAdd,
    locallyModifiedTasks,
  };
}
