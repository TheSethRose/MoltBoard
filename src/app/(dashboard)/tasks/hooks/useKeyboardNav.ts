import { useEffect, useCallback } from "react";
import { getTaskStatuses } from "@/lib/task-statuses";
import type { Task } from "../types";

const TASK_STATUSES = getTaskStatuses();

interface Column {
  id: Task["status"];
  title: string;
  tasks: Task[];
}

interface SelectedTaskIndex {
  column: number;
  index: number;
}

interface UseKeyboardNavOptions {
  columns: Column[];
  selectedTaskIndex: SelectedTaskIndex | null;
  setSelectedTaskIndex: React.Dispatch<
    React.SetStateAction<SelectedTaskIndex | null>
  >;
  modalOpen: boolean;
  defaultStatus: Task["status"];
  openAddModal: (status: Task["status"]) => void;
  openEditModal: (task: Task) => void;
  moveTask: (
    taskId: number,
    fromStatus: Task["status"],
    toStatus: Task["status"],
  ) => void;
  deleteTask: (id: number) => void;
  setTaskToDelete: (id: number | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
}

export function useKeyboardNav({
  columns,
  selectedTaskIndex,
  setSelectedTaskIndex,
  modalOpen,
  defaultStatus,
  openAddModal,
  openEditModal,
  moveTask,
  deleteTask,
  setTaskToDelete,
  setDeleteConfirmOpen,
}: UseKeyboardNavOptions): void {
  const getAllTasks = useCallback(() => columns, [columns]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when modal is open or when typing in an input
      if (modalOpen) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const cols = getAllTasks();
      const totalColumns = cols.length;
      const current = selectedTaskIndex;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case "n":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            openAddModal(defaultStatus);
          }
          break;

        case "e":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = cols[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              openEditModal(task);
            }
          }
          break;

        case "ArrowRight":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (e.altKey) {
              // Move task to next column
              const task = cols[current.column].tasks[current.index];
              const nextStatus = TASK_STATUSES[
                current.column + 1
              ] as Task["status"];
              if (task && nextStatus) {
                moveTask(task.id, task.status, nextStatus);
                setSelectedTaskIndex({
                  column: current.column + 1,
                  index: Math.min(
                    current.index,
                    cols[current.column + 1].tasks.length,
                  ),
                });
              }
            } else {
              setSelectedTaskIndex({
                column: current.column + 1,
                index: Math.min(
                  current.index,
                  cols[current.column + 1].tasks.length - 1,
                ),
              });
            }
          }
          break;

        case "ArrowLeft":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (e.altKey) {
              // Move task to previous column
              const task = cols[current.column].tasks[current.index];
              const prevStatus = TASK_STATUSES[
                current.column - 1
              ] as Task["status"];
              if (task && prevStatus) {
                moveTask(task.id, task.status, prevStatus);
                setSelectedTaskIndex({
                  column: current.column - 1,
                  index: Math.min(
                    current.index,
                    cols[current.column - 1].tasks.length,
                  ),
                });
              }
            } else {
              setSelectedTaskIndex({
                column: current.column - 1,
                index: Math.min(
                  current.index,
                  cols[current.column - 1].tasks.length - 1,
                ),
              });
            }
          }
          break;

        case "ArrowDown":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            const currentCol = cols[current.column];
            if (current.index < currentCol.tasks.length - 1) {
              setSelectedTaskIndex({ ...current, index: current.index + 1 });
            } else if (current.column < totalColumns - 1) {
              setSelectedTaskIndex({ column: current.column + 1, index: 0 });
            }
          }
          break;

        case "ArrowUp":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            if (current.index > 0) {
              setSelectedTaskIndex({ ...current, index: current.index - 1 });
            } else if (current.column > 0) {
              const prevCol = cols[current.column - 1];
              setSelectedTaskIndex({
                column: current.column - 1,
                index: prevCol.tasks.length - 1,
              });
            }
          }
          break;

        case "Home":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            setSelectedTaskIndex({ column: 0, index: 0 });
          }
          break;

        case "End":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            e.preventDefault();
            setSelectedTaskIndex({
              column: totalColumns - 1,
              index: cols[totalColumns - 1].tasks.length - 1,
            });
          }
          break;

        case "Delete":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = cols[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              setTaskToDelete(task.id);
              setDeleteConfirmOpen(true);
            }
          }
          break;

        case "d":
          if (!isCtrlOrMeta && !e.shiftKey && !e.altKey && current) {
            const task = cols[current.column].tasks[current.index];
            if (task) {
              e.preventDefault();
              deleteTask(task.id);
            }
          }
          break;

        case "Escape":
          if (current) {
            e.preventDefault();
            setSelectedTaskIndex(null);
          }
          break;

        case "h":
          e.preventDefault();
          if (current) {
            const prevCol = current.column - 1;
            if (prevCol >= 0) {
              const col = cols[prevCol];
              if (col.tasks.length > 0) {
                const newIndex = Math.min(current.index, col.tasks.length - 1);
                setSelectedTaskIndex({
                  column: prevCol,
                  index: newIndex >= 0 ? newIndex : 0,
                });
              }
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modalOpen,
    selectedTaskIndex,
    getAllTasks,
    defaultStatus,
    openAddModal,
    openEditModal,
    moveTask,
    deleteTask,
    setSelectedTaskIndex,
    setTaskToDelete,
    setDeleteConfirmOpen,
  ]);
}
