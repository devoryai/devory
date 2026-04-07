/**
 * packages/vscode/src/lib/agent-context-reader.ts
 *
 * Reads agent-context.json and doctrine-manifest.json from execution artifacts.
 * Pure FS reads — no VS Code API dependency.
 */

import * as fs from "fs";
import * as path from "path";

export interface DoctrineManifest {
  source_context: string;
  always_loaded: string[];
  conditionally_loaded: Array<{
    file: string;
    included: boolean;
    reason: string;
  }>;
  product_doctrine: { file: string | null; product: string | null; reason: string } | null;
  missing_files: string[];
}

export interface AgentContextSummary {
  taskId: string;
  model: string | null;
  engine: string | null;
  doctrineAlwaysLoaded: string[];
  doctrineConditionallyLoaded: Array<{ file: string; included: boolean; reason: string }>;
  doctrineTotalLoaded: number;
  skillsLoaded: string[];
  missingDoctrineFiles: string[];
  productDoctrine: string | null;
}

/** Read and parse the agent context for a given task execution. Returns null if not found. */
export function readAgentContextSummary(
  artifactsDir: string,
  taskId: string
): AgentContextSummary | null {
  const packetDir = path.join(artifactsDir, "execution", taskId, "agent-packet");

  const contextPath = path.join(packetDir, "agent-context.json");
  const doctrinePath = path.join(packetDir, "doctrine-manifest.json");

  let context: Record<string, unknown> | null = null;
  let doctrine: DoctrineManifest | null = null;

  try {
    context = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
  } catch {
    // artifact may not exist for older runs
  }

  try {
    doctrine = JSON.parse(fs.readFileSync(doctrinePath, "utf-8"));
  } catch {
    // try falling back to doctrine block inside agent-context.json
    if (context?.doctrine) {
      doctrine = null; // handled below via context
    }
  }

  if (!context && !doctrine) return null;

  const routing = context?.engine_routing as Record<string, unknown> | undefined;
  const contextDoctrine = context?.doctrine as Record<string, unknown> | undefined;

  return {
    taskId,
    model: (routing?.model_display_name as string) ?? (routing?.model_id as string) ?? null,
    engine: (routing?.engine as string) ?? null,
    doctrineAlwaysLoaded: doctrine?.always_loaded ?? [],
    doctrineConditionallyLoaded: doctrine?.conditionally_loaded ?? [],
    doctrineTotalLoaded:
      doctrine != null
        ? doctrine.always_loaded.length +
          doctrine.conditionally_loaded.filter((c) => c.included).length
        : (contextDoctrine?.total_loaded as number) ?? 0,
    skillsLoaded: [],  // skill-manifest.json is separate; omit for now
    missingDoctrineFiles: doctrine?.missing_files ?? [],
    productDoctrine: doctrine?.product_doctrine?.file ?? null,
  };
}
