/**
 * Clawdbot Research Assistant API
 * 
 * Provides read-only research assistance by invoking Clawdbot for:
 * 1. Task form auto-fill: Generates structured task fields from a natural language prompt
 * 2. Closure summary: Generates a summary suitable for GitHub issue closure
 * 
 * All responses are structured (JSON) for automatic field mapping.
 * 
 * Integration: Uses Clawdbot CLI (`clawdbot agent --message`) since Clawdbot
 * operates as a local Gateway, not a stateless REST API.
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { withErrorHandling, badRequest, internalError } from "@/lib/api-error-handler";

const execAsync = promisify(exec);

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
  "task-form": `You are a helpful project assistant. Analyze the following task request and return a structured JSON response.

INPUT:
{{INPUT}}

OUTPUT (JSON format):
{
  "title": "Brief, actionable title (5-7 words)",
  "goal": "Primary objective (1-2 sentences)",
  "scope": "What's included (2-4 bullet points)",
  "outOfScope": ["Item 1", "Item 2"],
  "dependencies": ["Item 1", "Item 2"],
  "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
  "tags": ["tag1", "tag2"],
  "priority": "medium"
}

RULES:
- Output ONLY valid JSON (no markdown, no commentary)
- Be concise - use brief sentences
- Include 2-4 acceptance criteria max
- Default priority to "medium" unless urgency is clear
- Valid tags: bug, feature, task, chore, research, spike, maintenance, safety, audit
- Do NOT write code, touch files, or make git changes
- Do NOT access URLs or make network requests`,

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
 * Call Clawdbot with the given prompt via CLI
 * 
 * Clawdbot operates as a local Gateway with WebSocket control plane.
 * For API routes, we use the CLI interface: `clawdbot agent --local --agent main --message "..."`
 * The --local flag runs the embedded agent with model provider API keys from env.
 * The --json flag returns structured output with payloads array.
 */
async function callClawdbot(prompt: string): Promise<{ success: boolean; response?: string; error?: string }> {
  const timeout = parseInt(process.env.CLAWDBOT_TIMEOUT || "120000", 10);
  const thinkingLevel = process.env.CLAWDBOT_THINKING || "low";
  const agentId = process.env.CLAWDBOT_AGENT || "main";
  const sessionId = process.env.CLAWDBOT_SESSION_ID || "research";

  // Write prompt to temp file to avoid shell escaping issues
  const tempFile = `/tmp/clawdbot-prompt-${Date.now()}.txt`;
  const fs = await import("node:fs/promises");
  
  // Wrap prompt with JSON-only instruction
  const wrappedPrompt = `${prompt}\n\nIMPORTANT: Output ONLY the JSON object. No markdown fences, no explanations, no text before or after the JSON.`;
  
  try {
    await fs.writeFile(tempFile, wrappedPrompt, "utf-8");
    
    // Build CLI command - use --local for embedded agent, --json for structured output
    // --agent is required to specify which agent to use
    // --session-id ensures we reuse the same session instead of creating a new one
    // Use full path for reliability when running from server context
    const clawdbotPath = process.env.CLAWDBOT_PATH || "/opt/homebrew/bin/clawdbot";
    const cmd = `${clawdbotPath} agent --local --json --thinking ${thinkingLevel} --agent ${agentId} --session-id ${sessionId} --message "$(cat ${tempFile})" 2>&1`;

    let stdout = "";
    let stderr = "";
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        ({ stdout, stderr } = await execAsync(cmd, {
          timeout,
          maxBuffer: 2 * 1024 * 1024, // 2MB buffer
          env: { ...process.env, NO_COLOR: "1" },
        }));
        break;
      } catch (execError) {
        const execErr = execError as { message?: string; stdout?: string; stderr?: string };
        const details = [execErr.message, execErr.stdout, execErr.stderr].filter(Boolean).join(" | ");
        const isLocked = details.includes("session file locked");
        if (isLocked && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw execError;
      }
    }

    // Clean up temp file
    await fs.unlink(tempFile).catch(() => {});

    const output = stdout || stderr || "";
    
    // With --json flag, clawdbot returns JSON with payloads array
    // Format: { "payloads": [{ "text": "...", "mediaUrl": null }], "meta": {...} }
    try {
      const cliResult = JSON.parse(output);
      
      // Extract text from payloads array
      const agentResponse = cliResult.payloads?.[0]?.text || 
                           cliResult.response || 
                           cliResult.message || 
                           cliResult.content || 
                           "";
      
      // Extract JSON from agent response (may contain markdown or extra text)
      const jsonMatch = String(agentResponse).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          success: true,
          response: jsonMatch[0],
        };
      }
      
      return {
        success: false,
        error: `No JSON found in agent response: ${String(agentResponse).substring(0, 300)}`,
      };
    } catch {
      // If CLI output isn't JSON, try to extract JSON from raw output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          success: true,
          response: jsonMatch[0],
        };
      }
      
      return {
        success: false,
        error: `Failed to parse Clawdbot output: ${output.substring(0, 500)}`,
      };
    }
  } catch (error) {
    // Clean up temp file on error
    const fs = await import("node:fs/promises");
    await fs.unlink(tempFile).catch(() => {});
    
    const err = error as { message?: string; code?: string; killed?: boolean; stdout?: string; stderr?: string };
    if (err.killed) {
      return {
        success: false,
        error: `Clawdbot timed out after ${timeout}ms`,
      };
    }
    
    // Include stdout/stderr in error for debugging
    const details = [err.message, err.stdout, err.stderr].filter(Boolean).join(" | ");
    return {
      success: false,
      error: details || "Failed to call Clawdbot CLI",
    };
  }
}

/**
 * Parse and validate JSON response from Clawdbot
 */
function parseResearchResponse(
  response: string,
  type: ResearchRequest["type"]
): ResearchResponse {
  try {
    const parsed = JSON.parse(response);
    
    if (type === "task-form") {
      return {
        title: parsed.title || "",
        goal: parsed.goal || "",
        scope: parsed.scope || "",
        outOfScope: Array.isArray(parsed.outOfScope) ? parsed.outOfScope : [],
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        priority: ["urgent", "high", "medium", "low"].includes(parsed.priority) 
          ? parsed.priority 
          : "medium"
      };
    } else {
      return {
        summary: parsed.summary || "",
        keyChanges: Array.isArray(parsed.keyChanges) ? parsed.keyChanges : [],
        notesForRecord: parsed.notesForRecord || ""
      };
    }
  } catch (error) {
    throw new Error(`Failed to parse Clawdbot response: ${error instanceof Error ? error.message : "Invalid JSON"}`);
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
        "INVALID_RESEARCH_TYPE"
      );
    }
    
    if (!body.input || typeof body.input !== "string") {
      throw badRequest(
        "Input is required and must be a string.",
        "INVALID_INPUT"
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
    
    // Call Clawdbot
    const clawdbotResult = await callClawdbot(prompt);
    
    if (!clawdbotResult.success) {
      throw internalError(
        clawdbotResult.error || "Failed to get response from Clawdbot",
        "CLAWDBOT_ERROR"
      );
    }
    
    // Parse and validate response
    const response = parseResearchResponse(clawdbotResult.response!, body.type);
    
    return NextResponse.json({
      type: body.type,
      response
    });
  },
  { context: { route: "/api/clawdbot/research", method: "POST" } }
);
