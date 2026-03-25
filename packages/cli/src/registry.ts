/**
 * packages/cli/src/registry.ts
 *
 * Central registry of all CLI commands.
 * Each entry describes a command's name, short description, and usage line.
 */

export interface CommandSpec {
  /** Full command name as typed by the user, e.g. "task new" */
  name: string;
  /** One-line description shown in the help listing */
  description: string;
  /** Usage line shown in per-command help */
  usage: string;
}

export const COMMANDS: CommandSpec[] = [
  {
    name: "init",
    description: "Scaffold a new Devory workspace in the current directory",
    usage: "devory init [--dir <path>] [--force]",
  },
  {
    name: "task new",
    description: "Create a new task skeleton in the backlog",
    usage:
      "devory task new --id <id> --title <title> --project <project> [--dry-run]",
  },
  {
    name: "task move",
    description: "Move a task through the lifecycle (e.g. backlog → ready)",
    usage: "devory task move --task <file> --to <stage>",
  },
  {
    name: "task validate",
    description: "Validate task frontmatter fields and status",
    usage:
      "devory task validate [--file <file>] [--folder <folder>] [--root <dir>] [--status <status>] [--strict]",
  },
  {
    name: "run",
    description: "Run the factory orchestrator",
    usage:
      "devory run [--limit <n>] [--resume] [--dry-run] [--validate]",
  },
  {
    name: "artifacts",
    description: "Build or inspect the run artifact index",
    usage: "devory artifacts",
  },
  {
    name: "worker",
    description: "Start the factory worker loop",
    usage: "devory worker",
  },
  {
    name: "config",
    description: "Show factory configuration and health status",
    usage: "devory config",
  },
  {
    name: "pr-prep",
    description: "Generate branch name, commit message, and PR description from a task",
    usage: "devory pr-prep [<task-file>] [--dry-run]",
  },
  {
    name: "pr-create",
    description: "Create a GitHub PR from a task file (requires --confirm and GITHUB_TOKEN)",
    usage: "devory pr-create --task <file> --branch <name> [--base <branch>] [--confirm]",
  },
  {
    name: "improve",
    description: "Compute one live improvement signal and persist its artifact",
    usage: "devory improve --type <drift|compliance|refactor|doctrine>",
  },
];
