/**
 * API client for MoltBoard.
 *
 * When scripts run inside a Docker sandbox, they cannot access the SQLite
 * database directly. This client provides HTTP-based access to the MoltBoard
 * API running on the host.
 *
 * The client auto-detects whether it's running in Docker and adjusts the
 * base URL accordingly:
 * - Docker: http://host.docker.internal:5278
 * - Host: http://localhost:5278
 */

import fs from "node:fs";

// Detect Docker environment
function isDockerEnvironment() {
  // Check for Docker-specific files
  if (fs.existsSync("/.dockerenv")) return true;
  // Check for cgroup indicators
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf-8");
    if (cgroup.includes("docker") || cgroup.includes("kubepods")) return true;
  } catch {
    // Not in Linux/Docker
  }
  return false;
}

const IS_DOCKER = isDockerEnvironment();
const DEFAULT_HOST = IS_DOCKER ? "host.docker.internal" : "localhost";
const DEFAULT_PORT = process.env.MOLTBOARD_PORT || "5278";
const BASE_URL =
  process.env.MOLTBOARD_API_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

/**
 * Make an API request to MoltBoard.
 * @param {string} endpoint - API endpoint (e.g., "/api/tasks")
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - JSON response
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Get all tasks, optionally filtered by project.
 * @param {object} options - Query options
 * @param {number} [options.projectId] - Filter by project ID
 * @param {boolean} [options.includeArchived] - Include archived tasks
 * @returns {Promise<{tasks: object[], tagColors: object}>}
 */
export async function getTasks(options = {}) {
  const params = new URLSearchParams();
  if (options.projectId) params.set("project_id", String(options.projectId));
  if (options.includeArchived) params.set("include_archived", "true");

  const query = params.toString();
  const endpoint = `/api/tasks${query ? `?${query}` : ""}`;
  return apiRequest(endpoint);
}

/**
 * Get a single task by ID or task number.
 * @param {object} options - Query options
 * @param {number} [options.id] - Task ID
 * @param {number} [options.taskNumber] - Task number
 * @returns {Promise<object|null>} - Task object or null if not found
 */
export async function getTask(options = {}) {
  const { tasks } = await getTasks();
  if (options.id) {
    return tasks.find((t) => t.id === options.id) || null;
  }
  if (options.taskNumber) {
    return tasks.find((t) => t.task_number === options.taskNumber) || null;
  }
  return null;
}

/**
 * Create a new task.
 * @param {object} taskData - Task data
 * @param {string} taskData.text - Task text (required)
 * @param {string} [taskData.status] - Task status
 * @param {string[]} [taskData.tags] - Task tags
 * @param {string} [taskData.priority] - Task priority
 * @param {string} [taskData.notes] - Task notes
 * @param {number[]} [taskData.blocked_by] - Blocked by task numbers
 * @param {number} [taskData.project_id] - Project ID
 * @returns {Promise<{task: object}>}
 */
export async function createTask(taskData) {
  return apiRequest("/api/tasks", {
    method: "POST",
    body: JSON.stringify(taskData),
  });
}

/**
 * Update a task.
 * @param {number} id - Task ID
 * @param {object} updates - Fields to update
 * @returns {Promise<{task: object}>}
 */
export async function updateTask(id, updates) {
  return apiRequest("/api/tasks", {
    method: "PUT",
    body: JSON.stringify({ id, ...updates }),
  });
}

/**
 * Append a work note to a task.
 * @param {number} id - Task ID
 * @param {string} content - Note content
 * @param {string} [author="system"] - Note author
 * @returns {Promise<{task: object}>}
 */
export async function appendWorkNote(id, content, author = "system") {
  return apiRequest("/api/tasks", {
    method: "PUT",
    body: JSON.stringify({
      id,
      append_work_note: true,
      work_notes: { content, author },
    }),
  });
}

/**
 * Update task status.
 * @param {number} id - Task ID
 * @param {string} status - New status
 * @returns {Promise<{task: object}>}
 */
export async function updateTaskStatus(id, status) {
  return updateTask(id, { status });
}

/**
 * Mark a task as completed with a summary note.
 * @param {number} id - Task ID
 * @param {string} summary - Completion summary
 * @returns {Promise<{task: object}>}
 */
export async function completeTask(id, summary) {
  // First append the summary note
  await appendWorkNote(id, summary, "agent");
  // Then mark as completed
  return updateTaskStatus(id, "completed");
}

/**
 * Mark a task as blocked with a reason.
 * @param {number} id - Task ID
 * @param {string} reason - Block reason
 * @returns {Promise<{task: object}>}
 */
export async function blockTask(id, reason) {
  // First append the block reason
  await appendWorkNote(id, `blocked: ${reason}`, "agent");
  // Then mark as blocked
  return updateTaskStatus(id, "blocked");
}

/**
 * Delete a task.
 * @param {number} id - Task ID
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteTask(id) {
  return apiRequest(`/api/tasks?id=${id}`, {
    method: "DELETE",
  });
}

/**
 * Get all projects.
 * @returns {Promise<{projects: object[]}>}
 */
export async function getProjects() {
  return apiRequest("/api/projects");
}

/**
 * Get a single project.
 * @param {number} id - Project ID
 * @returns {Promise<{project: object}>}
 */
export async function getProject(id) {
  return apiRequest(`/api/projects/${id}`);
}

/**
 * Sync a project with GitHub.
 * @param {number} id - Project ID
 * @returns {Promise<object>}
 */
export async function syncProject(id) {
  return apiRequest(`/api/projects/${id}/sync`, {
    method: "POST",
  });
}

const apiClientExports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  appendWorkNote,
  updateTaskStatus,
  completeTask,
  blockTask,
  deleteTask,
  getProjects,
  getProject,
  syncProject,
  BASE_URL,
  IS_DOCKER,
};

export default apiClientExports;
