/**
 * packages/vscode/src/test/ollama-refine.test.ts
 *
 * Tests for src/lib/ollama-refine.ts.
 *
 * All Ollama HTTP calls are replaced by injected fetch stubs so no network
 * access is required. Tests cover:
 *   - validation of the refined payload shape
 *   - graceful fallback when Ollama is unreachable
 *   - graceful fallback on invalid / malformed model responses
 *   - correct title + goal overlay when Ollama returns a valid response
 *   - draft count is never increased beyond the baseline
 *
 * Run: tsx --test packages/vscode/src/test/ollama-refine.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateRefinedPayload, tryRefineTaskDrafts } from "../lib/ollama-refine.js";
import { buildMinimalTaskDraftFixture } from "@devory/core";
import type { TaskPlanningDraft } from "@devory/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(overrides: Partial<TaskPlanningDraft> = {}): TaskPlanningDraft {
  return buildMinimalTaskDraftFixture(overrides);
}

/** Build a fetch stub that simulates Ollama returning specific data. */
function makeOllamaFetch(options: {
  tagsReachable?: boolean;
  tagsModels?: string[];
  generateResponse?: string;
}): typeof fetch {
  const { tagsReachable = true, tagsModels = ["llama3.2"], generateResponse } = options;

  return (async (url: RequestInfo | URL, _init?: RequestInit) => {
    const urlStr = String(url);

    if (urlStr.includes("/api/tags")) {
      if (!tagsReachable) {
        throw new Error("ECONNREFUSED");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: tagsModels.map((name) => ({ name })),
        }),
      } as Response;
    }

    if (urlStr.includes("/api/generate")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: generateResponse ?? "" }),
      } as Response;
    }

    throw new Error(`Unexpected URL: ${urlStr}`);
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// validateRefinedPayload
// ---------------------------------------------------------------------------

describe("validateRefinedPayload", () => {
  test("accepts a valid single-task payload", () => {
    const result = validateRefinedPayload({
      mode: "single",
      tasks: [{ title: "Add authentication middleware", goal: "Protect API endpoints with JWT" }],
    });
    assert.ok(result !== null);
    assert.equal(result!.mode, "single");
    assert.equal(result!.tasks.length, 1);
  });

  test("accepts a valid split payload with 2 tasks", () => {
    const result = validateRefinedPayload({
      mode: "split",
      tasks: [
        { title: "Add user model", goal: "Define user schema and DB migration" },
        { title: "Implement login endpoint", goal: "Handle POST /auth/login with JWT response" },
      ],
    });
    assert.ok(result !== null);
    assert.equal(result!.tasks.length, 2);
  });

  test("rejects null", () => {
    assert.equal(validateRefinedPayload(null), null);
  });

  test("rejects array at top level", () => {
    assert.equal(validateRefinedPayload([{ mode: "single", tasks: [] }]), null);
  });

  test("rejects invalid mode value", () => {
    assert.equal(
      validateRefinedPayload({ mode: "multi", tasks: [{ title: "T", goal: "G" }] }),
      null
    );
  });

  test("rejects empty tasks array", () => {
    assert.equal(validateRefinedPayload({ mode: "single", tasks: [] }), null);
  });

  test("rejects tasks array exceeding 4", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      title: `Task ${i}`,
      goal: `Goal ${i}`,
    }));
    assert.equal(validateRefinedPayload({ mode: "split", tasks }), null);
  });

  test("rejects task with empty title", () => {
    assert.equal(
      validateRefinedPayload({
        mode: "single",
        tasks: [{ title: "   ", goal: "Some goal" }],
      }),
      null
    );
  });

  test("rejects task with empty goal", () => {
    assert.equal(
      validateRefinedPayload({
        mode: "single",
        tasks: [{ title: "Do something", goal: "" }],
      }),
      null
    );
  });

  test("rejects duplicate titles (case-insensitive)", () => {
    assert.equal(
      validateRefinedPayload({
        mode: "split",
        tasks: [
          { title: "Add auth", goal: "Goal A" },
          { title: "add auth", goal: "Goal B" },
        ],
      }),
      null
    );
  });

  test("trims whitespace from titles and goals", () => {
    const result = validateRefinedPayload({
      mode: "single",
      tasks: [{ title: "  Add feature  ", goal: "  Some goal  " }],
    });
    assert.ok(result !== null);
    assert.equal(result!.tasks[0].title, "Add feature");
    assert.equal(result!.tasks[0].goal, "Some goal");
  });
});

// ---------------------------------------------------------------------------
// tryRefineTaskDrafts — fallback behaviour
// ---------------------------------------------------------------------------

