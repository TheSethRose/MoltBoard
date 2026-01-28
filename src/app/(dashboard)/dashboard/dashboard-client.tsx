"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Folder,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BarChart3,
  Zap,
} from "lucide-react";

interface DashboardData {
  projects: {
    id: number;
    name: string;
    description: string | null;
    github_repo_url: string | null;
    local_only: number;
    last_sync_at: string | null;
    created_at: string;
    task_count: number;
    open_count: number;
    completed_count: number;
    blocked_count: number;
    overdue_count: number;
    completion_rate: number;
    health_score: number;
  }[];
  summary: {
    total_projects: number;
    total_tasks: number;
    open_tasks: number;
    completed_tasks: number;
    blocked_tasks: number;
    overdue_tasks: number;
    overall_completion_rate: number;
    average_health_score: number;
  };
}

interface DashboardClientProps {
  data: DashboardData;
}

function formatLastSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "Never";
  const date = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function getHealthBadgeVariant(score: number): "default" | "secondary" | "outline" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  if (score >= 40) return "outline";
  return "destructive";
}

function getHealthIcon(score: number) {
  if (score >= 80) return <TrendingUp className="w-4 h-4" />;
  if (score >= 60) return <Minus className="w-4 h-4" />;
  if (score >= 40) return <TrendingDown className="w-4 h-4" />;
  return <AlertCircle className="w-4 h-4" />;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({
  project,
}: {
  project: DashboardData["projects"][0];
}) {
  const healthColor = getHealthColor(project.health_score);
  const healthVariant = getHealthBadgeVariant(project.health_score);

  return (
    <Card className="hover:bg-accent/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg">{project.name}</CardTitle>
          </div>
          <Badge variant={healthVariant} className="flex items-center gap-1">
            {getHealthIcon(project.health_score)}
            <span className={healthColor}>{project.health_score}</span>
          </Badge>
        </div>
        {project.description && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
            {project.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{project.completion_rate}%</span>
          </div>
          <Progress value={project.completion_rate} className="h-2" />
        </div>

        {/* Task Stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-semibold">{project.task_count}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-semibold">{project.open_count}</p>
            <p className="text-xs text-muted-foreground">Open</p>
          </div>
          <div className="p-2 rounded-md bg-green-500/10">
            <p className="text-lg font-semibold text-green-600">
              {project.completed_count}
            </p>
            <p className="text-xs text-muted-foreground">Done</p>
          </div>
          <div className="p-2 rounded-md bg-red-500/10">
            <p className="text-lg font-semibold text-red-600">
              {project.blocked_count}
            </p>
            <p className="text-xs text-muted-foreground">Blocked</p>
          </div>
        </div>

        {/* Meta Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span>Last sync: {formatLastSync(project.last_sync_at)}</span>
          </div>
          {project.local_only === 1 && <Badge variant="secondary">Local</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ data }: DashboardClientProps) {
  const { projects, summary } = data;

  // Sort projects by health score (worst first for attention)
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.health_score - b.health_score),
    [projects],
  );

  // Group projects by health tier
  const healthyProjects = useMemo(
    () => sortedProjects.filter((p) => p.health_score >= 80),
    [sortedProjects],
  );
  const warningProjects = useMemo(
    () => sortedProjects.filter((p) => p.health_score >= 40 && p.health_score < 80),
    [sortedProjects],
  );
  const criticalProjects = useMemo(
    () => sortedProjects.filter((p) => p.health_score < 40),
    [sortedProjects],
  );

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-border rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No projects yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first project to see dashboard metrics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={summary.total_projects}
          icon={Folder}
        />
        <StatCard
          title="Total Tasks"
          value={summary.total_tasks}
          icon={Target}
        />
        <StatCard
          title="Overall Progress"
          value={`${summary.overall_completion_rate}%`}
          subtitle={`${summary.completed_tasks} completed`}
          icon={BarChart3}
        />
        <StatCard
          title="Avg Health"
          value={summary.average_health_score}
          subtitle={
            summary.blocked_tasks > 0
              ? `${summary.blocked_tasks} blocked`
              : "All projects healthy"
          }
          icon={Zap}
          className={
            summary.average_health_score < 60
              ? "border-orange-500/50"
              : summary.average_health_score < 40
                ? "border-red-500/50"
                : ""
          }
        />
      </div>

      {/* Issues Summary */}
      {(summary.blocked_tasks > 0 || summary.overdue_tasks > 0) && (
        <div className="flex flex-wrap gap-2">
          {summary.blocked_tasks > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 text-red-600">
              <AlertCircle size={16} />
              <span className="text-sm font-medium">
                {summary.blocked_tasks} blocked task
                {summary.blocked_tasks !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {summary.overdue_tasks > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-orange-500/10 text-orange-600">
              <Clock size={16} />
              <span className="text-sm font-medium">
                {summary.overdue_tasks} overdue task
                {summary.overdue_tasks !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Projects by Health */}
      {criticalProjects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Needs Attention
            <Badge variant="destructive">{criticalProjects.length}</Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {criticalProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {warningProjects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Circle className="w-5 h-5 text-yellow-500" />
            Could Be Better
            <Badge variant="secondary">{warningProjects.length}</Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {warningProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {healthyProjects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            On Track
            <Badge variant="default">{healthyProjects.length}</Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {healthyProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
