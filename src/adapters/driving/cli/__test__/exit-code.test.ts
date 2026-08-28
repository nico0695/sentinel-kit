/**
 * The pure review exit-code mapping (`[E6.F1.H2]`, #37 — AC-1..AC-5, AC-7).
 *
 * `resolveReviewExitCode` is a leaf: no CLI, no fakes, no `process`. These
 * cases pin every row of the e6h2-D1 table — each terminal state, each verdict
 * within `ok`, a custom changes code, and the soft-gate `0` — so a regression
 * in the two-axis logic fails here before it can reach the wiring.
 */

import { describe, expect, it } from "vitest";
import type { TerminalState, Verdict } from "../../../../core/run/index.js";
import { resolveReviewExitCode } from "../exit-code.js";

/** Every non-`ok` terminal state maps to 2 regardless of the changes code. */
const NON_OK_STATES: readonly TerminalState[] = [
  "ambiguous",
  "engine-error",
  "timeout",
  "validation-failed",
];

describe("resolveReviewExitCode — ok state (AC-1, AC-2)", () => {
  it("returns 0 for ok/approve", () => {
    expect(resolveReviewExitCode("ok", "approve", 1)).toBe(0);
  });

  it("returns 0 for ok/comment", () => {
    expect(resolveReviewExitCode("ok", "comment", 1)).toBe(0);
  });

  it("returns the changes code (default 1) for ok/request-changes", () => {
    expect(resolveReviewExitCode("ok", "request-changes", 1)).toBe(1);
  });
});

describe("resolveReviewExitCode — non-ok states (AC-3)", () => {
  it.each(NON_OK_STATES)("returns 2 for %s", (state) => {
    // No non-ok state reads the verdict; the changes code is irrelevant here.
    expect(resolveReviewExitCode(state, undefined, 1)).toBe(2);
    expect(resolveReviewExitCode(state, undefined, 42)).toBe(2);
  });
});

describe("resolveReviewExitCode — configurable changes code (AC-4, AC-5)", () => {
  it("returns the custom code for ok/request-changes", () => {
    expect(resolveReviewExitCode("ok", "request-changes", 20)).toBe(20);
  });

  it("returns 0 for ok/request-changes with a soft gate of 0", () => {
    expect(resolveReviewExitCode("ok", "request-changes", 0)).toBe(0);
  });

  it("leaves the passing and failing rows unaffected by the changes code", () => {
    // AC-4: the flag changes only the request-changes row.
    expect(resolveReviewExitCode("ok", "approve", 20)).toBe(0);
    expect(resolveReviewExitCode("ok", "comment", 20)).toBe(0);
    expect(resolveReviewExitCode("timeout", undefined, 20)).toBe(2);
  });
});

describe("resolveReviewExitCode — purity (AC-7)", () => {
  it("defensively treats an absent verdict on ok as a pass", () => {
    // Type-impossible per RunReviewResult, but the mapping must not throw and
    // must default to 0 (pass), the least-surprising outcome.
    const verdict = undefined as Verdict | undefined;
    expect(resolveReviewExitCode("ok", verdict, 1)).toBe(0);
  });
});
