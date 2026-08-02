/**
 * FakeEngine test: drives the shared `ReviewEngine` contract suite through a
 * harness over `createFakeEngine`, and covers the array-script sequence /
 * exhaustion branches that single-outcome scenarios never exercise.
 *
 * `createFakeEngine` is imported from the engines PUBLIC index (`../index.js`),
 * proving the adapter is reachable through its public API (dec-006).
 */
import { describe, expect, it } from "vitest";
import { createFakeEngine } from "../index.js";
import {
  type ReviewEngineContractHarness,
  reviewEngineContract,
} from "./ReviewEngine.contract.js";

const harness: ReviewEngineContractHarness = {
  // exactOptionalPropertyTypes: never set `usage: undefined` — build the
  // shape conditionally.
  resolving: (output, usage) =>
    createFakeEngine({
      ok: true,
      result: usage === undefined ? { output } : { output, usage },
    }),
  rejecting: () =>
    createFakeEngine({ ok: false, error: new Error("engine failed") }),
};

reviewEngineContract(harness, "FakeEngine");

describe("FakeEngine array script", () => {
  const req = {
    worktree: { path: "/tmp/fake-worktree" },
    prompt: "review",
    timeoutMs: 1000,
  };

  it("consumes outcomes in order and rejects past the end", async () => {
    const engine = createFakeEngine([
      { ok: true, result: { output: "first" } },
      { ok: true, result: { output: "second" } },
    ]);

    expect((await engine.review(req)).output).toBe("first");
    expect((await engine.review(req)).output).toBe("second");
    await expect(engine.review(req)).rejects.toThrow("script exhausted");
  });
});
