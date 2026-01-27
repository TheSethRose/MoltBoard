export const DEFAULT_TASK_STATUSES = [
  "backlog",
  "ready",
  "in-progress",
  "pending",
  "review",
  "completed",
  "blocked",
] as const;

const DEFAULT_TASK_STATUS = "ready";

function parseStatuses(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
}

export function getTaskStatuses(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_TASK_STATUSES || process.env.TASK_STATUSES || "";
  const parsed = parseStatuses(raw);
  if (parsed.length > 0) return parsed;
  return [...DEFAULT_TASK_STATUSES];
}

export function getDefaultTaskStatus(statuses = getTaskStatuses()): string {
  const raw =
    process.env.NEXT_PUBLIC_TASK_STATUS_DEFAULT ||
    process.env.TASK_STATUS_DEFAULT ||
    "";
  if (raw && statuses.includes(raw)) return raw;
  if (statuses.includes(DEFAULT_TASK_STATUS)) return DEFAULT_TASK_STATUS;
  return statuses[0] || DEFAULT_TASK_STATUS;
}

export function formatStatusLabel(status: string): string {
  return status
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isValidTaskStatus(
  status: string | undefined,
  statuses = getTaskStatuses(),
): status is string {
  if (!status) return false;
  return statuses.includes(status);
}
