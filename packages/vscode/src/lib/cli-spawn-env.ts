import * as path from "path";

function uniquePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

export function buildCliSpawnEnv(cwd: string, cliBin?: string): NodeJS.ProcessEnv {
  const pathEntries = uniquePaths([
    path.join(cwd, "node_modules", ".bin"),
    cliBin ? path.dirname(cliBin) : "",
    process.env.PATH ?? "",
  ]);

  return {
    ...process.env,
    DEVORY_FACTORY_ROOT: cwd,
    PATH: pathEntries.join(path.delimiter),
  };
}
