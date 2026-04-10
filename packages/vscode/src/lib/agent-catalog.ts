/**
 * packages/vscode/src/lib/agent-catalog.ts
 *
 * Loads the Agent Catalog from agents/agents.yaml in the factory root.
 *
 * Provides a typed, parsed view of the catalog with a graceful fallback to a
 * hardcoded list when the catalog file is absent or malformed.
 *
 * The YAML structure is simple enough that a bespoke line-by-line parser
 * handles it correctly without adding a YAML library dependency.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  best_for: string[];
}

export interface AgentCatalog {
  default_agent: string;
  agents: AgentEntry[];
}

// ---------------------------------------------------------------------------
// Fallback (mirrors agents/agents.yaml; used when the file cannot be read)
// ---------------------------------------------------------------------------

const FALLBACK_CATALOG: AgentCatalog = {
  default_agent: "fullstack-builder",
  agents: [
    {
      id: "fullstack-builder",
      name: "Fullstack Builder",
      description: "General-purpose agent for most product and code tasks.",
      best_for: ["bug fixes", "small features", "cross-layer work"],
    },
    {
      id: "backend-specialist",
      name: "Backend Specialist",
      description: "APIs, services, and server-side logic.",
      best_for: ["API development", "business logic", "integrations"],
    },
    {
      id: "frontend-specialist",
      name: "Frontend Specialist",
      description: "UI components, styling, and browser-side behavior.",
      best_for: ["UI work", "React/components", "UX fixes"],
    },
    {
      id: "data-engineer",
      name: "Data Engineer",
      description: "Pipelines, transformations, and analytics systems.",
      best_for: ["SQL/dbt", "BigQuery", "schema design"],
    },
    {
      id: "test-engineer",
      name: "Test Engineer",
      description: "Test coverage, QA automation, and validation logic.",
      best_for: ["unit tests", "integration tests", "validation tooling"],
    },
    {
      id: "infra-engineer",
      name: "Infra Engineer",
      description: "Infrastructure, CI/CD, and deployment systems.",
      best_for: ["CI/CD", "infrastructure config", "deployment pipelines"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Parser
//
// Handles the specific YAML shape used in agents/agents.yaml.
// Not a general-purpose YAML parser — just enough for this file.
// ---------------------------------------------------------------------------

function parseAgentCatalogYaml(raw: string): AgentCatalog | null {
  try {
    const lines = raw.split("\n");
    let defaultAgent = "";
    const agents: AgentEntry[] = [];

    let current: Partial<AgentEntry> | null = null;
    let inBestFor = false;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      // Top-level scalar
      const topScalar = line.match(/^([a-z_]+):\s*(.+)$/);
      if (topScalar && !line.startsWith(" ") && !line.startsWith("-")) {
        if (topScalar[1] === "default_agent") {
          defaultAgent = topScalar[2].trim();
        }
        inBestFor = false;
        continue;
      }

      // New agent entry in the list
      if (line.match(/^  - id:/)) {
        if (current && current.id) agents.push(finishEntry(current));
        current = { id: line.replace(/^  - id:\s*/, "").trim(), best_for: [] };
        inBestFor = false;
        continue;
      }

      if (!current) continue;

      // Scalar fields on an agent entry
      const entryScalar = line.match(/^    ([a-z_]+):\s*(.+)$/);
      if (entryScalar) {
        inBestFor = false;
        const [, key, val] = entryScalar;
        if (key === "name") current.name = val.trim();
        else if (key === "description") current.description = val.trim();
        continue;
      }

      // best_for list header
      if (line.match(/^    best_for:\s*$/)) {
        inBestFor = true;
        if (!current.best_for) current.best_for = [];
        continue;
      }

      // best_for list item
      if (inBestFor) {
        const item = line.match(/^      -\s*(.+)$/);
        if (item) {
          current.best_for = current.best_for ?? [];
          current.best_for.push(item[1].trim());
        }
        continue;
      }
    }

    if (current && current.id) agents.push(finishEntry(current));

    if (agents.length === 0) return null;

    return { default_agent: defaultAgent || agents[0].id, agents };
  } catch {
    return null;
  }
}

function finishEntry(partial: Partial<AgentEntry>): AgentEntry {
  return {
    id: partial.id ?? "",
    name: partial.name ?? partial.id ?? "",
    description: partial.description ?? "",
    best_for: partial.best_for ?? [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the agent catalog from `<factoryRoot>/agents/agents.yaml`.
 *
 * Returns the parsed catalog on success, or the built-in fallback catalog
 * if the file is missing or cannot be parsed.  Never throws.
 */
export function loadAgentCatalog(factoryRoot: string): AgentCatalog {
  const catalogPath = path.join(factoryRoot, "agents", "agents.yaml");
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    const parsed = parseAgentCatalogYaml(raw);
    if (parsed) return parsed;
  } catch {
    // file absent or unreadable — fall through to fallback
  }
  return FALLBACK_CATALOG;
}
