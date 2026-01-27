/**
 * Projects page - Server Component
 */
import ProjectsClient from "./projects-client";

export default function ProjectsPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-card-foreground">Projects</h1>
        <p className="text-muted-foreground">
          Organize and manage your projects
        </p>
      </div>

      <ProjectsClient />
    </div>
  );
}
