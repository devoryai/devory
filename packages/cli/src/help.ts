/**
 * packages/cli/src/help.ts
 *
 * Pure help-text generation — no I/O, no side effects.
 * Callers print the returned string.
 */

import { COMMANDS, type CommandSpec } from "./registry.ts";

/** Top-level help shown when no command is given or --help is passed. */
export function buildRootHelp(): string {
  const maxLen = Math.max(...COMMANDS.map((c) => c.name.length));
  const rows = COMMANDS.map(
    (c) => `  ${c.name.padEnd(maxLen + 2)}${c.description}`
  ).join("\n");

  return [
    "Usage: devory <command> [options]",
    "",
    "Commands:",
    rows,
    "",
    "Run `devory <command> --help` for command-specific help.",
  ].join("\n");
}

/** Per-command help shown when `devory <command> --help` is used. */
export function buildCommandHelp(spec: CommandSpec): string {
  return [
    `Usage: ${spec.usage}`,
    "",
    spec.description,
  ].join("\n");
}

/**
 * Look up a command spec by full name (e.g. "task new") and return its help
 * string, or the root help if not found.
 */
export function helpFor(commandName: string): string {
  const spec = COMMANDS.find((c) => c.name === commandName);
  return spec ? buildCommandHelp(spec) : buildRootHelp();
}
