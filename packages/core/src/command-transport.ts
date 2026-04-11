export type GovernanceCommandTransportMode =
  | "supabase"
  | "local-fallback"
  | "not-ready";

export interface GovernanceCommandTransportResolution {
  mode: GovernanceCommandTransportMode;
  summary: string;
  supabaseUrl: string;
  supabaseUrlValid: boolean;
  serviceRoleKeyPresent: boolean;
  localQueueRelativePath: string;
  reason?: string;
}

function isLikelyValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function evaluateGovernanceCommandTransport(
  options: {
    env?: NodeJS.ProcessEnv;
    runtimeReady?: boolean;
    localQueueRelativePath?: string;
  } = {},
): GovernanceCommandTransportResolution {
  const env = options.env ?? process.env;
  const runtimeReady = options.runtimeReady ?? true;
  const localQueueRelativePath = options.localQueueRelativePath ?? ".devory/commands";
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const supabaseUrlValid = isLikelyValidHttpUrl(supabaseUrl);
  const serviceRoleKeyPresent = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() !== "";

  if (!runtimeReady) {
    return {
      mode: "not-ready",
      summary: "Cloud commands: NOT READY",
      supabaseUrl,
      supabaseUrlValid,
      serviceRoleKeyPresent,
      localQueueRelativePath,
      reason: "governance mode is not active",
    };
  }

  if (supabaseUrlValid && serviceRoleKeyPresent) {
    return {
      mode: "supabase",
      summary: "Cloud commands: READY (managed cloud backend)",
      supabaseUrl,
      supabaseUrlValid,
      serviceRoleKeyPresent,
      localQueueRelativePath,
    };
  }

  return {
    mode: "local-fallback",
    summary: `Cloud commands: LOCAL FALLBACK (${localQueueRelativePath})`,
    supabaseUrl,
    supabaseUrlValid,
    serviceRoleKeyPresent,
    localQueueRelativePath,
  };
}
