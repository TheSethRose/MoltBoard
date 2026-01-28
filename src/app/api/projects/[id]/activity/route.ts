import { NextRequest, NextResponse } from "next/server";
import { getDb, releaseDb } from "@/lib/db";
import {
  withErrorHandling,
  badRequest,
  notFound,
} from "@/lib/api-error-handler";

type ActivityEntry = {
  id: string;
  type: "task_note" | "status_change" | "system";
  task_id: number | null;
  task_number: number | null;
  task_title: string | null;
  content: string;
  author: "agent" | "system" | "human";
  timestamp: string;
  project_id: number;
};

interface ProjectActivityParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/activity - Get aggregated activity for a project
export const GET = withErrorHandling(
  async (
    _req: NextRequest,
    context?: ProjectActivityParams,
  ): Promise<NextResponse> => {
    const routeParams = await context?.params;
    const projectId = parseInt(routeParams?.id ?? "", 10);

    if (isNaN(projectId)) {
      throw badRequest("Invalid project ID", "INVALID_PROJECT_ID");
    }

    const db = await getDb();

    // Check project exists
    const project = db
      .prepare("SELECT id, name FROM projects WHERE id = ?")
      .get(projectId) as { id: number; name: string } | undefined;

    if (!project) {
      await releaseDb(db);
      throw notFound(
        `Project with id ${projectId} not found`,
        "PROJECT_NOT_FOUND",
      );
    }

    // Get URL params for pagination and filtering
    const url = _req.nextUrl;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10),
      100,
    );
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const typeFilter = url.searchParams.get("type"); // task_note, status_change, system
    const authorFilter = url.searchParams.get("author"); // agent, system, human
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const sortOrder = url.searchParams.get("sortOrder") || "desc"; // desc, asc

    // Validate date format and parse
    const parseDate = (dateStr: string | null): Date | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    };

    const fromDate = parseDate(dateFrom);
    const toDate = parseDate(dateTo);

    // Fetch tasks for this project with their work_notes
    const tasks = db
      .prepare(
        `
        SELECT id, task_number, text, status, work_notes, updated_at
        FROM tasks
        WHERE project_id = ?
        ORDER BY updated_at DESC
        LIMIT ?
        OFFSET ?
        `,
      )
      .all(projectId, limit * 2, offset) as
      | {
          id: number;
          task_number: number;
          text: string;
          status: string;
          work_notes: string | null;
          updated_at: string;
        }[]
      | undefined;

    // Fetch system activity entries for this project
    const systemActivities = db
      .prepare(
        `
        SELECT id, task_id, content, author, created_at, event_type
        FROM project_activity
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
        `,
      )
      .all(projectId, Math.ceil(limit / 2), offset) as
      | {
          id: number;
          task_id: number | null;
          content: string;
          author: string;
          created_at: string;
          event_type: string;
        }[]
      | undefined;

    await releaseDb(db);

    // Parse and aggregate activities
    const activityMap = new Map<string, ActivityEntry>();
    const now = new Date();

    // Process task work_notes
    for (const task of tasks || []) {
      const workNotes = parseWorkNotes(task.work_notes);

      for (const note of workNotes) {
        const noteId = `task-note-${task.id}-${note.id || Date.now()}`;
        const timestamp = note.timestamp
          ? new Date(note.timestamp)
          : new Date(task.updated_at);

        // Skip if timestamp is in the future (data issue)
        if (timestamp > now) continue;

        // Apply date filters
        if (fromDate && timestamp < fromDate) continue;
        if (toDate) {
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (timestamp > endOfDay) continue;
        }

        const entry: ActivityEntry = {
          id: noteId,
          type: "task_note",
          task_id: task.id,
          task_number: task.task_number,
          task_title: task.text,
          content: note.content || "",
          author: note.author || "system",
          timestamp: timestamp.toISOString(),
          project_id: projectId,
        };

        // Apply type filter if specified
        if (typeFilter && entry.type !== typeFilter) continue;
        // Apply author filter if specified
        if (authorFilter && entry.author !== authorFilter) continue;

        activityMap.set(noteId, entry);
      }

      // Add status change activity
      if (!typeFilter || typeFilter === "status_change") {
        const statusChangeId = `status-${task.id}`;
        const statusTimestamp = new Date(task.updated_at);

        if (statusTimestamp <= now) {
          // Apply date filters
          if (fromDate && statusTimestamp < fromDate) {
            // Skip - continue to next task
          } else if (toDate) {
            const endOfDay = new Date(toDate);
            endOfDay.setHours(23, 59, 59, 999);
            if (statusTimestamp > endOfDay) {
              // Skip - continue to next task
            } else {
              const entry: ActivityEntry = {
                id: statusChangeId,
                type: "status_change",
                task_id: task.id,
                task_number: task.task_number,
                task_title: task.text,
                content: `Status changed to ${task.status}`,
                author: "system",
                timestamp: statusTimestamp.toISOString(),
                project_id: projectId,
              };
              // Apply author filter (status changes are always "system")
              if (!authorFilter || entry.author === authorFilter) {
                activityMap.set(statusChangeId, entry);
              }
            }
          } else {
            const entry: ActivityEntry = {
              id: statusChangeId,
              type: "status_change",
              task_id: task.id,
              task_number: task.task_number,
              task_title: task.text,
              content: `Status changed to ${task.status}`,
              author: "system",
              timestamp: statusTimestamp.toISOString(),
              project_id: projectId,
            };
            // Apply author filter (status changes are always "system")
            if (!authorFilter || entry.author === authorFilter) {
              activityMap.set(statusChangeId, entry);
            }
          }
        }
      }
    }

    // Process system activities
    for (const activity of systemActivities || []) {
      const activityId = `system-${activity.id}`;
      const timestamp = new Date(activity.created_at);

      // Skip if timestamp is in the future (data issue)
      if (timestamp > now) continue;

      // Apply date filters
      if (fromDate && timestamp < fromDate) continue;
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (timestamp > endOfDay) continue;
      }

      const entry: ActivityEntry = {
        id: activityId,
        type: "system",
        task_id: activity.task_id || null,
        task_number: null,
        task_title: null,
        content: activity.content,
        author: activity.author as "agent" | "system" | "human",
        timestamp: timestamp.toISOString(),
        project_id: projectId,
      };

      // Apply type filter if specified
      if (typeFilter && entry.type !== typeFilter) continue;
      // Apply author filter if specified
      if (authorFilter && entry.author !== authorFilter) continue;

      activityMap.set(activityId, entry);
    }

    // Sort by timestamp and limit
    let activities = Array.from(activityMap.values());
    activities = activities
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      })
      .slice(0, limit);

    // Get total count for pagination
    const totalTasks = db
      .prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ?")
      .get(projectId) as { count: number };

    return NextResponse.json({
      success: true,
      project: { id: project.id, name: project.name },
      activity: activities,
      pagination: {
        limit,
        offset,
        total: totalTasks.count + (systemActivities?.length || 0),
        hasMore: activities.length === limit,
      },
    });
  },
  { context: { route: "/api/projects/[id]/activity", method: "GET" } },
);

