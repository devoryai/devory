/**
 * workers/lib/git-governance-service.ts
 *
 * GitGovernanceService — Git operations for the governance repo.
 *
 * Centralizes all Git reads and writes for the governance repo:
 * commit attribution, message formatting, change detection, push/pull.
 * Uses child_process.execFile — no external Git library dependency.
 *
 * Attribution spec: docs/adr/0011-cloud-commit-on-behalf.md
 */

import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { CommitAttribution } from "@devory/core";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommitSummary {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  committer_email: string;
  committed_at: string; // ISO 8601
}

export interface PullResult {
  updated: boolean;
  new_commits: CommitSummary[];
}

export class GitGovernanceError extends Error {
  readonly command: string;
  readonly stderr: string;

  constructor(command: string, stderr: string, message: string) {
    super(message);
    this.name = "GitGovernanceError";
    this.command = command;
    this.stderr = stderr;
    Object.setPrototypeOf(this, GitGovernanceError.prototype);
  }
}

// ---------------------------------------------------------------------------
// GitGovernanceService
// ---------------------------------------------------------------------------

export class GitGovernanceService {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  get rootPath(): string {
    return this.repoPath;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async git(args: string[], env?: Record<string, string>): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.repoPath,
        env: { ...process.env, ...env },
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      return stdout.trimEnd();
    } catch (err: unknown) {
      const error = err as { stderr?: string; message?: string };
      throw new GitGovernanceError(
        `git ${args[0]}`,
        error.stderr ?? "",
        `git ${args.join(" ")} failed in ${this.repoPath}: ${error.message ?? String(err)}`,
      );
    }
  }

  // ── Read operations ──────────────────────────────────────────────────────

  async currentHeadSha(): Promise<string> {
    return this.git(["rev-parse", "HEAD"]);
  }

  async resolveRef(ref: string): Promise<string> {
    return this.git(["rev-parse", ref]);
  }

  async mergeBase(leftRef: string, rightRef: string): Promise<string> {
    return this.git(["merge-base", leftRef, rightRef]);
  }

  async getFileContent(filePath: string): Promise<string | null> {
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.repoPath, filePath);
      return await fs.readFile(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const output = await this.git(["status", "--porcelain"]);
    return output.length > 0;
  }

  /**
   * Returns commits that happened after baseSha (exclusive), in chronological order.
   * If baseSha is not in history (shallow clone, force-push), returns empty array.
   */
  async getCommitsSince(baseSha: string): Promise<CommitSummary[]> {
    // Check that baseSha is reachable before trying to log from it
    try {
      await this.git(["cat-file", "-e", `${baseSha}^{commit}`]);
    } catch {
      // SHA not in history — return empty rather than throwing
      return [];
    }

    const SEP = "|||DEVORY|||";
    const FORMAT = `%H${SEP}%s${SEP}%an${SEP}%ae${SEP}%ce${SEP}%aI`;
    const output = await this.git([
      "log",
      `${baseSha}..HEAD`,
      `--format=${FORMAT}`,
      "--reverse",
    ]);

    if (output === "") return [];

    return output.split("\n").map((line) => {
      const [sha, message, author_name, author_email, committer_email, committed_at] = line.split(SEP);
      return { sha, message, author_name, author_email, committer_email, committed_at };
    });
  }

  async getLastCommitForFile(filePath: string): Promise<CommitSummary | null> {
    const SEP = "|||DEVORY|||";
    const FORMAT = `%H${SEP}%s${SEP}%an${SEP}%ae${SEP}%ce${SEP}%aI`;
    try {
      const output = await this.git([
        "log",
        "-1",
        `--format=${FORMAT}`,
        "--",
        filePath,
      ]);
      if (output === "") return null;
      const [sha, message, author_name, author_email, committer_email, committed_at] = output.split(SEP);
      return { sha, message, author_name, author_email, committer_email, committed_at };
    } catch {
      return null;
    }
  }

  async getLastCommitForFileAtRef(filePath: string, ref: string): Promise<CommitSummary | null> {
    const SEP = "|||DEVORY|||";
    const FORMAT = `%H${SEP}%s${SEP}%an${SEP}%ae${SEP}%ce${SEP}%aI`;
    try {
      const output = await this.git([
        "log",
        "-1",
        ref,
        `--format=${FORMAT}`,
        "--",
        filePath,
      ]);
      if (output === "") return null;
      const [sha, message, author_name, author_email, committer_email, committed_at] = output.split(SEP);
      return { sha, message, author_name, author_email, committer_email, committed_at };
    } catch {
      return null;
    }
  }

  async listChangedFilesBetween(baseRef: string, headRef: string): Promise<string[]> {
    const output = await this.git([
      "diff",
      "--name-only",
      `${baseRef}..${headRef}`,
    ]);
    if (output === "") return [];
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  async listChangedFilesForCommit(commitSha: string): Promise<string[]> {
    const output = await this.git([
      "show",
      "--pretty=format:",
      "--name-only",
      commitSha,
    ]);

    if (output === "") return [];
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  async checkoutFileFromRef(ref: string, filePath: string): Promise<void> {
    await this.git(["checkout", ref, "--", filePath]);
  }

  async isValidGitRepo(): Promise<boolean> {
    try {
      await this.git(["rev-parse", "--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  // ── Write operations ─────────────────────────────────────────────────────

  async stageFile(filePath: string): Promise<void> {
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(this.repoPath, filePath)
      : filePath;
    await this.git(["add", "--", relativePath]);
  }

  async stageAll(): Promise<void> {
    await this.git(["add", "--all"]);
  }

  /**
   * Commit staged changes using the repo's current Git identity.
   * Useful for local CLI flows where the operator's Git config should apply.
   */
  async commitWithCurrentIdentity(message: string): Promise<string> {
    await this.git(["commit", "--message", message]);
    return this.currentHeadSha();
  }

  /**
   * Commit staged changes with full attribution per ADR-0011.
   * Returns the new commit SHA.
   */
  async commit(message: string, attribution: CommitAttribution): Promise<string> {
    const env: Record<string, string> = {
      GIT_AUTHOR_NAME: attribution.author_name,
      GIT_AUTHOR_EMAIL: attribution.author_email,
      GIT_COMMITTER_NAME: attribution.committer_name,
      GIT_COMMITTER_EMAIL: attribution.committer_email,
    };
    await this.git(["commit", "--message", message], env);
    return this.currentHeadSha();
  }

  async pull(remote = "origin", branch = "main"): Promise<PullResult> {
    const beforeSha = await this.currentHeadSha().catch(() => null);
    await this.git(["pull", "--ff-only", remote, branch]);
    const afterSha = await this.currentHeadSha();

    if (beforeSha === null || beforeSha === afterSha) {
      return { updated: false, new_commits: [] };
    }

    const newCommits = await this.getCommitsSince(beforeSha);
    return { updated: true, new_commits: newCommits };
  }

  async push(remote = "origin", branch = "main"): Promise<void> {
    await this.git(["push", remote, branch]);
  }

  async init(): Promise<void> {
    await this.git(["init"]);
  }

  // ── Guard helpers ────────────────────────────────────────────────────────

  /**
   * Throws if the working tree has uncommitted changes.
   */
  async ensureClean(): Promise<void> {
    if (await this.hasUncommittedChanges()) {
      throw new GitGovernanceError(
        "git status",
        "",
        `Governance repo at ${this.repoPath} has uncommitted changes. Commit or stash before proceeding.`,
      );
    }
  }
}