describe("tryRefineTaskDrafts — fallback on unavailability", () => {
  test("returns existing drafts unchanged when Ollama tags endpoint returns non-OK status", async () => {
    const drafts = [makeDraft({ title: "Original task" })];
    const fetchStub = (async () =>
      ({ ok: false, status: 503, json: async () => ({}) }) as Response) as typeof fetch;
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: fetchStub,
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when Ollama is unreachable", async () => {
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: makeOllamaFetch({ tagsReachable: false }),
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when Ollama has no models", async () => {
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: makeOllamaFetch({ tagsReachable: true, tagsModels: [] }),
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when generate returns empty response", async () => {
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: makeOllamaFetch({ generateResponse: "" }),
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when generate returns invalid JSON", async () => {
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: makeOllamaFetch({ generateResponse: "not json at all" }),
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when JSON fails validation", async () => {
    const invalid = JSON.stringify({ mode: "wrong", tasks: [] });
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build something", null, drafts, {
      fetchFn: makeOllamaFetch({ generateResponse: invalid }),
    });
    assert.deepEqual(result, drafts);
  });

  test("returns existing drafts unchanged when generate returns duplicate titles", async () => {
    const dupes = JSON.stringify({
      mode: "split",
      tasks: [
        { title: "Add auth", goal: "G1" },
        { title: "Add auth", goal: "G2" },
      ],
    });
    const drafts = [makeDraft({ title: "Original task" })];
    const result = await tryRefineTaskDrafts("Build authentication", null, drafts, {
      fetchFn: makeOllamaFetch({ generateResponse: dupes }),
    });
    assert.deepEqual(result, drafts);
  });
});

// ---------------------------------------------------------------------------
// tryRefineTaskDrafts — successful refinement
// ---------------------------------------------------------------------------

describe("tryRefineTaskDrafts — successful refinement", () => {
  test("overlays refined title and goal when Ollama returns a valid response", async () => {
    const refined = JSON.stringify({
      mode: "split",
      tasks: [
        { title: "Define user schema and migration", goal: "Create DB schema for users" },
        { title: "Implement login endpoint", goal: "Handle POST /auth/login" },
      ],
    });

    const baseline = [
      makeDraft({ draft_id: "factory-001", title: "Original A", goal: "Old goal A" }),
      makeDraft({ draft_id: "factory-002", title: "Original B", goal: "Old goal B" }),
    ];

    const result = await tryRefineTaskDrafts(
      "Add user auth with a login endpoint",
      ["Define user schema", "Implement login endpoint"],
      baseline,
      { fetchFn: makeOllamaFetch({ generateResponse: refined }) }
    );

    assert.equal(result.length, 2);
    assert.equal(result[0].title, "Define user schema and migration");
    assert.equal(result[0].goal, "Create DB schema for users");
    assert.equal(result[1].title, "Implement login endpoint");
    assert.equal(result[1].goal, "Handle POST /auth/login");
  });

  test("preserves non-title/goal metadata from baseline drafts", async () => {
    const refined = JSON.stringify({
      mode: "single",
      tasks: [{ title: "Refined title", goal: "Refined goal" }],
    });

    const baseline = [
      makeDraft({
        draft_id: "factory-042",
        title: "Original",
        goal: "Old goal",
        type: "bugfix",
        priority: "high",
        depends_on: ["factory-040"],
      }),
    ];

    const result = await tryRefineTaskDrafts("Fix something", null, baseline, {
      fetchFn: makeOllamaFetch({ generateResponse: refined }),
    });

    assert.equal(result[0].title, "Refined title");
    assert.equal(result[0].goal, "Refined goal");
    assert.equal(result[0].draft_id, "factory-042");
    assert.equal(result[0].type, "bugfix");
    assert.equal(result[0].priority, "high");
    assert.deepEqual(result[0].depends_on, ["factory-040"]);
  });

  test("caps refined count at baseline length when Ollama returns more tasks than baseline", async () => {
    // Ollama returns 3 but baseline only has 2
    const refined = JSON.stringify({
      mode: "split",
      tasks: [
        { title: "Task A", goal: "Goal A" },
        { title: "Task B", goal: "Goal B" },
        { title: "Task C", goal: "Goal C" },
      ],
    });

    const baseline = [
      makeDraft({ draft_id: "factory-001", title: "Original A" }),
      makeDraft({ draft_id: "factory-002", title: "Original B" }),
    ];

    const result = await tryRefineTaskDrafts("Build three things", null, baseline, {
      fetchFn: makeOllamaFetch({ generateResponse: refined }),
    });

    // Must not exceed baseline count
    assert.equal(result.length, 2);
    assert.equal(result[0].title, "Task A");
    assert.equal(result[1].title, "Task B");
  });

  test("returns fewer drafts when Ollama consolidates into fewer tasks", async () => {
    // Ollama consolidates 3 baseline tasks into 2
    const refined = JSON.stringify({
      mode: "split",
      tasks: [
        { title: "Consolidated task A", goal: "Covers first two concerns" },
        { title: "Consolidated task B", goal: "Covers remaining concern" },
      ],
    });

    const baseline = [
      makeDraft({ draft_id: "factory-001", title: "Original A" }),
      makeDraft({ draft_id: "factory-002", title: "Original B" }),
      makeDraft({ draft_id: "factory-003", title: "Original C" }),
    ];

    const result = await tryRefineTaskDrafts("Build three things", null, baseline, {
      fetchFn: makeOllamaFetch({ generateResponse: refined }),
    });

    assert.equal(result.length, 2);
  });
});
