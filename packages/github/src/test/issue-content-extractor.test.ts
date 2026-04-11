import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  extractAcceptanceCriteria,
  filterPlanningComments,
} from "../lib/issue-content-extractor.ts";

describe("extractAcceptanceCriteria", () => {
  test("extracts AC section items with canonical heading", () => {
    const body = [
      "## Context",
      "Some context",
      "",
      "## Acceptance Criteria",
      "- one",
      "- two",
      "",
      "## Notes",
      "later",
    ].join("\n");

    assert.deepEqual(extractAcceptanceCriteria(body), ["one", "two"]);
  });

  test("supports AC short form and returns [] when section absent", () => {
    const bodyWithAc = ["## AC", "* first", "* second"].join("\n");
    assert.deepEqual(extractAcceptanceCriteria(bodyWithAc), ["first", "second"]);
    assert.deepEqual(extractAcceptanceCriteria("Unstructured body"), []);
  });
});

describe("filterPlanningComments", () => {
  test("filters bot and badge-only comments conservatively", () => {
    const comments = [
      { user: { login: "github-actions[bot]" }, body: "Automated update" },
      { user: { login: "human-user" }, body: "[![CI](https://x)](https://y)" },
      { user: { login: "teammate" }, body: "We should split this into two steps." },
    ];

    assert.deepEqual(filterPlanningComments(comments), [
      "We should split this into two steps.",
    ]);
  });
});
