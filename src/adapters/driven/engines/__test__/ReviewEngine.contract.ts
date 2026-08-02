/**
 * Shared, fake-agnostic `ReviewEngine` contract suite (setup §5.4).
 *
 * Parameterized over a harness of scenario factories so every `ReviewEngine`
 * implementation reuses it verbatim (FakeEngine now; claude-code/opencode in
 * E4.F2). It imports ONLY vitest + core port TYPES — never any concrete engine
 * (AC-2). Rejection is asserted as `instanceof Error` (the base class), so a
 * future `EngineError extends Error` still satisfies the contract (AC-3).
 */
import { describe, expect, it } from "vitest";
import type { ReviewEngine, ReviewUsage } from "../../../../core/run/index.js";

/** Scenario factories the contract suite drives, one fresh engine per case. */
export interface ReviewEngineContractHarness {
  /** An engine that resolves with the given output and optional usage. */
  readonly resolving: (output: string, usage?: ReviewUsage) => ReviewEngine;
  /** An engine that rejects `review()` with an `Error`. */
  readonly rejecting: () => ReviewEngine;
}

/**
 * Assert that `harness`'s engines honor the `ReviewEngine` port contract.
 * Pass `label` to name the suite after the concrete implementation.
 */
export function reviewEngineContract(
  harness: ReviewEngineContractHarness,
  label?: string,
): void {
  describe(`ReviewEngine contract${label ? `: ${label}` : ""}`, () => {
    // Minimal valid ReviewRequest — typed contextually by `engine.review()`.
    const req = {
      worktree: { path: "/tmp/fake-worktree" },
      prompt: "review",
      timeoutMs: 1000,
    };

    it("resolves with the configured output and no usage", async () => {
      const result = await harness.resolving("SUCCESS").review(req);
      expect(result.output).toBe("SUCCESS");
      expect(result.usage).toBeUndefined();
    });

    it("propagates the configured usage", async () => {
      const result = await harness
        .resolving("OUT", { totalTokens: 42 })
        .review(req);
      expect(result.usage).toEqual({ totalTokens: 42 });
    });

    it("rejects with an Error", async () => {
      // Capture ONE rejection and assert both matchers against it, so the
      // contract never requires a rejecting engine to reject on repeated
      // calls — a future one-shot real-engine harness stays valid (a single
      // `review()` invocation, not two).
      const rejection = harness.rejecting().review(req);
      await expect(rejection).rejects.toThrow();
      await expect(rejection).rejects.toBeInstanceOf(Error);
    });
  });
}
