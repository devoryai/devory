/**
 * packages/vscode/src/lib/ollama-refine.ts
 *
 * Optional Ollama-based refinement for Task Builder output.
 *
 * When a local Ollama instance is reachable and has at least one model,
 * sends the task description and extracted concerns to Ollama and requests
 * a refined task breakdown in strict JSON format.
 *
 * Falls back silently to existing drafts if Ollama is unavailable, times out,
 * or returns an invalid response. Existing drafts are never modified on failure.
 *
 * Integration point: called from buildDrafts() after initial parsing.
 */

import type { TaskPlanningDraft } from "@devory/core";
import { probeOllamaReadiness } from "@devory/core";

/** Timeout for the Ollama /api/generate call (ms). Keeps UX fast. */
const GENERATE_TIMEOUT_MS = 8000;

/** Maximum tasks Ollama may return (mirrors spec). */
const MAX_TASKS = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OllamaRefinedTask {
  title: string;
  goal: string;
}

interface OllamaRefinedPayload {
  mode: "single" | "split";
  tasks: OllamaRefinedTask[];
}

export interface OllamaRefinementOptions {
  /** Override the generate call timeout. Default: 8000ms. */
  timeoutMs?: number;
  /** Inject a fetch implementation (useful in tests). Default: globalThis.fetch. */
  fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildRefinementPrompt(description: string, concerns: string[] | null): string {
  const concernsBlock =
    concerns && concerns.length > 0
      ? `\nExtracted concerns:\n${concerns.map((c) => `- ${c}`).join("\n")}`
      : "";

  return `You are a technical task planner. Given a software task description, return a refined task breakdown as strict JSON.

Description: ${description}${concernsBlock}

Return ONLY valid JSON with this exact structure:
{
  "mode": "single" or "split",
  "tasks": [
    { "title": "action-oriented title", "goal": "clear goal statement" }
  ]
}

Rules:
- mode is "single" for one cohesive task, "split" for 2–4 distinct tasks
- Maximum ${MAX_TASKS} tasks total
- Each title must be action-oriented (start with a verb) and under 80 characters
- No duplicate or near-duplicate titles
- goals must be non-empty, concrete, and distinct
- Return ONLY the JSON object — no markdown fences, no commentary`;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/**
 * Validate the raw parsed JSON from Ollama. Returns the typed payload if it
 * satisfies all constraints, otherwise null.
 */
export function validateRefinedPayload(raw: unknown): OllamaRefinedPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;

  if (obj.mode !== "single" && obj.mode !== "split") return null;

  if (!Array.isArray(obj.tasks)) return null;
  if (obj.tasks.length < 1 || obj.tasks.length > MAX_TASKS) return null;

  const tasks = obj.tasks as Array<unknown>;
  const validated: OllamaRefinedTask[] = [];

  for (const item of tasks) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const t = item as Record<string, unknown>;

    if (typeof t.title !== "string" || t.title.trim().length === 0) return null;
    if (typeof t.goal !== "string" || t.goal.trim().length === 0) return null;

    validated.push({ title: t.title.trim(), goal: t.goal.trim() });
  }

  // Reject duplicate titles (case-insensitive)
  const lower = validated.map((t) => t.title.toLowerCase());
  if (new Set(lower).size !== lower.length) return null;

  return { mode: obj.mode, tasks: validated };
}

// ---------------------------------------------------------------------------
// Ollama generate call
// ---------------------------------------------------------------------------

/**
 * POST to Ollama's /api/generate endpoint. Returns the validated payload or
 * null on any failure (network error, timeout, bad response, invalid JSON).
 */
async function callOllamaGenerate(
  baseUrl: string,
  model: string,
  description: string,
  concerns: string[] | null,
  timeoutMs: number,
  fetchFn: typeof fetch
): Promise<OllamaRefinedPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildRefinementPrompt(description, concerns),
        format: "json",
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { response?: string };
    if (typeof data.response !== "string" || data.response.trim().length === 0) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.response);
    } catch {
      return null;
    }

    return validateRefinedPayload(parsed);
  } catch {
    // Covers AbortError (timeout), network errors, and JSON parse failures
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to refine task drafts using a local Ollama instance.
 *
 * Behaviour:
 * - Probes Ollama (fast timeout); returns existing drafts immediately if unreachable.
 * - Picks the first available model from the inventory.
 * - Calls /api/generate with a structured JSON prompt.
 * - Validates the response; falls back to existing drafts on any failure.
 * - On success, overlays the refined `title` and `goal` onto the matched baseline
 *   drafts, preserving all other metadata (IDs, type, priority, depends_on, etc.).
 * - Never increases the draft count beyond the baseline or MAX_TASKS.
 *
 * @param description   The original user description passed to the Task Builder.
 * @param concerns      Parsed concerns extracted from the description (may be null).
 * @param existingDrafts Baseline drafts produced by deterministic parsing.
 * @param options       Optional timeout / fetch injection.
 */
export async function tryRefineTaskDrafts(
  description: string,
  concerns: string[] | null,
  existingDrafts: TaskPlanningDraft[],
  options: OllamaRefinementOptions = {}
): Promise<TaskPlanningDraft[]> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? GENERATE_TIMEOUT_MS;

  // Guard: fetch must be available in this environment
  if (typeof fetchFn !== "function") return existingDrafts;

  // Probe for Ollama availability (short timeout to avoid blocking UX)
  let probe;
  try {
    probe = await probeOllamaReadiness({ timeout_ms: 2000, fetch_fn: fetchFn });
  } catch {
    return existingDrafts;
  }

  if (!probe.reachable || !probe.models || probe.models.length === 0) {
    return existingDrafts;
  }

  // Use the first available model
  const model = probe.models[0];

  const refined = await callOllamaGenerate(
    probe.base_url,
    model,
    description,
    concerns,
    timeoutMs,
    fetchFn
  );

  if (!refined || refined.tasks.length === 0) return existingDrafts;

  // Overlay title + goal onto baseline drafts.
  // Never produce more drafts than the baseline (conservative safety guarantee).
  const count = Math.min(refined.tasks.length, existingDrafts.length, MAX_TASKS);

  return existingDrafts.slice(0, count).map((draft, i) => ({
    ...draft,
    title: refined.tasks[i].title,
    goal: refined.tasks[i].goal,
  }));
}
