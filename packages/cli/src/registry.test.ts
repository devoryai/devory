/**
 * packages/cli/src/registry.test.ts
 *
 * Tests for registry, help, and command parseArgs / buildInvocation.
 * Run from factory root: tsx --test packages/cli/src/registry.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { COMMANDS } from "./registry.js";
import { buildRootHelp, buildCommandHelp, helpFor } from "./help.js";
import { parseArgs as parseTaskNew, buildInvocation as buildTaskNew } from "./commands/task-new.js";
import { parseArgs as parseTaskMove, buildInvocation as buildTaskMove } from "./commands/task-move.js";
import { parseArgs as parseTaskValidate, buildInvocation as buildTaskValidate } from "./commands/task-validate.js";
import { parseArgs as parseRun, buildInvocation as buildRun } from "./commands/run.js";
import { buildConfigReport, formatConfigReport } from "./commands/config.js";
import { parseArgs as parsePrPrep, buildInvocation as buildPrPrep } from "./commands/pr-prep.js";
import { parseArgs as parseImprove, buildInvocation as buildImprove } from "./commands/improve.js";
import { parseArgs as parsePrCreate } from "./commands/pr-create.js";

function assertTsxInvocation(inv: string[], scriptName: string) {
  assert.equal(inv[0], process.execPath);
  assert.ok(inv[1].includes(`${path.sep}tsx${path.sep}`) || inv[1].includes("/tsx/"));
  assert.equal(path.basename(inv[2]), scriptName);
}

// ── Registry ──────────────────────────────────────────────────────────────────

describe("COMMANDS registry", () => {
  test("contains at least 8 commands", () => {
    assert.ok(COMMANDS.length >= 8);
  });

  test("every command has name, description, and usage", () => {
    for (const cmd of COMMANDS) {
      assert.ok(cmd.name.length > 0, `name missing on ${JSON.stringify(cmd)}`);
      assert.ok(cmd.description.length > 0, `description missing for "${cmd.name}"`);
      assert.ok(cmd.usage.length > 0, `usage missing for "${cmd.name}"`);
    }
  });

  test("command names are unique", () => {
    const names = COMMANDS.map((c) => c.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length);
  });
});

// ── Help ──────────────────────────────────────────────────────────────────────

describe("buildRootHelp", () => {
  test("mentions all command names", () => {
    const help = buildRootHelp();
    for (const cmd of COMMANDS) {
      assert.ok(help.includes(cmd.name), `root help missing "${cmd.name}"`);
    }
  });

  test("includes usage prefix", () => {
    assert.ok(buildRootHelp().startsWith("Usage: devory"));
  });
});

describe("buildCommandHelp", () => {
  test("includes the usage string", () => {
    const spec = COMMANDS[0];
    assert.ok(buildCommandHelp(spec).includes(spec.usage));
  });

  test("includes the description", () => {
    const spec = COMMANDS[0];
    assert.ok(buildCommandHelp(spec).includes(spec.description));
  });
});

describe("helpFor", () => {
  test("returns command help for known command", () => {
    const h = helpFor("task new");
    assert.ok(h.includes("devory task new"));
  });

  test("falls back to root help for unknown command", () => {
    const h = helpFor("nonexistent");
    assert.ok(h.startsWith("Usage: devory"));
  });
});

// ── task new ─────────────────────────────────────────────────────────────────

describe("parseTaskNew", () => {
  test("parses all required flags", () => {
    const result = parseTaskNew(["--id", "factory-099", "--title", "My Task", "--project", "my-project"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.id, "factory-099");
    assert.equal(result.args!.title, "My Task");
    assert.equal(result.args!.project, "my-project");
    assert.equal(result.args!.dryRun, false);
  });

  test("parses --dry-run flag", () => {
    const result = parseTaskNew(["--id", "x", "--title", "t", "--project", "p", "--dry-run"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.dryRun, true);
  });

  test("returns error when --id is missing", () => {
    const result = parseTaskNew(["--title", "t", "--project", "p"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--id"));
  });

  test("returns error when --title is missing", () => {
    const result = parseTaskNew(["--id", "x", "--project", "p"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--title"));
  });

  test("returns error when --project is missing", () => {
    const result = parseTaskNew(["--id", "x", "--title", "t"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--project"));
  });
});

describe("buildTaskNew", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildTaskNew({ id: "factory-001", title: "T", project: "P", dryRun: false });
    assertTsxInvocation(inv, "task-new.ts");
  });

  test("invocation contains --id value", () => {
    const inv = buildTaskNew({ id: "factory-001", title: "T", project: "P", dryRun: false });
    const idx = inv.indexOf("--id");
    assert.ok(idx >= 0);
    assert.equal(inv[idx + 1], "factory-001");
  });

  test("invocation contains --dry-run when set", () => {
    const inv = buildTaskNew({ id: "x", title: "T", project: "P", dryRun: true });
    assert.ok(inv.includes("--dry-run"));
  });

  test("invocation omits --dry-run when false", () => {
    const inv = buildTaskNew({ id: "x", title: "T", project: "P", dryRun: false });
    assert.ok(!inv.includes("--dry-run"));
  });
});

// ── task move ────────────────────────────────────────────────────────────────

describe("parseTaskMove", () => {
  test("parses --task and --to", () => {
    const result = parseTaskMove(["--task", "tasks/backlog/foo.md", "--to", "ready"]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { task: "tasks/backlog/foo.md", to: "ready" });
  });

  test("returns error when --task missing", () => {
    const result = parseTaskMove(["--to", "ready"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--task"));
  });

  test("returns error when --to missing", () => {
    const result = parseTaskMove(["--task", "foo.md"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--to"));
  });
});

describe("buildTaskMove", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildTaskMove({ task: "foo.md", to: "ready" });
    assertTsxInvocation(inv, "task-move.ts");
  });

  test("invocation contains --task and --to values", () => {
    const inv = buildTaskMove({ task: "tasks/backlog/foo.md", to: "ready" });
    const ti = inv.indexOf("--task");
    const toi = inv.indexOf("--to");
    assert.ok(ti >= 0 && inv[ti + 1] === "tasks/backlog/foo.md");
    assert.ok(toi >= 0 && inv[toi + 1] === "ready");
  });
});

// ── task validate ────────────────────────────────────────────────────────────

describe("parseTaskValidate", () => {
  test("parses --file mode", () => {
    const result = parseTaskValidate(["--file", "tasks/backlog/foo.md"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.file, "tasks/backlog/foo.md");
  });

  test("parses --folder mode", () => {
    const result = parseTaskValidate(["--folder", "tasks/backlog"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.folder, "tasks/backlog");
  });

  test("parses --root mode", () => {
    const result = parseTaskValidate(["--root", "tasks"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.root, "tasks");
  });

  test("parses --status override", () => {
    const result = parseTaskValidate(["--file", "foo.md", "--status", "ready"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.status, "ready");
  });

  test("returns error when no mode given", () => {
    const result = parseTaskValidate([]);
    assert.ok(result.error !== null);
  });
});

describe("buildTaskValidate", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildTaskValidate({ file: "foo.md" });
    assertTsxInvocation(inv, "validate-task.ts");
  });

  test("includes --file when provided", () => {
    const inv = buildTaskValidate({ file: "tasks/backlog/foo.md" });
    const i = inv.indexOf("--file");
    assert.ok(i >= 0 && inv[i + 1] === "tasks/backlog/foo.md");
  });

  test("includes --status when provided", () => {
    const inv = buildTaskValidate({ file: "foo.md", status: "ready" });
    const i = inv.indexOf("--status");
    assert.ok(i >= 0 && inv[i + 1] === "ready");
  });

  test("omits --status when not provided", () => {
    const inv = buildTaskValidate({ file: "foo.md" });
    assert.ok(!inv.includes("--status"));
  });
});

// ── run ───────────────────────────────────────────────────────────────────────

describe("parseRun", () => {
  test("parses no flags to defaults", () => {
    const result = parseRun([]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { limit: undefined, resumeId: undefined, dryRun: false, validate: false });
  });

  test("parses --limit", () => {
    const result = parseRun(["--limit", "5"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.limit, 5);
  });

  test("parses --resume <run-id>", () => {
    const result = parseRun(["--resume", "run-abc-123"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.resumeId, "run-abc-123");
  });

  test("parses --dry-run and --validate flags", () => {
    const result = parseRun(["--dry-run", "--validate"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.dryRun, true);
    assert.equal(result.args!.validate, true);
  });

  test("returns error for non-numeric --limit", () => {
    const result = parseRun(["--limit", "abc"]);
    assert.ok(result.error !== null);
    assert.ok(result.error.includes("--limit"));
  });
});

// ── improve ──────────────────────────────────────────────────────────────────

describe("parseImprove", () => {
  test("parses --type drift", () => {
    const result = parseImprove(["--type", "drift"]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { type: "drift" });
  });

  test("returns error when --type missing", () => {
    const result = parseImprove([]);
    assert.ok(result.error !== null);
  });

  test("returns error for invalid type", () => {
    const result = parseImprove(["--type", "unknown"]);
    assert.ok(result.error !== null);
  });
});

describe("buildImprove", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildImprove({ type: "compliance" });
    assertTsxInvocation(inv, "improve.ts");
  });

  test("includes --type value", () => {
    const inv = buildImprove({ type: "doctrine" });
    const i = inv.indexOf("--type");
    assert.ok(i >= 0 && inv[i + 1] === "doctrine");
  });
});

describe("buildRun", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildRun({ dryRun: false, validate: false });
    assertTsxInvocation(inv, "factory-run.ts");
  });

  test("includes --limit when provided", () => {
    const inv = buildRun({ limit: 3, dryRun: false, validate: false });
    const i = inv.indexOf("--limit");
    assert.ok(i >= 0 && inv[i + 1] === "3");
  });

  test("includes --resume <id> when resumeId set", () => {
    const inv = buildRun({ resumeId: "run-abc", dryRun: false, validate: false });
    const i = inv.indexOf("--resume");
    assert.ok(i >= 0 && inv[i + 1] === "run-abc");
  });

  test("omits --resume when resumeId not set", () => {
    const inv = buildRun({ dryRun: false, validate: false });
    assert.ok(!inv.includes("--resume"));
  });
});

// ── config ────────────────────────────────────────────────────────────────────

describe("buildConfigReport", () => {
  test("returns factoryRoot in report", () => {
    const report = buildConfigReport("/some/path");
    assert.equal(report.factoryRoot, "/some/path");
  });

  test("reports missing context file for non-existent root", () => {
    const report = buildConfigReport("/definitely/does/not/exist");
    assert.equal(report.contextFileFound, false);
    assert.equal(report.tasksDirFound, false);
    assert.deepEqual(report.workspacesFound, []);
  });
});

describe("formatConfigReport", () => {
  test("includes factory root in output", () => {
    const report = buildConfigReport("/some/path");
    const text = formatConfigReport(report);
    assert.ok(text.includes("/some/path"));
  });

  test("mentions FACTORY_CONTEXT.md", () => {
    const report = buildConfigReport("/some/path");
    const text = formatConfigReport(report);
    assert.ok(text.includes("FACTORY_CONTEXT.md"));
  });

  test("shows source when provided", () => {
    const report = buildConfigReport("/some/path", "env:DEVORY_FACTORY_ROOT");
    const text = formatConfigReport(report);
    assert.ok(text.includes("env:DEVORY_FACTORY_ROOT"));
  });

  test("omits source suffix when source is undefined", () => {
    const report = buildConfigReport("/some/path");
    const text = formatConfigReport(report);
    assert.ok(!text.includes("env:") && !text.includes("git-walk") && !text.includes("cwd"));
  });
});

// ── pr-prep ───────────────────────────────────────────────────────────────────

describe("parsePrPrep", () => {
  test("parses no args (default mode)", () => {
    const result = parsePrPrep([]);
    assert.equal(result.error, null);
    assert.deepEqual(result.args, { file: undefined, dryRun: false });
  });

  test("parses a file path argument", () => {
    const result = parsePrPrep(["tasks/review/factory-066.md"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.file, "tasks/review/factory-066.md");
    assert.equal(result.args!.dryRun, false);
  });

  test("parses --dry-run flag", () => {
    const result = parsePrPrep(["--dry-run"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.dryRun, true);
  });

  test("parses file + --dry-run together", () => {
    const result = parsePrPrep(["tasks/review/foo.md", "--dry-run"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.file, "tasks/review/foo.md");
    assert.equal(result.args!.dryRun, true);
  });

  test("returns error for unknown flag", () => {
    const result = parsePrPrep(["--unknown"]);
    assert.ok(result.error !== null);
  });

  test("returns error for two positional args", () => {
    const result = parsePrPrep(["file-a.md", "file-b.md"]);
    assert.ok(result.error !== null);
  });
});

describe("buildPrPrep", () => {
  test("invocation starts with node + tsx cli", () => {
    const inv = buildPrPrep({ dryRun: false });
    assertTsxInvocation(inv, "pr-preparer.ts");
  });

  test("invocation includes --dry-run when set", () => {
    const inv = buildPrPrep({ dryRun: true });
    assert.ok(inv.includes("--dry-run"));
  });

  test("invocation omits --dry-run when false", () => {
    const inv = buildPrPrep({ dryRun: false });
    assert.ok(!inv.includes("--dry-run"));
  });

  test("invocation includes file path when provided", () => {
    const inv = buildPrPrep({ file: "tasks/review/foo.md", dryRun: false });
    assert.ok(inv.includes("tasks/review/foo.md"));
  });

  test("invocation omits file arg when not provided", () => {
    const inv = buildPrPrep({ dryRun: false });
    // Should only be [node, tsx-cli, scriptPath]
    assert.equal(inv.length, 3);
  });
});

// ── pr-create ─────────────────────────────────────────────────────────────────

describe("parsePrCreate", () => {
  test("parses --task and --branch", () => {
    const result = parsePrCreate(["--task", "tasks/review/foo.md", "--branch", "task/foo"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.task, "tasks/review/foo.md");
    assert.equal(result.args!.branch, "task/foo");
    assert.equal(result.args!.base, "main");
    assert.equal(result.args!.confirm, false);
  });

  test("parses --confirm flag", () => {
    const result = parsePrCreate(["--task", "foo.md", "--branch", "b", "--confirm"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.confirm, true);
  });

  test("parses --base override", () => {
    const result = parsePrCreate(["--task", "foo.md", "--branch", "b", "--base", "develop"]);
    assert.equal(result.error, null);
    assert.equal(result.args!.base, "develop");
  });

  test("returns error when --task is missing", () => {
    const result = parsePrCreate(["--branch", "b"]);
    assert.ok(result.error !== null);
    assert.ok(result.error!.includes("--task"));
  });

  test("returns error when --branch is missing", () => {
    const result = parsePrCreate(["--task", "foo.md"]);
    assert.ok(result.error !== null);
    assert.ok(result.error!.includes("--branch"));
  });

  test("returns error for unknown flag", () => {
    const result = parsePrCreate(["--task", "foo.md", "--branch", "b", "--unknown"]);
    assert.ok(result.error !== null);
    assert.ok(result.error!.includes("Unknown flag"));
  });

  test("returns error for positional argument", () => {
    const result = parsePrCreate(["--task", "foo.md", "--branch", "b", "extra"]);
    assert.ok(result.error !== null);
  });

  test("registry contains pr-create command", () => {
    const cmd = COMMANDS.find((c) => c.name === "pr-create");
    assert.ok(cmd !== undefined);
    assert.ok(cmd!.description.includes("PR"));
    assert.ok(cmd!.usage.includes("--confirm"));
  });
});
