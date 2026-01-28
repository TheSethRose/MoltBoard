"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { TaskListView } from "@/components/ui/task-list-view";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { LayoutList, Kanban } from "lucide-react";
import { TaskModal } from "./TaskModal";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { useTaskMutations, useKeyboardNav } from "./hooks";
import type { Task, Project } from "./types";
import {
  getTaskStatuses,
  getDefaultTaskStatus,
  formatStatusLabel,
} from "@/lib/task-statuses";

const TASK_STATUSES = getTaskStatuses();
const DEFAULT_TASK_STATUS = getDefaultTaskStatus(TASK_STATUSES);

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

interface TasksClientProps {
  initialTasks: Task[];
  /** Optional project ID to filter tasks. When set, only shows tasks for this project. */
  projectId?: number;
  /** Whether to hide the project filter dropdown (useful when viewing a specific project) */
  hideProjectFilter?: boolean;
}

export function TasksClient({
  initialTasks,
  projectId,
  hideProjectFilter = false,
}: TasksClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalStatus, setAddModalStatus] =
    useState<Task["status"]>(DEFAULT_TASK_STATUS);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<{
    column: number;
    index: number;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // View toggle state
  type ViewMode = "kanban" | "list";
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // SWR configuration with fallback data for hydration
  const swrConfig: SWRConfiguration = {
    fallbackData: { tasks: initialTasks },
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
    refreshInterval: 5000,
  };

  // Use SWR for real-time updates after initial hydration
  // When projectId is set, filter tasks on the server side
  const tasksUrl = projectId
    ? `/api/tasks?project_id=${projectId}`
    : "/api/tasks";
  const { data, mutate } = useSWR<{ tasks: Task[] }>(
    tasksUrl,
    fetcher,
    swrConfig,
  );

  // Fetch projects for filter
  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    "/api/projects",
    fetcher,
  );

  // Project filter state - initialize to projectId if provided
  const [projectFilter, setProjectFilter] = useState<number | "all">(
    projectId ?? "all",
  );

  // Use extracted mutations hook
  const {
    addTask,
    deleteTask,
    moveTask,
    saveTask,
    reorderTasks,
    quickAdd,
    locallyModifiedTasks,
  } = useTaskMutations({ tasks, setTasks, mutate });

  // Force revalidate when tab becomes visible (for cron updates)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        mutate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [mutate]);

  // Track if we've done initial sync from SWR data
  const swrSynced = useRef(false);

  // Sync SWR data into local state when it changes (after initial load)
  useEffect(() => {
    if (data?.tasks && !swrSynced.current) {
      swrSynced.current = true;
      /* eslint-disable react-hooks/set-state-in-effect */
      setTasks((prevTasks) => {
        // Merge server tasks with local state, preserving local modifications
        const mergedTasks = data.tasks.map((serverTask: Task) => {
          const localTask = prevTasks.find((t) => t.id === serverTask.id);
          if (localTask && locallyModifiedTasks.current.has(localTask.id)) {
            return localTask;
          }
          return serverTask;
        });

        // Add any new local-only tasks (temporary tasks not yet saved)
        const serverTaskIds = new Set(data.tasks.map((t: Task) => t.id));
        const newLocalTasks = prevTasks.filter(
          (t) => !serverTaskIds.has(t.id) && t.id < 0,
        );

        return [...mergedTasks, ...newLocalTasks];
      });
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [data?.tasks, locallyModifiedTasks]);

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(
    new Set(),
  );

  const toggleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectColumnTasks = useCallback(
    (status: Task["status"]) => {
      const columnTaskIds = tasks
        .filter((t) => t.status === status)
        .map((t) => t.id);
      setSelectedTaskIds((prev) => new Set([...prev, ...columnTaskIds]));
    },
    [tasks],
  );

  const deselectColumnTasks = (status: Task["status"]) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      tasks
        .filter((t) => t.status === status)
        .forEach((t) => next.delete(t.id));
      return next;
    });
  };

  // Show delete confirmation dialog (for kanban board delete)
  const confirmDeleteTask = (id: number) => {
    setTaskToDelete(id);
    setDeleteConfirmOpen(true);
  };

  // Handle confirmed delete from dialog
  const handleConfirmedDelete = () => {
    if (taskToDelete !== null) {
      deleteTask(taskToDelete);
      setTaskToDelete(null);
    }
  };

  // Unified modal handler for both add and edit
  const handleSaveTask = async (
    id: number | null,
    text: string,
    status: Task["status"],
    tags: string[],
    priority: Task["priority"],
    notes: string,
    blockedBy: number[],
    projectId: number | null,
  ) => {
    if (id === null) {
      // Add mode
      await addTask(text, status, tags, priority, notes, blockedBy, projectId);
    } else {
      // Edit mode
      await saveTask(
        id,
        text,
        status,
        tags,
        priority,
        notes,
        blockedBy,
        projectId,
      );
    }
  };

  const openAddModal = useCallback((status: Task["status"]) => {
    setAddModalStatus(status);
    setEditingTask(null);
    setAddModalOpen(true);
  }, []);

  const openEditModal = useCallback((task: Task) => {
    setEditingTask(task);
    setAddModalOpen(true);
  }, []);

  const openShortcutsHelp = useCallback(() => {
    setShortcutsDialogOpen(true);
  }, []);

  // Update editingTask when tasks change (to keep it in sync)
  const prevEditingTaskId = useRef(editingTask?.id);

  useEffect(() => {
    if (!editingTask || editingTask.id === prevEditingTaskId.current) return;
    prevEditingTaskId.current = editingTask.id;
    const updatedTask = tasks.find((t) => t.id === editingTask.id);
    if (updatedTask && updatedTask !== editingTask) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setEditingTask(updatedTask);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [tasks, editingTask]);

  // Filter tasks by project if selected
  const filteredTasks = useMemo(() => {
    if (projectFilter === "all") return tasks;
    return tasks.filter((t) => t.project_id === projectFilter);
  }, [tasks, projectFilter]);

  const columns = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        id: status as Task["status"],
        title: formatStatusLabel(status).toUpperCase(),
        tasks: filteredTasks.filter((t) => t.status === status),
      })),
    [filteredTasks],
  );

  // Get all tasks in a flat array for keyboard navigation
  const getAllTasks = useCallback(() => columns, [columns]);

  // Use extracted keyboard navigation hook
  useKeyboardNav({
    columns,
    selectedTaskIndex,
    setSelectedTaskIndex,
    modalOpen: addModalOpen,
    defaultStatus: DEFAULT_TASK_STATUS as Task["status"],
    openAddModal,
    openEditModal,
    moveTask,
    deleteTask,
    setTaskToDelete,
    setDeleteConfirmOpen,
    openShortcutsHelp,
  });

  return (
    <div className="h-full flex flex-col">
      {/* View Toggle */}
      <div className="flex items-center justify-end gap-2 p-4 border-b border-border">
        <span className="text-sm text-muted-foreground mr-2">View:</span>
        <Button
          variant={viewMode === "kanban" ? "default" : "ghost"}
          size="sm"
          onClick={() => setViewMode("kanban")}
          className="gap-1"
        >
          <Kanban size={14} />
          Kanban
        </Button>
        <Button
          variant={viewMode === "list" ? "default" : "ghost"}
          size="sm"
          onClick={() => setViewMode("list")}
          className="gap-1"
        >
          <LayoutList size={14} />
          List
        </Button>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <KanbanBoard
          columns={columns}
          projects={hideProjectFilter ? undefined : projectsData?.projects}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          onTaskMove={moveTask}
          onTaskReorder={reorderTasks}
          onTaskDelete={confirmDeleteTask}
          onDeleteDirect={(id) => deleteTask(id)}
          onTaskEdit={openEditModal}
          onAddClick={openAddModal}
          onQuickAdd={(text) =>
            quickAdd(text, DEFAULT_TASK_STATUS as Task["status"])
          }
          selectedTaskId={
            selectedTaskIndex
              ? columns[selectedTaskIndex.column].tasks[selectedTaskIndex.index]
                  ?.id
              : null
          }
          onTaskSelect={(taskId) => {
            const cols = getAllTasks();
            for (let c = 0; c < cols.length; c++) {
              const idx = cols[c].tasks.findIndex((t) => t.id === taskId);
              if (idx !== -1) {
                setSelectedTaskIndex({ column: c, index: idx });
                break;
              }
            }
          }}
          selectedTaskIds={selectedTaskIds}
          onTaskToggleSelect={toggleSelectTask}
          onSelectColumn={selectColumnTasks}
          onDeselectColumn={deselectColumnTasks}
          onBulkMove={async (toStatus) => {
            for (const taskId of selectedTaskIds) {
              const task = tasks.find((t) => t.id === taskId);
              if (task) {
                await moveTask(taskId, task.status, toStatus);
              }
            }
            setSelectedTaskIds(new Set());
          }}
          onBulkDelete={async () => {
            const idsToDelete = Array.from(selectedTaskIds);
            for (const taskId of idsToDelete) {
              await deleteTask(taskId);
            }
            setSelectedTaskIds(new Set());
          }}
          className="flex-1 min-h-0 flex flex-col"
        />
      )}

      {/* List View */}
      {viewMode === "list" && (
        <TaskListView
          tasks={filteredTasks}
          projects={hideProjectFilter ? undefined : projectsData?.projects}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          selectedTaskIds={selectedTaskIds}
          onTaskToggleSelect={toggleSelectTask}
          onSelectAll={() => {
            filteredTasks.forEach((t) =>
              setSelectedTaskIds((prev) => new Set([...prev, t.id])),
            );
          }}
          onDeselectAll={() => {
            setSelectedTaskIds(new Set());
          }}
          onBulkMove={async (toStatus) => {
            for (const taskId of selectedTaskIds) {
              const task = tasks.find((t) => t.id === taskId);
              if (task) {
                await moveTask(taskId, task.status, toStatus);
              }
            }
            setSelectedTaskIds(new Set());
          }}
          onBulkDelete={async () => {
            const idsToDelete = Array.from(selectedTaskIds);
            for (const taskId of idsToDelete) {
              await deleteTask(taskId);
            }
            setSelectedTaskIds(new Set());
          }}
          onTaskEdit={openEditModal}
          onTaskDelete={confirmDeleteTask}
          className="flex-1 min-h-0 flex flex-col"
        />
      )}

      <TaskModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        task={editingTask}
        defaultStatus={addModalStatus}
        allTasks={tasks}
        projects={projectsData?.projects || []}
        defaultProjectId={projectId}
        onSave={handleSaveTask}
        onDelete={deleteTask}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Task?"
        description="This action cannot be undone. This will permanently delete the task and all its data."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmedDelete}
        variant="destructive"
      />

      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </div>
  );
}
