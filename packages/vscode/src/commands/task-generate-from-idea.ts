/**
 * packages/vscode/src/commands/task-generate-from-idea.ts
 *
 * devory.generateTasksFromIdea — convert a short idea description into
 * structured draft tasks, preview them, and commit to backlog on confirmation.
 *
 * Uses deterministic generation (no AI required). Pure generation functions
 * come from workers/lib/task-generator.ts; commit goes through
 * workers/lib/task-draft-commit.ts with an explicit factoryRoot.
 */

import * as vscode from "vscode";
import { buildRichTaskDraftFixture, applyTaskDraftValidation } from "@devory/core";
import type { TaskPlanningDraft } from "@devory/core";
import {
  normalizeIntent,
  buildGeneratedTaskSpec,
  deriveTaskId,
} from "../../../../workers/lib/task-generator.js";
import {
  deriveSmartFallback,
  inferChildType,
  buildChildAcceptanceCriteria,
  inheritVerification,
} from "../../../../workers/lib/planner-utils.js";
import { commitTaskDrafts } from "../../../../workers/lib/task-draft-commit.js";
import { suggestTaskCreateDefaults } from "../lib/task-create.js";
import { tryRefineTaskDrafts } from "../lib/ollama-refine.js";

export interface GenerateTasksFromIdeaCommitEntry {
  draft_id: string;
  task_id: string;
  target_path: string;
  target_stage: string;
}

// ---------------------------------------------------------------------------
// Tier detection (mirrors logic in task-draft-generator.ts)
// ---------------------------------------------------------------------------

function tierOf(name: string): 0 | 1 | 2 {
  if (/\b(setup|init|scaffold|configure|prepare|provision|bootstrap)\b/i.test(name)) return 0;
  if (/\b(verify|test|check|validate|qa|audit|assert|spec|document|docs)\b/i.test(name)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Description concern extraction — context-aware task decomposition
// ---------------------------------------------------------------------------

/** Action verbs that indicate an independent unit of work. */
const ACTION_VERB =
  /\b(add|show|display|handle|implement|create|build|update|fix|remove|improve|fetch|load|render|validate|check|ensure|enable|disable|support|allow|prevent|track|define|expose|wire|scaffold|introduce|style|format|configure|migrate|refactor|extract|write)\b/i;

/** Words too generic to be meaningful task-title tokens. */
const IGNORE_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "in", "on", "at", "to",
  "for", "of", "with", "by", "from", "and", "or", "but", "not", "this",
  "that", "it", "its", "be", "been", "being",
]);

/** Count words in a concern that carry real meaning (not stop-words, length > 2). */
function meaningfulWordCount(concern: string): number {
  return concern
    .split(/\s+/)
    .filter((w) => w.length > 2 && !IGNORE_WORDS.has(w.toLowerCase())).length;
}

/**
 * Opening patterns that mark a comma-clause as a descriptor or relative
 * clause rather than a separate actionable concern.
 * e.g. "Add JWT auth, using the OAuth library" — second clause is context.
 */
const NON_ACTIONABLE_START =
  /^(which\s|that\s+is\s|who\s|where\s|when\s|because\s|since\s|as\s+a\s+result|due\s+to|caused\s+by|based\s+on|using\s|via\s|with\s+the\s|with\s+support|through\s|by\s+using|in\s+order|per\s+the|for\s+the\s+purpose)/i;

