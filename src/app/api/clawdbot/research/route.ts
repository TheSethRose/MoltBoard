/**
 * Moltbot Assist API
 *
 * Provides read-only research assistance using pi-ai package:
 * 1. Task form auto-fill: Generates structured task fields from a natural language prompt
 * 2. Closure summary: Generates a summary suitable for GitHub issue closure
 *
 * All responses are structured (JSON) for automatic field mapping.
 *
 * Integration: Reads model/API key from environment variables, then uses pi-ai directly.
 * Configure CLAWDBOT_MODEL_ID, CLAWDBOT_BASE_URL, CLAWDBOT_API, and provider API key.
 */

import { NextRequest, NextResponse } from "next/server";
import { complete, type Model, type Context } from "@mariozechner/pi-ai";
import {
  withErrorHandling,
  badRequest,
  internalError,
} from "@/lib/api-error-handler";

/**
 * Extract model config and API key from environment variables.
 * Returns a pi-ai Model object and the API key.
 */
async function getModelConfig(): Promise<{
  model: Model<"anthropic-messages">;
  apiKey: string;
} | null> {
  try {
    const modelId =
      process.env.CLAWDBOT_MODEL_ID ||
      process.env.CLAWDBOT_MODEL ||
      "minimax/MiniMax-M2.1";

    const [provider, modelName] = modelId.split("/");
    const apiKey =
      process.env.CLAWDBOT_API_KEY ||
      process.env[`${provider.toUpperCase()}_API_KEY`] ||
      process.env.MINIMAX_API_KEY ||
      "";

    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    const baseUrl =
      process.env.CLAWDBOT_BASE_URL ||
      process.env[`${provider.toUpperCase()}_BASE_URL`] ||
      process.env.MINIMAX_BASE_URL ||
      "";

    if (!baseUrl) {
      throw new Error(`Missing base URL for provider: ${provider}`);
    }

    const api =
      (process.env.CLAWDBOT_API as "anthropic-messages") ||
      "anthropic-messages";

    // Build a custom Model object for pi-ai
    const model = {
      id: modelName,
      name: modelName,
      api: api,
      provider: provider,
      baseUrl: baseUrl,
      reasoning: false,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8192,
    } satisfies Model<"anthropic-messages">;

    return { model, apiKey };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ModelConfig] Failed to read environment config: ${msg}`);
    return null;
  }
}

export interface ResearchRequest {
  /** Type of research assistance */
  type: "task-form" | "closure-summary" | "note-review";
  /** The input text to analyze */
  input: string;
  /** Optional task notes/history/context */
  notes?: string;
}

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

export interface NoteReviewResponse {
  reply: string;
}

export type ResearchResponse =
  | TaskFormResponse
  | ClosureSummaryResponse
  | NoteReviewResponse;

/**
 * Safe prompt templates - explicitly constrained to prevent side effects
 */
const PROMPT_TEMPLATES = {
  "task-form": `You are Moltbot Assist. Rewrite the task using the full context below and output a MoltBoard-aligned task.

INPUT (task snapshot; may be partial):
{{INPUT}}

PROCESS:
1) Identify task type (Bug, Feature, Task, Chore, Research, Spike, Maintenance, Safety, Audit) and priority (Urgent, High, Medium, Low).
2) Evaluate against quality criteria for that type and identify missing details.
3) Refine into a single, autonomous execution sequence.
4) Produce a ready-to-implement story with a quality review.

OUTPUT (JSON format):
{
  "title": "Brief, actionable title (5-7 words)",
  "goal": "1-2 sentence description using the required format",
  "scope": ["Step 1 (Foundation)", "Step 2 (Core Logic)", "Step 3 (Integration)", "Step 4 (Validation)"] ,
  "outOfScope": ["Item 1", "Item 2"],
  "dependencies": ["Missing detail or prerequisite", "Assumption"],
  "acceptanceCriteria": ["Verifiable criterion", "Final output matches the defined format"],
  "tags": ["typeTag", "optionalSecondTag"],
  "priority": "medium"
}

RULES:
- Output ONLY valid JSON (no markdown, no commentary)
- Use the input fields (Title, Description, Status, Project, Priority, Tags, Blocked By, Activity Log) to rewrite the task.
- Do NOT include the activity log in the output; it is context only.
- Description format:
  - Bug/Feature: "As a [persona] I want [action] so that [benefit]."
  - Chore/Maintenance/Safety/Audit: "In order to [technical necessity/compliance], we need to [action]."
- Keep description 1-2 sentences.
- Scope must fit a single autonomous execution window; if too large, add a dependency that flags human review.
- Include 3-6 acceptance criteria, always include: "Final output matches the defined format".
- Default priority to "medium" unless urgency is clear.
- Valid tags: bug, feature, task, chore, research, spike, maintenance, safety, audit
- Do NOT write code, touch files, or make git changes.
- Do NOT access URLs or make network requests.`,

  "closure-summary": `You are a helpful project assistant. Generate a closure summary for a completed task.

TASK TITLE:
{{INPUT}}

TASK NOTES/HISTORY:
{{NOTES}}

OUTPUT (JSON format):
{
  "summary": "Brief summary of what was accomplished (2-3 sentences)",
  "keyChanges": ["Change 1", "Change 2"],
  "notesForRecord": "Any additional context for the record (optional)"
}

