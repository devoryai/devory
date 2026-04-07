import { registerHooks } from "module";
import path from "path";
import { pathToFileURL } from "url";

const globalKey = "__devory_command_test_hooks_installed__";
const globalState = globalThis as typeof globalThis & Record<string, boolean | undefined>;

if (!globalState[globalKey]) {
  const supportDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const aliases = new Map<string, string>([
    ["vscode", path.join(supportDir, "vscode-stub.js")],
    ["../lib/task-create.js", path.join(supportDir, "task-create-stub.js")],
    ["../lib/task-move.js", path.join(supportDir, "task-move-stub.js")],
    ["../lib/task-control.js", path.join(supportDir, "task-control-stub.js")],
    ["../lib/task-reader.js", path.join(supportDir, "task-reader-stub.js")],
    ["../lib/task-target.js", path.join(supportDir, "task-target-stub.js")],
    ["../lib/run-adapter.js", path.join(supportDir, "run-adapter-stub.js")],
  ]);

  registerHooks({
    resolve(specifier, context, nextResolve) {
      const target = aliases.get(specifier);
      if (target) {
        return {
          shortCircuit: true,
          url: pathToFileURL(target).href,
        };
      }
      return nextResolve(specifier, context);
    },
  });

  globalState[globalKey] = true;
}
