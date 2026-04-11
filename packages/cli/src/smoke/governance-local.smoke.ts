import { describe, test } from "node:test";
import * as assert from "node:assert/strict";

import { runGovernanceLocalSmoke } from "./governance-local-smoke.ts";

describe("Governance local fallback smoke", () => {
  test("setup, doctor, local enqueue, worker consumption, and governance verification all succeed", async () => {
    const result = await runGovernanceLocalSmoke();

    assert.match(result.doctorSummaryLine, /LOCAL FALLBACK/);
    assert.match(result.workerTransportLine, /local file fallback/);
    assert.match(result.workerProcessedLine, /approve-task:accepted/);
    assert.ok(result.runArtifacts.length > 0, "expected at least one run artifact");
    assert.ok(
      result.recentGovernanceCommits.some((subject) => subject.includes("record outcome for approve-task")),
      "expected command outcome commit in governance git history",
    );
  });
});
