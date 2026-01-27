"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { toast } from "sonner";
import { Task } from "@/types/task";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

// Store for optimistic updates (negative IDs for temp tasks)
let tempIdCounter = -1;

export function useTasks() {
  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    "/api/tasks",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000, // 10 seconds - prevents duplicate requests
      refreshInterval: 30000, // 30 seconds - background refresh
    },
  );

  const addTask = useCallback(
    async (
      text: string,
      status: Task["status"],
      tags: string[],
      priority: Task["priority"],
    ) => {
      const tempId = tempIdCounter--;
      const tempTaskNumber = tempIdCounter--;
      const now = new Date().toISOString();
      const optimisticTask: Task = {
        id: tempId,
        task_number: tempTaskNumber,
        text,
        notes: "",
        status,
        tags,
        priority,
        sort_order: 9999,
        project_id: null,
        github_issue_id: null,
        github_issue_repo: null,
        created_at: now,
        updated_at: now,
        blocked_by: [],
        work_notes: [],
      };

      // Optimistic update
      await mutate(
        (current) => ({
          tasks: current
            ? [...current.tasks, optimisticTask]
            : [optimisticTask],
        }),
        false,
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, status, tags, priority }),
        });

        if (!res.ok) throw new Error("Failed to add task");

        const { task: newTask } = await res.json();

        // Replace temp task with real task from DB
        await mutate(
          (current) => ({
            tasks: current
              ? current.tasks.map((t) =>
                  t.id === tempId
                    ? { ...newTask, tags: newTask.tags || [] }
                    : t,
                )
              : [],
          }),
          false,
        );
      } catch (e) {
        // Rollback on error
        await mutate(
          (current) => ({
            tasks: current ? current.tasks.filter((t) => t.id !== tempId) : [],
          }),
          false,
        );
        toast.error("Failed to add task");
        throw e;
      }
    },
    [mutate],
  );

  const deleteTask = useCallback(
    async (id: number) => {
      // Store previous state for rollback
      let previousTasks: Task[] | undefined;

      await mutate((current) => {
        previousTasks = current?.tasks;
        return {
          tasks: current ? current.tasks.filter((t) => t.id !== id) : [],
        };
      }, false);

      try {
        const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
      } catch {
        // Rollback on error
        if (previousTasks) {
          await mutate({ tasks: previousTasks }, false);
        }
        toast.error("Failed to delete task");
      }
    },
    [mutate],
  );

  const moveTask = useCallback(
    async (taskId: number, toStatus: Task["status"]) => {
      const previousTasks = data?.tasks;

      await mutate(
        (current) => ({
          tasks: current
            ? current.tasks.map((t) =>
                t.id === taskId ? { ...t, status: toStatus } : t,
              )
            : [],
        }),
        false,
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status: toStatus }),
        });
        if (!res.ok) throw new Error("Failed to move");
      } catch {
        if (previousTasks) {
          await mutate({ tasks: previousTasks }, false);
        }
        toast.error("Failed to update task");
      }
    },
    [mutate, data?.tasks],
  );

  const reorderTasks = useCallback(
    async (status: Task["status"], taskIds: number[]) => {
      const previousTasks = data?.tasks;

      await mutate(
        (current) => ({
          tasks: current
            ? current.tasks.map((t) => {
                if (t.status !== status) return t;
                const newOrder = taskIds.indexOf(t.id);
                return newOrder !== -1 ? { ...t, order: newOrder * 10 } : t;
              })
            : [],
        }),
        false,
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, taskIds }),
        });
        if (!res.ok) throw new Error("Failed to reorder");
      } catch {
        if (previousTasks) {
          await mutate({ tasks: previousTasks }, false);
        }
        toast.error("Failed to reorder tasks");
      }
    },
    [mutate, data?.tasks],
  );

  const saveTask = useCallback(
    async (
      id: number,
      text: string,
      status: Task["status"],
      tags: string[],
      priority: Task["priority"],
    ) => {
      const previousTask = data?.tasks?.find((t) => t.id === id);

      await mutate(
        (current) => ({
          tasks: current
            ? current.tasks.map((t) =>
                t.id === id ? { ...t, text, status, tags, priority } : t,
              )
            : [],
        }),
        false,
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, text, status, tags, priority }),
        });
        if (!res.ok) throw new Error("Failed to save");
      } catch {
        if (previousTask) {
          await mutate(
            (current) => ({
              tasks: current
                ? current.tasks.map((t) => (t.id === id ? previousTask : t))
                : [],
            }),
            false,
          );
        }
        toast.error("Failed to update task");
      }
    },
    [mutate, data?.tasks],
  );

  return {
    tasks: data?.tasks || [],
    isLoading,
    error,
    addTask,
    deleteTask,
    moveTask,
    reorderTasks,
    saveTask,
    refresh: mutate,
  };
}
