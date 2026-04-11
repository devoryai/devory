import * as fs from "fs";
import * as path from "path";

/**
 * Resolve the shipped defaults directory from either source (`src/defaults`)
 * or bundled package output (`dist` next to `src/defaults`).
 */
export function resolveCoreDefaultsDir(moduleDir: string): string {
  const candidates = [
    path.join(moduleDir, "defaults"),
    path.join(moduleDir, "..", "src", "defaults"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}
