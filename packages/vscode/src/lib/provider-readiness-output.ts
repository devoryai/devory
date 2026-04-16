import type { ProviderDoctorSnapshot } from "@devory/core";

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function supportLabel(value: string): string {
  if (value === "first_class") return "first-class";
  if (value === "experimental_adapter") return "experimental";
  return "unsupported";
}

function reachabilityLabel(value: string): string {
  if (value === "reachable") return "yes";
  if (value === "unreachable") return "no";
  if (value === "unverified") return "unverified";
  return "n/a";
}

function boolLabel(value: boolean): string {
  return value ? "yes" : "no";
}

export function renderProviderReadinessLines(
  snapshot: ProviderDoctorSnapshot
): string[] {
  const header = [
    pad("Provider", 13),
    pad("Support", 13),
    pad("Config", 8),
    pad("Reachable", 11),
    pad("Routeable", 10),
    "Details",
  ].join("  ");

  const divider = [
    "-".repeat(13),
    "-".repeat(13),
    "-".repeat(8),
    "-".repeat(11),
    "-".repeat(10),
    "-".repeat(32),
  ].join("  ");

  const lines = [
    "Provider Readiness",
    header,
    divider,
  ];

  for (const row of snapshot.providers) {
    lines.push(
      [
        pad(row.label, 13),
        pad(supportLabel(row.support_level), 13),
        pad(boolLabel(row.configured), 8),
        pad(reachabilityLabel(row.reachable), 11),
        pad(boolLabel(row.routeable), 10),
        row.routeable ? row.target_models_detail : row.summary,
      ].join("  ")
    );
  }

  return lines;
}
