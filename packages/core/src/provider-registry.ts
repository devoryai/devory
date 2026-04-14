import {
  isReadinessSelectable,
  type TargetReadinessSnapshot,
} from "./target-readiness.ts";
/**
 * packages/core/src/provider-registry.ts
 *
 * Static provider class registry for execution routing.
 *
 * Models execution provider classes (not specific model IDs) and their
 * characteristics: locality, cost, capability, and availability state.
 *
 * Designed to be inspectable, extendable, and honest about availability.
 * Provider availability is deliberately conservative by default — local
 * providers require explicit configuration to be considered available.
 *
 * Pure — no I/O. Availability state can be overridden at call sites.
 *
 * Entry points: PROVIDER_REGISTRY, getProviderById(), getAvailableProviders()
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identifier for a provider class. */
export type ProviderClassId = "deterministic" | "local_ollama" | "cloud_premium";

/** Where this provider's compute runs. */
export type ProviderLocality = "local" | "cloud";

/**
 * Relative cost bucket for this provider.
 * "free" = no API billing. "high" = premium API pricing.
 */
export type ProviderCostProfile = "free" | "low" | "medium" | "high";

/**
 * General capability tier.
 * "basic" = rule/template execution. "premium" = frontier model.
 */
export type ProviderCapabilityTier = "basic" | "standard" | "high" | "premium";

/** A single registered provider class entry. */
export interface ProviderClassEntry {
  /** Stable identifier for this provider class. */
  id: ProviderClassId;
  /** Human-readable label shown in routing explanations and UI. */
  label: string;
  /** Where this provider's compute runs. */
  locality: ProviderLocality;
  /** Relative cost profile. */
  cost_profile: ProviderCostProfile;
  /** General capability tier. */
  capability_tier: ProviderCapabilityTier;
  /** Task type patterns this provider is well-suited for. */
  suitable_task_patterns: string[];
  /**
   * Whether this provider is currently considered available.
   * Local providers default to false until environment is validated.
   * Cloud providers default to true (API key assumed present).
   */
  available: boolean;
  /**
   * A note explaining the availability state, or null if always available.
   * Shown to the user when this provider is unavailable.
   */
  availability_note: string | null;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Static provider class registry.
 *
 * Describes the three provider classes Devory routes between:
 *  - deterministic: no model; structured/scripted execution only
 *  - local_ollama: self-hosted Ollama model; free, privacy-preserving
 *  - cloud_premium: frontier cloud API (Claude/OpenAI); highest capability
 *
 * Ordered from most-local to most-capable. Routing prefers earlier entries
 * when task profile allows it (local-first policy).
 */
export const PROVIDER_REGISTRY: ProviderClassEntry[] = [
  {
    id: "deterministic",
    label: "Deterministic (no model)",
    locality: "local",
    cost_profile: "free",
    capability_tier: "basic",
    suitable_task_patterns: [
      "dry-run",
      "validation",
      "simple-script",
      "lint",
    ],
    available: true,
    availability_note: null,
  },
  {
    id: "local_ollama",
    label: "Local model (Ollama)",
    locality: "local",
    cost_profile: "free",
    capability_tier: "standard",
    suitable_task_patterns: [
      "feature",
      "bugfix",
      "refactor",
      "test",
      "documentation",
      "subtask",
    ],
    available: false,
    availability_note:
      "Requires Ollama running locally with a compatible model. " +
      "Start Ollama and configure OLLAMA_HOST or use the default (localhost:11434).",
  },
  {
    id: "cloud_premium",
    label: "Cloud model (premium API)",
    locality: "cloud",
    cost_profile: "high",
    capability_tier: "premium",
    suitable_task_patterns: [
      "feature",
      "epic",
      "refactor",
      "architecture",
      "review",
      "bugfix",
      "test",
      "documentation",
    ],
    available: true,
    availability_note: null,
  },
];

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Returns the provider entry for the given id, or null if not found.
 */
export function getProviderById(
  id: ProviderClassId
): ProviderClassEntry | null {
  return PROVIDER_REGISTRY.find((p) => p.id === id) ?? null;
}

/**
 * Returns all provider entries currently marked as available.
 * Local providers are only included when their availability has been
 * confirmed (e.g. after an Ollama health check).
 */
export function getAvailableProviders(): ProviderClassEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.available);
}

