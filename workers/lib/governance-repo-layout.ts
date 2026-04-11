/**
 * workers/lib/governance-repo-layout.ts
 *
 * GovernanceRepoLayout — canonical directory structure for a Devory governance repo.
 *
 * All path-building methods are synchronous and pure. Validation methods are async
 * (they check the filesystem).
 *
 * Layout spec: docs/adr/0010-governance-repo-structure.md
 */

import fs from "fs/promises";
import path from "path";
import type { GovernanceRepoConfig, TaskStage } from "@devory/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOVERNANCE_CONFIG_DIR = ".devory-governance";
const GOVERNANCE_CONFIG_FILE = "config.json";

// ---------------------------------------------------------------------------
// GovernanceRepoLayout
// ---------------------------------------------------------------------------

export class GovernanceRepoLayout {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  get root(): string {
    return this.rootPath;
  }

  // ── Config ──────────────────────────────────────────────────────────────

  configDir(): string {
    return path.join(this.rootPath, GOVERNANCE_CONFIG_DIR);
  }

  configPath(): string {
    return path.join(this.rootPath, GOVERNANCE_CONFIG_DIR, GOVERNANCE_CONFIG_FILE);
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  tasksDir(stage: TaskStage): string {
    return path.join(this.rootPath, "tasks", stage);
  }

  taskFilePath(stage: TaskStage, taskId: string): string {
    return path.join(this.rootPath, "tasks", stage, `${taskId}.md`);
  }

  // ── Doctrine ─────────────────────────────────────────────────────────────

  doctrineDir(): string {
    return path.join(this.rootPath, "doctrine");
  }

  doctrineFilePath(filename: string): string {
    return path.join(this.rootPath, "doctrine", filename);
  }

  // ── Standards ────────────────────────────────────────────────────────────

  standardsDir(): string {
    return path.join(this.rootPath, "standards");
  }

  standardsFilePath(filename: string): string {
    return path.join(this.rootPath, "standards", filename);
  }

  // ── Profiles ─────────────────────────────────────────────────────────────

  profilesDir(): string {
    return path.join(this.rootPath, "profiles");
  }

  profileFilePath(profileId: string): string {
    return path.join(this.rootPath, "profiles", `${profileId}.json`);
  }

  // ── Runs ─────────────────────────────────────────────────────────────────

  runsDir(): string {
    return path.join(this.rootPath, "runs");
  }

  runDir(runId: string): string {
    return path.join(this.rootPath, "runs", runId);
  }

  runManifestPath(runId: string): string {
    return path.join(this.rootPath, "runs", runId, "manifest.json");
  }

  runLineagePath(runId: string): string {
    return path.join(this.rootPath, "runs", runId, "lineage.json");
  }

  runArtifactIndexPath(runId: string): string {
    return path.join(this.rootPath, "runs", runId, "artifact-index.json");
  }

  // ── Reviews ──────────────────────────────────────────────────────────────

  reviewsDir(): string {
    return path.join(this.rootPath, "reviews");
  }

  reviewFilePath(taskId: string, timestamp: string): string {
    return path.join(this.rootPath, "reviews", `${taskId}-review-${timestamp}.json`);
  }

  // ── Questions ─────────────────────────────────────────────────────────────

  questionsDir(): string {
    return path.join(this.rootPath, "questions");
  }

  questionFilePath(questionId: string): string {
    return path.join(this.rootPath, "questions", `${questionId}.json`);
  }

  // ── Audit events ─────────────────────────────────────────────────────────

  /**
   * @param yearMonth - "YYYY-MM" e.g. "2026-04"
   */
  auditDir(yearMonth: string): string {
    return path.join(this.rootPath, "audit", yearMonth);
  }

  /**
   * @param yearMonth - "YYYY-MM" e.g. "2026-04"
   * @param eventId - UUID
   */
  auditEventPath(yearMonth: string, eventId: string): string {
    return path.join(this.rootPath, "audit", yearMonth, `${eventId}.json`);
  }

  /** Derive yearMonth from an ISO 8601 timestamp. */
  static yearMonthFromTimestamp(isoTimestamp: string): string {
    return isoTimestamp.slice(0, 7); // "YYYY-MM"
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  commandsDir(): string {
    return path.join(this.rootPath, "commands");
  }

  commandFilePath(commandId: string): string {
    return path.join(this.rootPath, "commands", `${commandId}.json`);
  }

  // ── Validation ───────────────────────────────────────────────────────────

  /**
   * Returns true if the directory at rootPath is a valid initialized governance repo.
   * Checks: config file exists and parses as a valid GovernanceRepoConfig.
   */
  async isValidGovernanceRepo(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.configPath(), "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return false;
      }
      const obj = parsed as Record<string, unknown>;
      return (
        obj.schema_version === "1" &&
        typeof obj.workspace_id === "string" &&
        obj.workspace_id !== "" &&
        typeof obj.created_at === "string" &&
        obj.created_at !== ""
      );
    } catch {
      return false;
    }
  }

  /**
   * Throws a descriptive error if the governance repo is not valid.
   */
  async assertValidGovernanceRepo(): Promise<void> {
    const valid = await this.isValidGovernanceRepo();
    if (!valid) {
      throw new GovernanceRepoInvalidError(
        `Not a valid Devory governance repo at: ${this.rootPath}\n` +
          `Expected config file at: ${this.configPath()}\n` +
          `Run \`devory governance init --dir ${this.rootPath}\` to initialize.`,
      );
    }
  }

  /**
   * Read and return the governance repo config.
   * Throws if the repo is not valid.
   */
  async readConfig(): Promise<GovernanceRepoConfig> {
    await this.assertValidGovernanceRepo();
    const raw = await fs.readFile(this.configPath(), "utf-8");
    return JSON.parse(raw) as GovernanceRepoConfig;
  }

  /**
   * List all directories that should exist in an initialized governance repo.
   * Used by `governance init` and validation tools.
   */
  requiredDirectories(): string[] {
    return [
      this.configDir(),
      ...["backlog", "ready", "doing", "review", "blocked", "archived", "done"].map((s) =>
        this.tasksDir(s as TaskStage),
      ),
      this.doctrineDir(),
      this.standardsDir(),
      this.profilesDir(),
      this.runsDir(),
      this.reviewsDir(),
      this.questionsDir(),
      this.commandsDir(),
    ];
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GovernanceRepoInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernanceRepoInvalidError";
    Object.setPrototypeOf(this, GovernanceRepoInvalidError.prototype);
  }
}
