/**
 * @devory/core — shared frontmatter parsing utilities.
 *
 * Pure functions with no external dependencies.
 * Used by workers/lib, scripts, and apps/devory.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskMeta {
  id: string;
  title: string;
  project: string;
  repo: string;
  branch: string;
  type: string;
  priority: string;
  status: string;
  agent: string;
  /** Simulated execution outcome written by an agent after doing work. */
  execution_result?: string;
  depends_on: string[];
  files_likely_affected: string[];
  verification: string[];

  // Planner / parent-task fields (all optional)
  planner?: boolean;
  parent_task?: string;
  lane?: string;
  repo_area?: string;
  decomposition_hint?: string;
  required_capabilities?: string[];
  preferred_capabilities?: string[];
  disallowed_models?: string[];
  preferred_models?: string[];
  execution_profile?: string;
  pipeline?: string;
  context_intensity?: string;
  quality_priority?: string;
  speed_priority?: string;
  max_cost_tier?: string;
  skills?: string[];

  // Bundle / epic fields (all optional)
  bundle_id?: string;
  bundle_title?: string;
  bundle_phase?: string;

  [key: string]: unknown;
}

export interface ParseResult {
  meta: Partial<TaskMeta>;
  body: string;
}

function parseInlineArray(value: string): string[] | null {
  const inlineArrayMatch = value.match(/^\[(.*)\]$/);
  if (!inlineArrayMatch) {
    return null;
  }

  const rawItems = inlineArrayMatch[1].trim();
  if (rawItems === "") {
    return [];
  }

  return rawItems
    .split(",")
    .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter((item) => item.length > 0);
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// Handles simple YAML: scalar strings and flat string arrays ("- item").
// Does not depend on any external package.
// ---------------------------------------------------------------------------

export function parseFrontmatter(content: string): ParseResult {
  const lines = content.split("\n");

  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: content };
  }

  const closeIdx = lines.indexOf("---", 1);
  if (closeIdx === -1) {
    return { meta: {}, body: content };
  }

  const yamlLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join("\n");
  const meta: Partial<TaskMeta> = {};
  let currentKey = "";

  for (const line of yamlLines) {
    const listMatch = line.match(/^\s+-\s+(.*)/);
    const kvMatch = line.match(/^([\w_][\w_-]*):\s*(.*)/);

    if (listMatch && currentKey) {
      const arr = meta[currentKey];
      if (Array.isArray(arr)) {
        arr.push(listMatch[1].trim());
      }
    } else if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === "" || val === "[]") {
        (meta as Record<string, unknown>)[currentKey] = [];
      } else {
        const inlineArray = parseInlineArray(val);
        (meta as Record<string, unknown>)[currentKey] = inlineArray ?? val;
      }
    }
  }

  return { meta, body };
}