/**
 * Returns a copy of the registry with local_ollama availability
 * overridden based on the supplied flag.
 *
 * Use this at call sites where an actual Ollama health check has been
 * performed so the routing decision reflects real availability.
 */
export function withOllamaAvailability(
  available: boolean
): ProviderClassEntry[] {
  return PROVIDER_REGISTRY.map((entry) =>
    entry.id === "local_ollama" ? { ...entry, available } : entry
  );
}

/**
 * Returns the next-best available provider after the given one,
 * following local-first ordering (deterministic → local → cloud).
 * Returns null if no fallback exists.
 */
export function getFallbackProvider(
  currentId: ProviderClassId,
  registry: ProviderClassEntry[] = PROVIDER_REGISTRY
): ProviderClassEntry | null {
  const currentIndex = registry.findIndex((p) => p.id === currentId);
  if (currentIndex === -1) return null;

  // Try providers after the current one in the registry order
  for (let i = currentIndex + 1; i < registry.length; i++) {
    if (registry[i].available) return registry[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Environment-based availability detection
// ---------------------------------------------------------------------------

/**
 * Checks whether Ollama is configured in the supplied environment.
 *
 * Returns true when any of the following are present:
 *  - FACTORY_DEFAULT_ENGINE=ollama   (container/self-hosted deployment)
 *  - OLLAMA_BASE_URL                 (explicit endpoint override)
 *  - OLLAMA_HOST                     (legacy hostname override)
 *
 * This is a config-based check only — it does NOT perform a live HTTP probe.
 * An Ollama instance may still be unreachable even when this returns true.
 * Use withOllamaAvailability() with the result of a live probe for routing
 * when real reachability is confirmed.
 */
export function detectOllamaConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): boolean {
  if (env.FACTORY_DEFAULT_ENGINE === "ollama") return true;
  if (env.OLLAMA_BASE_URL) return true;
  if (env.OLLAMA_HOST) return true;
  return false;
}

/**
 * Returns a copy of the registry with availability set based on the current
 * environment configuration and an explicit cloud-allowed flag.
 *
 *  - deterministic: always available (unchanged)
 *  - local_ollama: available when detectOllamaConfigured() returns true
 *  - cloud_premium: available when cloudAllowed=true (default)
 *
 * Use this as the default registry when no explicit availability has been
 * determined by a live health check.
 */
export function buildRegistryFromEnvironment(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  cloudAllowed = true,
  readiness?: TargetReadinessSnapshot
): ProviderClassEntry[] {
  const ollamaConfigured = detectOllamaConfigured(env);
  const ollamaReadiness = readiness?.provider_classes.local_ollama;
  const cloudReadiness = readiness?.provider_classes.cloud_premium;

  return PROVIDER_REGISTRY.map((entry): ProviderClassEntry => {
    if (entry.id === "local_ollama") {
      return {
        ...entry,
        available: ollamaReadiness
          ? isReadinessSelectable(ollamaReadiness.state)
          : ollamaConfigured,
        availability_note: ollamaReadiness?.detail ??
          (ollamaConfigured
            ? null
            : "Ollama is not configured in the current environment. " +
              "Set FACTORY_DEFAULT_ENGINE=ollama, OLLAMA_BASE_URL, or OLLAMA_HOST to enable local model execution."),
      };
    }

    if (entry.id === "cloud_premium") {
      const availableByReadiness = cloudReadiness
        ? isReadinessSelectable(cloudReadiness.state)
        : cloudAllowed;
      return {
        ...entry,
        available: cloudAllowed && availableByReadiness,
        availability_note: cloudReadiness?.detail ??
          (cloudAllowed
            ? null
            : "Cloud execution is disabled by routing policy (cloud_allowed=false)."),
      };
    }

    return entry;
  });
}