RULES:
- Output ONLY valid JSON (no markdown, no commentary)
- Focus on outcomes and results
- Be professional but concise
- Do NOT write code, touch files, or make git changes
- Do NOT access URLs or make network requests`,

  "note-review": `You are Moltbot Assist. Review the new note and respond with a helpful, concise reply for the activity log.

NEW NOTE (user message):
{{INPUT}}

TASK CONTEXT & ACTIVITY LOG (read-only context):
{{NOTES}}

OUTPUT (JSON format):
{
  "reply": "Short response that references relevant context, asks clarifying questions if needed, and notes any risks or blockers."
}

RULES:
- Output ONLY valid JSON (no markdown, no commentary)
- Keep reply to 2-5 sentences
- If no context is relevant, say what you can and ask 1 clarifying question
- Do NOT write code, touch files, or make git changes
- Do NOT access URLs or make network requests`,
};

/**
 * Call pi-ai complete() with Clawdbot identity (model + API key from config).
 */
async function callPiAI(
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const modelConfig = await getModelConfig();

  if (!modelConfig) {
    return {
      success: false,
      error: "Failed to load Clawdbot model configuration",
    };
  }

  const { model, apiKey } = modelConfig;
  const wrappedPrompt = `${prompt}\n\nIMPORTANT: Output ONLY valid JSON. No markdown fences, no explanations, no text before or after the JSON.`;

  try {
    console.log(`[PiAI] Calling model ${model.provider}/${model.id}...`);

    const now = Date.now();
    const context: Context = {
      systemPrompt: "You are a helpful assistant that outputs only valid JSON.",
      messages: [
        {
          role: "user",
          content: wrappedPrompt,
          timestamp: now,
        },
      ],
    };

    const result = await complete(model, context, {
      apiKey,
      maxTokens: 4096,
    });

    if (!result.content || result.content.length === 0) {
      return {
        success: false,
        error: "No content in response from pi-ai",
      };
    }

    // Extract text content from the response
    const textContent = result.content
      .filter(
        (c): c is { type: "text"; text: string } =>
          c.type === "text" && "text" in c,
      )
      .map((c) => c.text)
      .join("");

    if (!textContent) {
      return {
        success: false,
        error: "No text content in response from pi-ai",
      };
    }

    console.log(`[PiAI] Response length: ${textContent.length} chars`);

    // Extract JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { success: true, response: jsonMatch[0] };
    }

    return {
      success: false,
      error: `No JSON found in response: ${textContent.substring(0, 300)}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[PiAI] Error: ${msg}`);
    return { success: false, error: msg || "Failed to call pi-ai" };
  }
}

/**
 * Parse and validate JSON response from Clawdbot
 */
function parseResearchResponse(
  response: string,
  type: ResearchRequest["type"],
): ResearchResponse {
  try {
    const parsed = JSON.parse(response);

    if (type === "task-form") {
      return {
        title: parsed.title || "",
        goal: parsed.goal || "",
        scope: parsed.scope || "",
        outOfScope: Array.isArray(parsed.outOfScope) ? parsed.outOfScope : [],
        dependencies: Array.isArray(parsed.dependencies)
          ? parsed.dependencies
          : [],
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria
          : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        priority: ["urgent", "high", "medium", "low"].includes(parsed.priority)
          ? parsed.priority
          : "medium",
      };
    } else if (type === "closure-summary") {
      return {
        summary: parsed.summary || "",
        keyChanges: Array.isArray(parsed.keyChanges) ? parsed.keyChanges : [],
        notesForRecord: parsed.notesForRecord || "",
      };
    } else {
      return {
        reply: parsed.reply || "",
      };
    }
  } catch (error) {
    throw new Error(
      `Failed to parse Clawdbot response: ${error instanceof Error ? error.message : "Invalid JSON"}`,
    );
  }
}

// POST - Handle research requests
export const POST = withErrorHandling(
  async (req: NextRequest): Promise<NextResponse> => {
    const body: ResearchRequest = await req.json();

    // Validate request
    if (
      !body.type ||
      !["task-form", "closure-summary", "note-review"].includes(body.type)
    ) {
      throw badRequest(
        "Invalid research type. Must be 'task-form', 'closure-summary', or 'note-review'.",
        "INVALID_RESEARCH_TYPE",
      );
    }

    if (!body.input || typeof body.input !== "string") {
      throw badRequest(
        "Input is required and must be a string.",
        "INVALID_INPUT",
      );
    }

    // Build prompt from template
    const template = PROMPT_TEMPLATES[body.type];
    let prompt = template.replace("{{INPUT}}", body.input);

    if (body.type === "closure-summary" && body.notes) {
      prompt = prompt.replace("{{NOTES}}", body.notes);
    } else if (body.type === "closure-summary") {
      prompt = prompt.replace("{{NOTES}}", "(No additional notes provided)");
    }

    if (body.type === "note-review" && body.notes) {
      prompt = prompt.replace("{{NOTES}}", body.notes);
    } else if (body.type === "note-review") {
      prompt = prompt.replace("{{NOTES}}", "(No additional context provided)");
    }

    // Call pi-ai
    const piResult = await callPiAI(prompt);

    if (!piResult.success) {
      throw internalError(
        piResult.error || "Failed to get response from pi-ai",
        "PI_ERROR",
      );
    }

    // Parse and validate response
    const response = parseResearchResponse(piResult.response!, body.type);

    return NextResponse.json({
      type: body.type,
      response,
    });
  },
  { context: { route: "/api/clawdbot/research", method: "POST" } },
);
