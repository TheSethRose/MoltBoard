/**
 * Moltbot Assist API
 *
 * Provides read-only research assistance using pi-ai package:
 * 1. Task form auto-fill: Generates structured task fields from a natural language prompt
 * 2. Closure summary: Generates a summary suitable for GitHub issue closure
 *
 * All responses are structured (JSON) for automatic field mapping.
 *
 * Integration: Reads Clawdbot config files for model/API key, then uses pi-ai directly.
 * The user running this process must have read access to /Users/clawdbot/.clawdbot/ paths.
 */

import { NextRequest, NextResponse } from "next/server";
import { complete, type Model, type Context } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import {
  withErrorHandling,
  badRequest,
  internalError,
} from "@/lib/api-error-handler";

// --- Clawdbot config paths ---
const CONFIG_PATH = "/Users/clawdbot/.clawdbot/clawdbot.json";
const AUTH_PATH =
  "/Users/clawdbot/.clawdbot/agents/main/agent/auth-profiles.json";

interface ClawdbotConfig {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
  models?: {
    providers?: Record<
      string,
      {
        baseUrl?: string;
        api?: string;
        models?: Array<{
          id: string;
          name?: string;
          contextWindow?: number;
          maxTokens?: number;
        }>;
      }
    >;
  };
}

interface AuthProfiles {
  profiles: Record<
    string,
    {
      provider: string;
      apiKey?: string;
      token?: string;
      mode?: string;
    }
  >;
}

/**
 * Extract model config and API key from Clawdbot config files.
 * Returns a pi-ai Model object and the API key.
 */
async function getModelConfig(): Promise<{
  model: Model<"anthropic-messages">;
  apiKey: string;
} | null> {
  try {
    const configRaw = await fs.readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(configRaw) as ClawdbotConfig;
    const modelId =
      config.agents?.defaults?.model?.primary || "anthropic/claude-sonnet-4-20250514";

    const [provider, modelName] = modelId.split("/");
    const providerConfig = config.models?.providers?.[provider];

    // Read auth profiles for API key
    const authRaw = await fs.readFile(AUTH_PATH, "utf-8");
    const auth = JSON.parse(authRaw) as AuthProfiles;

    const profileKey = Object.keys(auth.profiles).find(
      (key) =>
        auth.profiles[key].provider === provider ||
        key.startsWith(`${provider}:`),
    );

    if (!profileKey) {
      throw new Error(`No auth profile found for provider: ${provider}`);
    }

    const profile = auth.profiles[profileKey];
    const apiKey = profile.apiKey || profile.token;

    if (!apiKey) {
      throw new Error(`Auth profile for ${provider} has no API key/token`);
    }

    // Find model details from config
    const modelDetails = providerConfig?.models?.find((m) => m.id === modelName);

    // Build a custom Model object for pi-ai
    const model: Model<"anthropic-messages"> = {
      id: modelName,
      name: modelDetails?.name || modelName,
      api: "anthropic-messages",
      provider: provider,
      baseUrl: providerConfig?.baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: modelDetails?.contextWindow || 200000,
      maxTokens: modelDetails?.maxTokens || 8192,
    };

    return { model, apiKey };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ModelConfig] Failed to read Clawdbot config: ${msg}`);
    return null;
  }
}

export interface ResearchRequest {
  /** Type of research assistance */
  type: "task-form" | "closure-summary";
  /** The input text to analyze */
  input: string;
  /** For closure summary: optional task notes/history */
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

export type ResearchResponse = TaskFormResponse | ClosureSummaryResponse;

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
};

/**
 * Call Pi CLI with Clawdbot identity (model + API key from config).
 */
async function callPi(
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const timeout = parseInt(process.env.CLAWDBOT_TIMEOUT || "120000", 10);
  const secrets = await getClawdbotSecrets();

  const model = secrets?.model || "anthropic/claude-sonnet-4-20250514";
  const extraEnv = secrets?.env || {};

  const wrappedPrompt = `${prompt}\n\nIMPORTANT: Output ONLY valid JSON. No markdown fences, no explanations, no text before or after the JSON.`;
  const tempFile = path.join("/tmp", `pi-request-${Date.now()}.txt`);

  try {
    await fs.writeFile(tempFile, wrappedPrompt, "utf-8");

    const piPath = process.env.PI_PATH || "/opt/homebrew/bin/pi";
    const cmd = `${piPath} -p "$(cat ${tempFile})" --model ${model} 2>&1`;

    console.log(`[DirectAPI] Running pi as ${model}...`);

    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        ...extraEnv,
        NO_COLOR: "1",
      },
    });

    const output = stdout || stderr || "";
    if (stderr) {
      console.log(`[DirectAPI] stderr=${stderr.substring(0, 500)}`);
    }
    if (stdout) {
      console.log(`[DirectAPI] stdout=${stdout.substring(0, 500)}`);
    }

    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { success: true, response: jsonMatch[0] };
    }

    return {
      success: false,
      error: `No JSON found in response: ${output.substring(0, 300)}`,
    };
  } catch (error) {
    const err = error as {
      message?: string;
      code?: string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };

    if (err.killed) {
      return { success: false, error: `Pi timed out after ${timeout}ms` };
    }

    const details = [err.message, err.stdout, err.stderr]
      .filter(Boolean)
      .join(" | ");
    return { success: false, error: details || "Failed to call Pi CLI" };
  } finally {
    await fs.unlink(tempFile).catch(() => {});
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
    } else {
      return {
        summary: parsed.summary || "",
        keyChanges: Array.isArray(parsed.keyChanges) ? parsed.keyChanges : [],
        notesForRecord: parsed.notesForRecord || "",
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
    if (!body.type || !["task-form", "closure-summary"].includes(body.type)) {
      throw badRequest(
        "Invalid research type. Must be 'task-form' or 'closure-summary'.",
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

    // Call Pi
    const piResult = await callPi(prompt);

    if (!piResult.success) {
      throw internalError(
        piResult.error || "Failed to get response from Pi",
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
