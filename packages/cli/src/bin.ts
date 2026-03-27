#!/usr/bin/env tsx
/**
 * packages/cli/src/bin.ts
 *
 * Main entry point for the `devory` CLI.
 * Parses the top-level command and dispatches to the appropriate module.
 */

import { buildRootHelp, helpFor } from "./help.ts";
import * as init from "./commands/init.ts";
import * as taskNew from "./commands/task-new.ts";
import * as taskMove from "./commands/task-move.ts";
import * as taskValidate from "./commands/task-validate.ts";
import * as runCmd from "./commands/run.ts";
import * as artifacts from "./commands/artifacts.ts";
import * as worker from "./commands/worker.ts";
import * as config from "./commands/config.ts";
import * as license from "./commands/license.ts";
import * as prPrep from "./commands/pr-prep.ts";
import * as prCreate from "./commands/pr-create.ts";
import * as improve from "./commands/improve.ts";

const argv = process.argv.slice(2);

function fatal(msg: string): never {
  console.error(`devory: ${msg}`);
  process.exit(1);
}

async function dispatch(): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(buildRootHelp());
    return 0;
  }

  const first = argv[0];
  const rest = argv.slice(1);

  // ── init ───────────────────────────────────────────────────
  if (first === "init") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("init"));
      return 0;
    }
    const parsed = init.parseArgs(rest);
    return init.run(parsed.args);
  }

  // ── task <sub> ─────────────────────────────────────────────
  if (first === "task") {
    const sub = rest[0];
    const subRest = rest.slice(1);

    if (!sub || sub === "--help" || sub === "-h") {
      console.log(
        ["devory task <subcommand>", "", "Subcommands:", "  new      Create a new task", "  move     Move a task through the lifecycle", "  validate Validate task frontmatter"].join("\n")
      );
      return 0;
    }

    if (sub === "new") {
      if (subRest.includes("--help") || subRest.includes("-h")) {
        console.log(helpFor("task new"));
        return 0;
      }
      const parsed = taskNew.parseArgs(subRest);
      if (parsed.error) fatal(`task new: ${parsed.error}\n\nUsage: ${taskNew.USAGE}`);
      return taskNew.run(parsed.args!);
    }

    if (sub === "move") {
      if (subRest.includes("--help") || subRest.includes("-h")) {
        console.log(helpFor("task move"));
        return 0;
      }
      const parsed = taskMove.parseArgs(subRest);
      if (parsed.error) fatal(`task move: ${parsed.error}\n\nUsage: ${taskMove.USAGE}`);
      return taskMove.run(parsed.args!);
    }

    if (sub === "validate") {
      if (subRest.includes("--help") || subRest.includes("-h")) {
        console.log(helpFor("task validate"));
        return 0;
      }
      const parsed = taskValidate.parseArgs(subRest);
      if (parsed.error) fatal(`task validate: ${parsed.error}\n\nUsage: ${taskValidate.USAGE}`);
      return taskValidate.run(parsed.args!);
    }

    fatal(`Unknown task subcommand: ${sub}\nRun \`devory task --help\` for usage.`);
  }

  // ── run ────────────────────────────────────────────────────
  if (first === "run") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("run"));
      return 0;
    }
    const parsed = runCmd.parseArgs(rest);
    if (parsed.error) fatal(`run: ${parsed.error}\n\nUsage: ${runCmd.USAGE}`);
    return runCmd.run(parsed.args!);
  }

  // ── artifacts ──────────────────────────────────────────────
  if (first === "artifacts") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("artifacts"));
      return 0;
    }
    const parsed = artifacts.parseArgs(rest);
    return artifacts.run(parsed.args);
  }

  // ── worker ─────────────────────────────────────────────────
  if (first === "worker") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("worker"));
      return 0;
    }
    const parsed = worker.parseArgs(rest);
    return worker.run(parsed.args);
  }

  // ── config ─────────────────────────────────────────────────
  if (first === "config") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("config"));
      return 0;
    }
    const parsed = config.parseArgs(rest);
    return await config.run(parsed.args);
  }

  // ── license <sub> ──────────────────────────────────────────
  if (first === "license") {
    if (rest.length === 0 || rest[0] === "--help" || rest[0] === "-h") {
      console.log(
        [
          "devory license <subcommand>",
          "",
          "Subcommands:",
          "  activate  Save a license key to .devory/license",
          "  clear     Remove the saved license file and local cache",
          "  status    Show tier, key source, cache usage, and fallback reason",
          "",
          "Typical flow:",
          "  devory license activate --key <token>",
          "  devory license status",
        ].join("\n")
      );
      return 0;
    }
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor(`license ${rest[0]}`));
      return 0;
    }
    const parsed = license.parseArgs(rest);
    if (parsed.error) fatal(`license: ${parsed.error}\n\nUsage: ${license.USAGE}`);
    return await license.run(parsed.args!);
  }

  // ── pr-prep ────────────────────────────────────────────────
  if (first === "pr-prep") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("pr-prep"));
      return 0;
    }
    const parsed = prPrep.parseArgs(rest);
    if (parsed.error) fatal(`pr-prep: ${parsed.error}\n\nUsage: ${prPrep.USAGE}`);
    return prPrep.run(parsed.args!);
  }

  // ── pr-create ─────────────────────────────────────────────
  if (first === "pr-create") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("pr-create"));
      return 0;
    }
    const parsed = prCreate.parseArgs(rest);
    if (parsed.error) fatal(`pr-create: ${parsed.error}\n\nUsage: ${prCreate.USAGE}`);
    return prCreate.run(parsed.args!);
  }

  // ── improve ───────────────────────────────────────────────
  if (first === "improve") {
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(helpFor("improve"));
      return 0;
    }
    const parsed = improve.parseArgs(rest);
    if (parsed.error) fatal(`improve: ${parsed.error}\n\nUsage: ${improve.USAGE}`);
    return improve.run(parsed.args!);
  }

  // ── unknown ────────────────────────────────────────────────
  fatal(`Unknown command: ${first}\n\n${buildRootHelp()}`);
}

dispatch().then(process.exit).catch((err) => {
  console.error(`devory: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
