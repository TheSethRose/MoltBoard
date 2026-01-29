import { getTasks } from "@/lib/tasks-server";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server Component for the Tasks page.
 * Fetches initial task data on the server for SSR,
 * then passes it to the client component for hydration.
 */
export default async function TasksPage() {
  // Fetch tasks on the server for initial render
  const serverTasks = await getTasks();

  // Transform server tasks to client task format
  const initialTasks = serverTasks.map((task) => ({
    id: task.id,
    task_number: task.task_number,
    status: task.status,
    text: task.text,
    tags: task.tags,
    priority: task.priority,
    order: task.sort_order,
  }));

  return <TasksClient initialTasks={initialTasks} />;
}
