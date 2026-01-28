/**
 * Dashboard page - Server Component
 * Shows overview with task health metrics across all projects
 */
import { getDb, releaseDb } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

async function getDashboardData() {
  const db = await getDb();

  // Get all projects with task counts
  const projects = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.github_repo_url,
        p.local_only,
        p.last_sync_at,
        p.created_at,
        COUNT(t.id) as task_count
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `,
    )
    .all() as {
      id: number;
      name: string;
      description: string | null;
      github_repo_url: string | null;
      local_only: number;
      last_sync_at: string | null;
      created_at: string;
      task_count: number;
    }[];

  // Get task stats per project
  const taskStats = db
    .prepare(
      `
      SELECT
        project_id,
        status,
        priority,
        COUNT(*) as count
      FROM tasks
      WHERE project_id IS NOT NULL
      GROUP BY project_id, status
    `,
    )
    .all() as { project_id: number; status: string; priority: string; count: number }[];

  // Get overdue tasks (not completed, past due)
  const overdueTasks = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE project_id IS NOT NULL
        AND status != 'completed'
        AND due_at IS NOT NULL
        AND due_at < datetime('now')
    `,
    )
    .get() as { count: number };

  // Get blocked tasks
  const blockedTasks = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE project_id IS NOT NULL
        AND status = 'blocked'
    `,
    )
    .get() as { count: number };

  await releaseDb(db);

  // Calculate stats
  const statsByProject = new Map<
    number,
    { open: number; completed: number; blocked: number; overdue: number }
  >();

  projects.forEach((project) => {
    statsByProject.set(project.id, {
      open: 0,
      completed: 0,
      blocked: 0,
      overdue: 0,
    });
  });

  taskStats.forEach((stat) => {
    const entry = statsByProject.get(stat.project_id);
    if (entry) {
      if (stat.status === "completed") {
        entry.completed = stat.count;
      } else if (stat.status === "blocked") {
        entry.blocked = stat.count;
      } else {
        entry.open = stat.count;
      }
    }
  });

  // Calculate completion rate and health score
  const projectsWithHealth = projects.map((project) => {
    const stats = statsByProject.get(project.id) || {
      open: 0,
      completed: 0,
      blocked: 0,
      overdue: 0,
    };
    const total = stats.open + stats.completed;
    const completionRate = total > 0 ? (stats.completed / total) * 100 : 0;
    const hasUrgentTasks = false; // Would need separate query for this

    // Health score: 0-100
    // Penalize for blocked, overdue, and lack of progress
    let healthScore = 100;
    if (stats.blocked > 0) healthScore -= Math.min(stats.blocked * 10, 30);
    if (stats.overdue > 0) healthScore -= Math.min(stats.overdue * 5, 20);
    if (completionRate < 10 && total > 5) healthScore -= 10;
    healthScore = Math.max(0, healthScore);

    return {
      ...project,
      task_count: total,
      open_count: stats.open,
      completed_count: stats.completed,
      blocked_count: stats.blocked,
      overdue_count: stats.overdue,
      completion_rate: Math.round(completionRate),
      health_score: healthScore,
    };
  });

  // Overall stats
  const totalProjects = projects.length;
  const totalTasks = projectsWithHealth.reduce((sum, p) => sum + p.task_count, 0);
  const totalOpen = projectsWithHealth.reduce((sum, p) => sum + p.open_count, 0);
  const totalCompleted = projectsWithHealth.reduce(
    (sum, p) => sum + p.completed_count,
    0,
  );
  const totalBlocked = projectsWithHealth.reduce(
    (sum, p) => sum + p.blocked_count,
    0,
  );
  const overallCompletionRate =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return {
    projects: projectsWithHealth,
    summary: {
      total_projects: totalProjects,
      total_tasks: totalTasks,
      open_tasks: totalOpen,
      completed_tasks: totalCompleted,
      blocked_tasks: totalBlocked,
      overdue_tasks: overdueTasks.count,
      overall_completion_rate: overallCompletionRate,
      average_health_score: Math.round(
        projectsWithHealth.reduce((sum, p) => sum + p.health_score, 0) /
          (totalProjects || 1),
      ),
    },
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-card-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of all projects and task health metrics
        </p>
      </div>

      <DashboardClient data={data} />
    </div>
  );
}
