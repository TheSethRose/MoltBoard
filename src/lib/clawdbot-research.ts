/**
 * Clawdbot Research Assistant Client
 * 
 * Provides typed client functions for calling the research assistant API.
 */

// Type definitions (shared with API route)
export type ResearchMode = "task-form" | "closure-summary";

export interface TaskFormResponse {
  title: string;
  goal: string;
  scope: string;
  outOfScope: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  tags: string[];
  priority: "urgent" | "high" | "medium" | "low";
}

export interface ClosureSummaryResponse {
  summary: string;
  keyChanges: string[];
  notesForRecord: string;
}

export type ResearchResponse = TaskFormResponse | ClosureSummaryResponse;

export interface ResearchRequest {
  type: ResearchMode;
  input: string;
  notes?: string;
}

/**
 * Call the research assistant API
 * 
 * @param request - The research request with type and input
 * @returns The structured response from Clawdbot
 */
export async function researchAssistant(
  request: ResearchRequest
): Promise<ResearchResponse> {
  const response = await fetch("/api/clawdbot/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response as ResearchResponse;
}

/**
 * Generate task form fields from a natural language description
 */
export async function generateTaskForm(
  input: string
): Promise<TaskFormResponse> {
  const response = await researchAssistant({
    type: "task-form",
    input,
  });

  if (response && "title" in response) {
    return response as TaskFormResponse;
  }

  throw new Error("Invalid response type from research assistant");
}

/**
 * Generate a closure summary for a completed task
 */
export async function generateClosureSummary(
  title: string,
  notes?: string
): Promise<ClosureSummaryResponse> {
  const response = await researchAssistant({
    type: "closure-summary",
    input: title,
    notes,
  });

  if (response && "summary" in response) {
    return response as ClosureSummaryResponse;
  }

  throw new Error("Invalid response type from research assistant");
}