// Helper to parse work_notes JSON
function parseWorkNotes(rawNotes: string | null): Array<{
  id?: string;
  content?: string;
  author?: "agent" | "system" | "human";
  timestamp?: string;
}> {
  if (!rawNotes) return [];

  try {
    const parsed = JSON.parse(rawNotes);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    // Handle legacy string format
    if (typeof rawNotes === "string" && rawNotes.trim()) {
      return [{ content: rawNotes, author: "system" as const }];
    }
    return [];
  }
}

// POST /api/projects/[id]/activity - Add a system activity entry
export const POST = withErrorHandling(
  async (
    req: NextRequest,
    context?: ProjectActivityParams,
  ): Promise<NextResponse> => {
    const routeParams = await context?.params;
    const projectId = parseInt(routeParams?.id ?? "", 10);

    if (isNaN(projectId)) {
      throw badRequest("Invalid project ID", "INVALID_PROJECT_ID");
    }

    const body = await req.json();
    const { content, event_type = "manual", task_id } = body;

    if (!content || typeof content !== "string") {
      throw badRequest("Activity content is required", "INVALID_CONTENT");
    }

    const db = await getDb();

    // Check project exists
    const project = db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId) as { id: number } | undefined;

    if (!project) {
      await releaseDb(db);
      throw notFound(
        `Project with id ${projectId} not found`,
        "PROJECT_NOT_FOUND",
      );
    }

    // Insert the activity entry
    const result = db
      .prepare(
        `
        INSERT INTO project_activity (project_id, task_id, content, author, event_type)
        VALUES (?, ?, ?, 'system', ?)
        `,
      )
      .run(projectId, task_id || null, content, event_type);

    await releaseDb(db);

    return NextResponse.json({
      success: true,
      activity: {
        id: result.lastInsertRowid,
        project_id: projectId,
        task_id: task_id || null,
        content,
        event_type,
      },
    });
  },
  { context: { route: "/api/projects/[id]/activity", method: "POST" } },
);
