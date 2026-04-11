/**
 * packages/core/src/standards.ts
 *
 * Loads and types the devory.standards.yml configuration file.
 *
 * devory.standards.yml is the user-facing doctrine source — the structured
 * definition of what "good" means for a given codebase. When present it takes
 * precedence over the freeform doctrine/ markdown files.
 *
 * Entry points:
 *   loadStandards(factoryRoot)          — load and parse the YAML file
 *   serializeStandardsAsDoctrine(s)     — render as a string for AI context injection
 */

import * as fs from "fs";
import * as path from "path";
import { load as parseYaml } from "js-yaml";
import { resolveCoreDefaultsDir } from "./defaults-path.ts";

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface StandardsStack {
  language?: string;
  framework?: string;
  database?: string;
}

export interface StandardsTesting {
  require_unit?: boolean;
  require_integration?: boolean;
  coverage_threshold?: number;
  avoid_mocking?: string[];
}

export interface StandardsArchitecture {
  pattern?: string;
  max_file_lines?: number;
  no_circular_deps?: boolean;
}

export interface StandardsCodeStyle {
  no_any?: boolean;
  prefer_explicit_over_clever?: boolean;
}

export interface StandardsDoctrine {
  extends?: string;
  testing?: StandardsTesting;
  architecture?: StandardsArchitecture;
  code_style?: StandardsCodeStyle;
  /** Pro/Teams tier only — ignored on Core */
  custom_rules?: string[];
}

export interface Standards {
  version?: string;
  stack?: StandardsStack;
  doctrine?: StandardsDoctrine;
}

// ---------------------------------------------------------------------------
// Source descriptor
// ---------------------------------------------------------------------------

export type StandardsSourceType = "yaml" | "doctrine" | "none";

export interface StandardsSource {
  type: StandardsSourceType;
  /** Absolute path to devory.standards.yml, if found */
  path?: string;
}

