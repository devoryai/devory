import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Resolves the path to the `devory` CLI binary.
 *
 * Search order:
 *  1. `<cwd>/node_modules/.bin/devory`  — project-local install
 *  2. Walk up the directory tree for `node_modules/.bin/devory` — monorepo
 *  3. The binary returned by `which devory` / `where devory` — global install
 *
 * Throws if the binary cannot be found by any means.
 */
export async function findDevoryCli(cwd: string): Promise<string> {
  // 1. Project-local
  const localBin = path.join(cwd, "node_modules", ".bin", "devory");
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 2. Walk up the directory tree looking for a node_modules/.bin/devory
  //    (handles monorepos where node_modules lives at the repo root)
  const segments = cwd.split(path.sep);
  for (let i = segments.length - 1; i > 0; i--) {
    const candidate = path.join(
      segments.slice(0, i).join(path.sep) || path.sep,
      "node_modules",
      ".bin",
      "devory"
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Global binary on PATH
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(whichCmd, ["devory"]);
    const resolved = stdout.trim().split("\n")[0].trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // `which` / `where` not found or devory not on PATH — fall through
  }

  throw new Error("devory CLI not found");
}