/** Leading filler phrases that carry no task value and should be stripped. */
const FILLER_PHRASES: RegExp[] = [
  /^(i\s+want\s+to|i'?d\s+like\s+to|i\s+need\s+to|we\s+need\s+to)\s+/i,
  /^(we\s+should|we\s+want\s+to|we\s+have\s+to|we\s+must)\s+/i,
  /^(it\s+would\s+be\s+(helpful|good|great|nice)\s+to)\s+/i,
  /^(the\s+goal\s+is\s+to|the\s+idea\s+is\s+to|the\s+plan\s+is\s+to)\s+/i,
  /^(please\s+|can\s+you\s+|could\s+you\s+|you\s+should\s+)\s*/i,
  /^(also\s+|additionally\s+|furthermore\s+|finally\s+|lastly\s+)\s*/i,
  /^and\s+/i,
];

/**
 * Normalize a concern phrase into a capitalized, action-oriented title.
 * Strips leading filler phrases (may chain, so iterates until stable).
 */
function toActionableTitle(phrase: string): string {
  let cleaned = phrase.trim().replace(/\s+/g, " ");
  let prev: string;
  do {
    prev = cleaned;
    for (const pat of FILLER_PHRASES) {
      cleaned = cleaned.replace(pat, "");
    }
    cleaned = cleaned.trim();
  } while (cleaned !== prev);
  const titled = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return titled.length > 80 ? titled.slice(0, 77) + "..." : titled;
}

/**
 * When the first item in a comma-split list is the only one carrying an
 * action verb, propagate that verb to bare-noun subsequent items.
 * e.g. ["Add error handling", "loading states", "empty states"]
 *   → ["Add error handling", "Add loading states", "Add empty states"]
 */
function inheritLeadingVerb(parts: string[]): string[] {
  if (parts.length < 2) return parts;
  const verbMatch = parts[0].match(/^(\w+)\s+/);
  if (!verbMatch || !ACTION_VERB.test(verbMatch[1])) return parts;
  const verb = verbMatch[1];
  return parts.map((p, i) => {
    if (i === 0) return p;
    if (ACTION_VERB.test(p.split(/\s+/)[0] ?? "")) return p;
    return `${verb} ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
  });
}

/**
 * Split text at sentence boundaries:
 *   – period/question/exclamation + whitespace + uppercase letter
 *   – semicolons + whitespace
 *   – newlines
 * Avoids splitting on digits before periods (version numbers, decimals).
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/(?<![0-9])([.?!])\s+(?=[A-Z])/g, "$1\x00")
    .replace(/;\s+/g, "\x00")
    .replace(/\n+/g, "\x00")
    .split("\x00")
    .map((s) => s.replace(/[.?!;]+$/, "").trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract actionable concern(s) from a single sentence.
 *
 * Applies comma splitting only when the sentence resembles an action list
 * (has multiple clauses that are not relative or descriptor phrases, and at
 * least one clause contains an action verb).  Returns the sentence unchanged
 * when it describes a single coherent task.
 */
function extractConcernsFromSentence(sentence: string): string[] {
  // Normalise verbose conjunction variants first
  const normalized = sentence
    .replace(/,?\s+and\s+also\s+/gi, ", ")
    .replace(/,?\s+as\s+well\s+as\s+/gi, ", ");

  const rawParts = normalized
    .split(/,\s+(?:and\s+)?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawParts.length < 2) return [sentence];

  let parts = rawParts;

  // "Subject to [concern1], [concern2]" — recover first concern from "to" clause
  const toMatch = parts[0].match(/^(.+?)\s+to\s+(.+)$/i);
  if (toMatch && toMatch[2].split(/\s+/).length >= 2) {
    parts = [toMatch[2], ...parts.slice(1)];
  }

  // Drop relative clauses and prepositional descriptor phrases — they add
  // context to the preceding clause, not a new task.
  parts = parts.filter((p) => !NON_ACTIONABLE_START.test(p));

  // Still need at least 2 surviving parts to constitute a list
  if (parts.length < 2) return [sentence];

  // Require at least one action verb to confirm this is a list of tasks,
  // not a list of noun phrases describing a single concern.
  if (!parts.some((p) => ACTION_VERB.test(p))) return [sentence];

  const processed = inheritLeadingVerb(parts);

  // Fragment-density guard: if more than half the resulting items have fewer
  // than 3 meaningful words, the original sentence is a noun-ellipsis list
  // (e.g. "Add loading, error, and empty states") — treat it as one concern.
  const fragmentCount = processed.filter((p) => meaningfulWordCount(p) < 3).length;
  if (fragmentCount > processed.length / 2) return [sentence];

  return processed;
}

/**
 * Parse a free-form description into 2–4 distinct work concerns.
 * Returns null when fewer than 2 actionable concerns survive extraction and
 * grouping (caller should fall back to single-task generation).
 *
 * Strategy:
 *   1. Split the description into sentences.
 *   2. Within each sentence, apply comma splitting only when the sentence
 *      looks like an action list (fragment-density guard prevents noun-ellipsis
 *      lists like "Add loading, error, and empty states" from over-splitting).
 *   3. Filter candidates to keep only those with a clear action verb and
 *      sufficient meaningful content.
 *   4. Apply layer-based grouping: merge small sibling concerns in the same
 *      implementation layer into a single coherent task.
 *   5. Return 2–4 concerns, or null if fewer than 2 survive grouping.
 */
function parseDescriptionConcerns(description: string): string[] | null {
  const text = description.trim().replace(/\s+/g, " ");

  const raw: string[] = [];
  for (const sentence of splitSentences(text)) {
    raw.push(...extractConcernsFromSentence(sentence));
  }

  const actionable = raw.filter(
    (c) => meaningfulWordCount(c) >= 2 && ACTION_VERB.test(c)
  );

  if (actionable.length < 2) return null;

  // Merge small sibling concerns in the same layer to avoid over-splitting
  const grouped = groupAndMergeConcerns(actionable);

  if (grouped.length < 2) return null;

  // Target 2–4 tasks; only produce more when clearly warranted
  return grouped.slice(0, 4).map(toActionableTitle);
}

/**
 * Returns true when the description contains 2 or more sentences that each
 * include a recognisable action verb — a reliable signal that the input
 * describes multiple distinct tasks and should be split automatically.
 */
function hasClearMultipleSentences(description: string): boolean {
  const sentences = splitSentences(description.trim());
  if (sentences.length < 2) return false;
  return sentences.filter((s) => ACTION_VERB.test(s)).length >= 2;
}

// ---------------------------------------------------------------------------
// Concern grouping — merge small sibling concerns into coherent tasks
// ---------------------------------------------------------------------------

/**
 * Classify a concern by the implementation layer it most likely touches.
 * Used to detect whether two concerns belong together or represent distinct work.
 */
function classifyConcernLayer(concern: string): "data" | "logic" | "wiring" | "ui" {
  if (
    /\b(fetch|retrieve|query|request|load\s+data|transform|parse|normalize|aggregate|compute|calculate|read\s+from)\b/i.test(
      concern
    )
  ) {
    return "data";
  }
  if (
    /\b(wire|connect|integrate|configure|register|bind|hook|subscribe|dispatch|emit|route|middleware)\b/i.test(
      concern
    )
  ) {
    return "wiring";
  }
  if (
    /\b(validate|evaluate|business\s+logic|policy|rule|authorize|permission)\b/i.test(
      concern
    )
  ) {
    return "logic";
  }
  return "ui";
}

/**
 * Merge a group of related sibling concerns into a single coherent title.
 *
 * When all concerns share the same leading verb, compresses to:
 *   "Verb nounA, nounB, and nounC"
 * Otherwise picks the most substantial (highest meaningful-word-count) concern
 * as the representative title.
 */
function mergeConcernGroup(group: string[]): string {
  if (group.length === 1) return group[0];

  const verbs = group.map((c) => c.match(/^(\w+)\s+/)?.[1]?.toLowerCase() ?? "");
  const sharedVerb = verbs[0] && verbs.every((v) => v === verbs[0]) ? verbs[0] : null;

  if (sharedVerb) {
    const nounParts = group.map((c) =>
      c.replace(new RegExp(`^${sharedVerb}\\s+`, "i"), "")
    );
    const Verb = sharedVerb.charAt(0).toUpperCase() + sharedVerb.slice(1);
    if (nounParts.length === 2) {
      return `${Verb} ${nounParts[0]} and ${nounParts[1]}`;
    }
    const last = nounParts[nounParts.length - 1];
    return `${Verb} ${nounParts.slice(0, -1).join(", ")}, and ${last}`;
  }

  // Different verbs — use the most substantial concern as the title
  return group.reduce((best, c) =>
    meaningfulWordCount(c) >= meaningfulWordCount(best) ? c : best
  );
}

/**
 * Group small sibling concerns that share an implementation layer AND the same
 * leading action verb, then merge them into a single coherent task title.
 *
 * Two concerns are candidates for merging when they:
 *   – touch the same layer (ui / data / logic / wiring)
 *   – are both "small" (≤ 3 meaningful words each)
 *   – share the same leading action verb (e.g. both start with "Add")
 *   – appear consecutively in the extracted list
 *
 * The same-verb requirement prevents unrelated same-layer concerns (e.g.
 * "Show user profile" and "Display order history") from being collapsed.
 * Cross-layer concerns and substantial concerns remain separate tasks.
 */
function groupAndMergeConcerns(concerns: string[]): string[] {
  if (concerns.length <= 1) return concerns;

  const classified = concerns.map((c) => ({
    concern: c,
    layer: classifyConcernLayer(c),
    small: meaningfulWordCount(c) <= 3,
    verb: c.match(/^(\w+)\s+/)?.[1]?.toLowerCase() ?? "",
  }));

  // Fast path: all same layer, all small, all same verb — merge into one task
  if (
    classified.every((c) => c.layer === classified[0].layer) &&
    classified.every((c) => c.small) &&
    classified.every((c) => c.verb === classified[0].verb)
  ) {
    return [mergeConcernGroup(concerns)];
  }

  // General path: group consecutive concerns sharing layer, smallness, and verb
  const groups: string[][] = [];
  let currentGroup: string[] = [classified[0].concern];
  let currentLayer = classified[0].layer;
  let currentSmall = classified[0].small;
  let currentVerb = classified[0].verb;

  for (let i = 1; i < classified.length; i++) {
    const { concern, layer, small, verb } = classified[i];
    if (layer === currentLayer && small && currentSmall && verb === currentVerb) {
      currentGroup.push(concern);
    } else {
      groups.push(currentGroup);
      currentGroup = [concern];
      currentLayer = layer;
      currentSmall = small;
      currentVerb = verb;
    }
  }
  groups.push(currentGroup);

  return groups.map((g) => (g.length === 1 ? g[0] : mergeConcernGroup(g)));
}

// ---------------------------------------------------------------------------
// Deduplication — lightweight title-similarity guard
// ---------------------------------------------------------------------------

function titleWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !IGNORE_WORDS.has(w))
  );
}

/** Jaccard similarity over meaningful title words. */
function titleSimilarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Remove near-duplicate drafts.
 * Threshold 0.75: titles must share ≥75 % of their meaningful words to be
 * collapsed — conservative enough to preserve distinct tasks that happen to
 * use some of the same vocabulary.
 */
function deduplicateDrafts(drafts: TaskPlanningDraft[]): TaskPlanningDraft[] {
  const kept: TaskPlanningDraft[] = [];
  for (const draft of drafts) {
    const isDuplicate = kept.some(
      (existing) => titleSimilarity(existing.title, draft.title) > 0.75
    );
    if (!isDuplicate) kept.push(draft);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Draft builders — pure, no filesystem access
// ---------------------------------------------------------------------------

function buildSingleDraft(description: string, project: string, factoryRoot?: string): TaskPlanningDraft {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);
  const spec = buildGeneratedTaskSpec(intentSpec, input);

  // Use the same sequential ID scheme as "Create Task" when factoryRoot is known.
  const id = factoryRoot ? suggestTaskCreateDefaults(factoryRoot).id : spec.id;
  const repo = factoryRoot ? "." : spec.repo;

  return applyTaskDraftValidation(
    buildRichTaskDraftFixture({
      draft_id: id,
      title: spec.title,
      project: spec.project,
      repo,
      branch: `task/${id}`,
      type: spec.type,
      priority: spec.priority,
      status: "backlog",
      agent: spec.agent,
      verification: spec.verification,
      // Use the full description as the goal so it expands on the title
      goal: description,
      context: [description],
      acceptance_criteria: spec.acceptanceCriteria.map((e) =>
        e.replace(/^- \[ \]\s*/, "")
      ),
      expected_artifacts: ["Implementation changes", "Verification evidence"],
      failure_conditions: [
        "Requirements are not met",
        "Verification does not pass",
        "Unintended side effects are introduced",
      ],
      reviewer_checklist: [
        "Scope remains aligned with request",
        "No unrelated files changed",
        "Verification commands pass",
      ],
      depends_on: [],
      commit: {
        state: "draft",
        target_stage: "backlog",
        target_path: null,
        committed_task_id: null,
      },
    })
  );
}

function buildMultipleDrafts(description: string, project: string, factoryRoot?: string): TaskPlanningDraft[] {
  const input = { description, project };
  const intentSpec = normalizeIntent(input);

  // Prefer description-derived concerns; fall back to type-aware template names.
  const parsedConcerns = parseDescriptionConcerns(description);
  const taskNames: string[] = parsedConcerns ?? deriveSmartFallback({ type: intentSpec.type }).names;

  // Resolve the starting ID: sequential from factoryRoot (same scheme as Create Task),
  // or slug-based fallback when factoryRoot is not available.
  let idCounter: { prefix: string; num: number; width: number } | null = null;
  let slugBaseId = deriveTaskId(project, intentSpec.suggestedTitle);
  if (factoryRoot) {
    const firstId = suggestTaskCreateDefaults(factoryRoot).id;
    const match = firstId.match(/^(.+?)-(\d+)$/);
    if (match) {
      idCounter = { prefix: match[1], num: Number.parseInt(match[2], 10), width: match[2].length };
    }
  }

  let previousId: string | null = null;

  return taskNames.map((name, i) => {
    const id = idCounter
      ? `${idCounter.prefix}-${String(idCounter.num + i).padStart(idCounter.width, "0")}`
      : `${slugBaseId}-${String(i + 1).padStart(2, "0")}`;
    const tier = tierOf(name);

    // For parsed concerns: use the concern directly as an action-oriented title.
    // For fallback names: prefix with the parent title for context.
    const title = parsedConcerns
      ? name
      : `${intentSpec.suggestedTitle}: ${name}`;

    // Goal expands on the title by anchoring it to the broader request.
    const goal = parsedConcerns
      ? `${name} — part of: ${intentSpec.suggestedTitle}`
      : `${name.charAt(0).toUpperCase() + name.slice(1)} for "${intentSpec.suggestedTitle}"`;

    const type = inferChildType(name, tier);
    const verification = inheritVerification(["npm run test", "npm run build"], tier);
    const criteria = buildChildAcceptanceCriteria(name, tier);

    const draft = applyTaskDraftValidation(
      buildRichTaskDraftFixture({
        draft_id: id,
        title,
        project,
        repo: ".",
        branch: `task/${id}`,
        type,
        priority: intentSpec.suggestedPriority,
        status: "backlog",
        agent: intentSpec.suggestedAgent,
        verification,
        goal,
        context: [description],
        acceptance_criteria: criteria.map((e) => e.replace(/^- \[ \]\s*/, "")),
        expected_artifacts: ["Implementation changes aligned to this step"],
        failure_conditions: [
          "Task drifts outside its scoped concern",
          "Required verification cannot be completed",
        ],
        reviewer_checklist: [
          "Scope is contained and vertically useful",
          "Dependencies are satisfied before this task runs",
        ],
        depends_on: previousId ? [previousId] : [],
        commit: {
          state: "draft",
          target_stage: "backlog",
          target_path: null,
          committed_task_id: null,
        },
      })
    );

    previousId = draft.draft_id;
    return draft;
  });
}

export async function buildDrafts(
  description: string,
  project: string,
  forceSplit?: boolean,
  factoryRoot?: string
): Promise<TaskPlanningDraft[]> {
  const intentSpec = normalizeIntent({ description, project });

  // Auto-split when the description has 2+ sentences that each contain a
  // clear action verb, even without an explicit forceSplit flag.
  const autoSplit = hasClearMultipleSentences(description);
  const shouldSplit = forceSplit || intentSpec.scope === "broad" || autoSplit;

  // Concerns are extracted once and reused for both splitting and refinement.
  const parsedConcerns = shouldSplit ? parseDescriptionConcerns(description) : null;

  let drafts: TaskPlanningDraft[];
  if (!shouldSplit) {
    drafts = [buildSingleDraft(description, project, factoryRoot)];
  } else {
    if (!parsedConcerns && autoSplit && !forceSplit && intentSpec.scope !== "broad") {
      // autoSplit fired on multi-sentence input, but grouping reduced the
      // concerns to a single coherent task — stay in single-task mode.
      drafts = [buildSingleDraft(description, project, factoryRoot)];
    } else {
      drafts = buildMultipleDrafts(description, project, factoryRoot);
    }
  }

  // Remove near-duplicate tasks and cap at 5
  drafts = deduplicateDrafts(drafts).slice(0, 5);

  // Optional Ollama refinement — silently falls back to baseline drafts if
  // Ollama is unavailable, times out, or returns invalid output.
  if (shouldSplit || intentSpec.scope === "broad") {
    drafts = await tryRefineTaskDrafts(description, parsedConcerns, drafts);
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// QuickPick items type
// ---------------------------------------------------------------------------

interface PreviewItem extends vscode.QuickPickItem {
  isAccept: boolean;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function generateTasksFromIdeaCommand(
  factoryRoot: string,
  onSuccess: () => void,
  onCommitted?: (committed: GenerateTasksFromIdeaCommitEntry[]) => Promise<void> | void
): Promise<void> {
  if (!factoryRoot) {
    vscode.window.showErrorMessage(
      "Devory: factory root not found. Set devory.factoryRoot in settings."
    );
    return;
  }

  // Step 1: Get description
  const description = await vscode.window.showInputBox({
    title: "Devory: Generate Tasks from Idea",
    prompt: "Describe the work to be done in 1–3 sentences",
    placeHolder: "Add JWT authentication to the API endpoints",
    validateInput: (v) =>
      v.trim().length < 5
        ? "Please describe the work in more detail"
        : null,
  });
  if (!description) return;

  // Step 2: Detect project name — use last segment of factoryRoot as default
  const { default: nodePath } = await import("node:path");
  const projectDefault = nodePath.basename(factoryRoot.trim()) || "project";

  const project = await vscode.window.showInputBox({
    title: "Devory: Generate Tasks from Idea — Project",
    prompt: "Project name (used in task IDs and metadata)",
    value: projectDefault,
    placeHolder: projectDefault,
    validateInput: (v) => (v.trim() ? null : "Project name is required"),
  });
  if (!project) return;

  // Step 3: Generate drafts (deterministic + optional Ollama refinement)
  let drafts: TaskPlanningDraft[];
  try {
    drafts = await buildDrafts(description.trim(), project.trim(), undefined, factoryRoot);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Devory: task generation failed — ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (drafts.length === 0) {
    vscode.window.showInformationMessage(
      "Devory: no tasks could be generated from that description. Try rephrasing."
    );
    return;
  }

  // Step 4: Show preview QuickPick
  const acceptLabel = `$(check) Accept all — save ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog`;
  const previewItems: PreviewItem[] = [
    {
      label: acceptLabel,
      description: "Writes task files to tasks/backlog/",
      isAccept: true,
    },
    {
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
      isAccept: false,
    },
    ...drafts.map((d, i): PreviewItem => ({
      label: `${i + 1}. ${d.title}`,
      description: `${d.type} · ${d.priority}`,
      detail: d.depends_on && d.depends_on.length > 0
        ? `depends on: ${d.depends_on.join(", ")}`
        : undefined,
      isAccept: false,
    })),
  ];

  const picked = await vscode.window.showQuickPick(previewItems, {
    title: "Devory: Generate Tasks from Idea — Preview",
    placeHolder: "Select 'Accept all' to save tasks, or press Escape to cancel.",
    ignoreFocusOut: true,
  });

  if (!picked || !picked.isAccept) return;

  // Step 5: Commit to backlog
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Saving ${drafts.length} task${drafts.length > 1 ? "s" : ""} to backlog…`,
    },
    async () => {
      const result = commitTaskDrafts(drafts, { factoryRoot });

      if (!result.ok) {
        const detail = result.issues.length > 0
          ? ` (${result.issues.map((i) => i.errors[0]).join("; ")})`
          : "";
        vscode.window.showErrorMessage(`Devory: failed to save tasks — ${result.error}${detail}`);
        return;
      }

      onSuccess();

      const ids = result.committed.map((c) => c.task_id);
      if (onCommitted) {
        await onCommitted(result.committed);
      } else {
        vscode.window.showInformationMessage(
          `Devory: ${result.committed.length} task${result.committed.length > 1 ? "s" : ""} added to backlog: ${ids.join(", ")}`
        );
      }
    }
  );
}
