import { getDb, releaseDb } from "@/lib/db";
import type { TaskStatus } from "@/types/task";

interface Project {
  id: number;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  local_only: number;
  auto_provision_workspace: number;
  local_path: string | null;
  tech_stack: string | null;
  github_sync_settings: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
}

interface Task {
  id: number;
  task_number: number;
  text: string;
  status: TaskStatus;
  notes?: string;
  tags?: string; // JSON string from DB
  priority?: "urgent" | "high" | "medium" | "low" | null;
  order?: number;
  blocked_by?: string; // JSON string from DB
  project_id?: number | null;
}

interface PageProps {
  params: { id: string };
}

async function getProject(id: number): Promise<Project | null> {
  const db = getDb();
  try {
    const project = db
      .prepare(
        `
      SELECT
        p.id,
        p.name,
        p.description,
        p.github_repo_url,
        p.local_only,
        p.auto_provision_workspace,
        p.local_path,
        p.tech_stack,
        p.github_sync_settings,
        p.created_at,
        p.updated_at,
        COUNT(t.id) as task_count
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `,
      )
      .get(id) as Project | undefined;
    return project || null;
  } finally {
    releaseDb(db);
  }
}

async function getTasks(projectId: number): Promise<Task[]> {
  const db = getDb();
  try {
    return db
      .prepare(
        `
      SELECT id, task_number, text, status, notes, tags, priority, sort_order, blocked_by, project_id
      FROM tasks
      WHERE project_id = ?
      ORDER BY sort_order ASC
    `,
      )
      .all(projectId) as Task[];
  } finally {
    releaseDb(db);
  }
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const projectId = parseInt(id);

  if (isNaN(projectId)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Invalid project ID</div>
      </div>
    );
  }

  const [project, tasks] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
  ]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Project not found</div>
      </div>
    );
  }

  // Parse JSON fields
  const parsedTasks = tasks.map((task) => ({
    ...task,
    tags: task.tags ? JSON.parse(task.tags) : [],
    blocked_by: task.blocked_by ? JSON.parse(task.blocked_by) : [],
  }));

  const ProjectDetailClient = (await import("./project-detail-client")).default;

  return (
    <ProjectDetailClient initialProject={project} initialTasks={parsedTasks} />
  );
}