export interface LoadedStandards {
  standards: Standards;
  source: StandardsSource;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const STANDARDS_FILENAME = "devory.standards.yml";

/**
 * Load devory.standards.yml from the factory root.
 * Returns null standards and source type "none" when the file does not exist.
 * Throws a descriptive error if the file exists but cannot be parsed.
 */
export function loadStandards(factoryRoot: string): LoadedStandards {
  const filePath = path.join(factoryRoot, STANDARDS_FILENAME);

  if (!fs.existsSync(filePath)) {
    return { standards: {}, source: { type: "none" } };
  }

  const raw = fs.readFileSync(filePath, "utf-8");

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      `devory: failed to parse ${STANDARDS_FILENAME}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`devory: ${STANDARDS_FILENAME} must be a YAML object, got: ${typeof parsed}`);
  }

  const user = parsed as unknown as Standards;
  const extendsValue = (user as unknown as Standards & { extends?: string }).extends
    ?? user.doctrine?.extends;

  // Resolve extends chain if a bundled baseline is referenced
  const standards = extendsValue
    ? mergeStandards(loadBaseline(extendsValue), user)
    : user;

  return {
    standards,
    source: { type: "yaml", path: filePath },
  };
}

// ---------------------------------------------------------------------------
// Baseline resolver
//
// Maps "@devory/defaults/<name>" to the bundled YAML file shipped with
// @devory/core. Users reference baselines via the `extends` field in
// devory.standards.yml or within baseline files themselves.
// ---------------------------------------------------------------------------

const DEVORY_DEFAULTS_PREFIX = "@devory/defaults/";
const DEFAULTS_DIR = resolveCoreDefaultsDir(__dirname);

const KNOWN_BASELINES: Record<string, string> = {
  generic: "generic.yml",
  "typescript-nextjs": "typescript-nextjs.yml",
  "typescript-node": "typescript-node.yml",
};

/**
 * Resolve an extends string to an absolute path.
 * Returns null if the baseline is not a bundled Devory baseline or does not exist.
 */
export function resolveBaselinePath(extendsValue: string): string | null {
  if (!extendsValue.startsWith(DEVORY_DEFAULTS_PREFIX)) return null;
  const key = extendsValue.slice(DEVORY_DEFAULTS_PREFIX.length);
  const filename = KNOWN_BASELINES[key];
  if (!filename) return null;
  return path.join(DEFAULTS_DIR, filename);
}

/**
 * Load a bundled Devory baseline by its extends identifier.
 * Recursively resolves the baseline's own extends chain (e.g. typescript-nextjs → generic).
 * Returns an empty Standards object if the baseline cannot be found.
 */
export function loadBaseline(extendsValue: string): Standards {
  const filePath = resolveBaselinePath(extendsValue);
  if (!filePath || !fs.existsSync(filePath)) return {};

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object") return {};

  const baseline = parsed as unknown as Standards & { extends?: string };
  const parentExtends = baseline.extends;

  if (parentExtends) {
    const parent = loadBaseline(parentExtends);
    return mergeStandards(parent, baseline);
  }

  return baseline as unknown as Standards;
}

/**
 * Merge two Standards objects — base values are overridden by overrides.
 * Only one level of nesting is merged (stack, doctrine sub-objects).
 */
export function mergeStandards(base: Standards, overrides: Standards): Standards {
  return {
    version: overrides.version ?? base.version,
    stack: overrides.stack || base.stack
      ? { ...base.stack, ...overrides.stack }
      : undefined,
    doctrine: overrides.doctrine || base.doctrine
      ? {
          ...base.doctrine,
          ...overrides.doctrine,
          testing: overrides.doctrine?.testing || base.doctrine?.testing
            ? { ...base.doctrine?.testing, ...overrides.doctrine?.testing }
            : undefined,
          architecture: overrides.doctrine?.architecture || base.doctrine?.architecture
            ? { ...base.doctrine?.architecture, ...overrides.doctrine?.architecture }
            : undefined,
          code_style: overrides.doctrine?.code_style || base.doctrine?.code_style
            ? { ...base.doctrine?.code_style, ...overrides.doctrine?.code_style }
            : undefined,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Doctrine serializer
//
// Renders a Standards object as a human-readable markdown-ish string
// suitable for injection into an AI worker's context alongside other doctrine.
// ---------------------------------------------------------------------------

export function serializeStandardsAsDoctrine(standards: Standards): string {
  const lines: string[] = ["# Engineering Standards (devory.standards.yml)", ""];

  const { stack, doctrine } = standards;

  if (stack) {
    lines.push("## Stack");
    if (stack.language) lines.push(`- Language: ${stack.language}`);
    if (stack.framework) lines.push(`- Framework: ${stack.framework}`);
    if (stack.database) lines.push(`- Database: ${stack.database}`);
    lines.push("");
  }

  if (doctrine) {
    if (doctrine.extends) {
      lines.push(`## Baseline`);
      lines.push(`Extends: ${doctrine.extends}`);
      lines.push("");
    }

    if (doctrine.testing) {
      lines.push("## Testing Standards");
      const t = doctrine.testing;
      if (t.require_unit !== undefined)
        lines.push(`- Unit tests required: ${t.require_unit}`);
      if (t.require_integration !== undefined)
        lines.push(`- Integration tests required: ${t.require_integration}`);
      if (t.coverage_threshold !== undefined)
        lines.push(`- Coverage threshold: ${t.coverage_threshold}%`);
      if (t.avoid_mocking?.length)
        lines.push(`- Avoid mocking: ${t.avoid_mocking.join(", ")}`);
      lines.push("");
    }

    if (doctrine.architecture) {
      lines.push("## Architecture Standards");
      const a = doctrine.architecture;
      if (a.pattern) lines.push(`- Pattern: ${a.pattern}`);
      if (a.max_file_lines !== undefined)
        lines.push(`- Max file lines: ${a.max_file_lines}`);
      if (a.no_circular_deps !== undefined)
        lines.push(`- No circular dependencies: ${a.no_circular_deps}`);
      lines.push("");
    }

    if (doctrine.code_style) {
      lines.push("## Code Style Standards");
      const cs = doctrine.code_style;
      if (cs.no_any !== undefined) lines.push(`- No \`any\` type: ${cs.no_any}`);
      if (cs.prefer_explicit_over_clever !== undefined)
        lines.push(`- Prefer explicit over clever: ${cs.prefer_explicit_over_clever}`);
      lines.push("");
    }

    if (doctrine.custom_rules?.length) {
      lines.push("## Custom Rules");
      for (const rule of doctrine.custom_rules) {
        lines.push(`- ${rule}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}
