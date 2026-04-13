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
    name: "setup",
    description: "Guided one-command onboarding: configure governance mode end-to-end",
    usage: "devory setup [--governance-repo <path>] [--workspace-id <id>] [--enable-governance] [--migrate-tasks]",
  },
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
    name: "skill new",
    description: "Scaffold a new skill from templates/skill-template.md",
    usage: "devory skill new <name> [--root <dir>]",
  },
  {
    name: "skill list",
    description: "List available skills (one per line)",
    usage: "devory skill list [--root <dir>]",
  },
  {
    name: "skill validate",
    description: "Validate SKILL.md structure for one skill or all skills",
    usage: "devory skill validate <name> [--root <dir>] | devory skill validate --all [--root <dir>]",
  },
  {
    name: "run",
    description: "Run one orchestrator pass (does not poll governance commands)",
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
    description: "Start the factory worker loop (polls governance commands)",
    usage: "devory worker",
  },
  {
    name: "config",
    description: "Show factory configuration and health status",
    usage: "devory config",
  },
  {
    name: "license activate",
    description: "Write a Devory license key to .devory/license for this workspace",
    usage: "devory license activate --key <token> [--root <dir>]",
  },
  {
    name: "license clear",
    description: "Remove the workspace .devory/license file and local verification cache",
    usage: "devory license clear [--root <dir>]",
  },
  {
    name: "license status",
    description: "Show current tier, key source, cache usage, and Core fallback reason",
    usage: "devory license status [--root <dir>]",
  },
  {
    name: "cloud status",
    description: "Show local cloud account/session status and workspace linkage",
    usage: "devory cloud status [--root <dir>]",
  },
  {
    name: "cloud login",
    description: "Import a Devory cloud session for this local workspace",
    usage: "devory cloud login [--root <dir>] [--session-file <file> | --session-json <json> | --access-token <token> --refresh-token <token>] [--workspace-id <id>]",
  },
  {
    name: "cloud link",
    description: "Link the current local workspace to a cloud workspace ID",
    usage: "devory cloud link --workspace-id <id> [--root <dir>]",
  },
  {
    name: "cloud logout",
    description: "Remove the local cloud session without affecting offline license activation",
    usage: "devory cloud logout [--root <dir>]",
  },
  {
    name: "sync status",
    description: "Show sync status between local filesystem and cloud workspace",
    usage: "devory sync status",
  },
  {
    name: "sync push",
    description: "Push local artifacts and tasks to cloud workspace",
    usage: "devory sync push [--dry-run] [--force]",
  },
  {
    name: "sync pull",
    description: "Pull cloud artifacts to local filesystem",
    usage: "devory sync pull [--dry-run]",
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
  {
    name: "diagnostics",
    description: "Check self-hosted prerequisites (workspace, license, engine, Ollama)",
    usage: "devory diagnostics [--root <dir>]",
  },
  {
    name: "doctor",
    description: "Check local factory health (workspace, tasks, standards, license, config)",
    usage: "devory doctor [--root <dir>]",
  },
  {
    name: "governance init",
    description: "Initialize a new Devory governance repo with Git and directory structure",
    usage: "devory governance init [--dir <path>] [--workspace-id <id>] [--force] [--dry-run]",
  },
  {
    name: "governance bind",
    description: "Bind a working repo to an existing governance repo",
    usage: "devory governance bind --governance-repo <path> [--workspace-id <id>]",
  },
  {
    name: "governance status",
    description: "Show governance repo binding status for the current working repo",
    usage: "devory governance status",
  },
  {
    name: "governance doctor",
    description: "Diagnose governance mode configuration: flag, binding, repo health, and runtime mode",
    usage: "devory governance doctor [--working-repo <path>]",
  },
  {
    name: "governance enqueue-local",
    description: "Write a governance command into the local file queue fallback for runtime testing",
    usage: "devory governance enqueue-local --type <command-type> [--payload <json> | --payload-file <path>] [--target-task-id <id>] [--target-run-id <id>] [--issued-by <user>] [--expires-in-minutes <n>] [--working-repo <path>]",
  },
  {
    name: "migrate",
    description: "Copy existing local artifacts into the bound governance repo",
    usage: "devory migrate --to-governance-repo [--dry-run] [--confirm]",
  },
];
