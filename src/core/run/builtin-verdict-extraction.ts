/**
 * Core module: run — the built-in `VerdictParser` implementation.
 *
 * DELIBERATELY NAIVE, and that is the contract: it scans output lines for a
 * trimmed, case-sensitive, fully anchored `VERDICT: <value>` marker and does
 * NO normalization of any kind — no ANSI stripping, no markdown/code-fence
 * unwrapping, no case folding, no fuzzy matching. Hardening the parser is
 * `[E4.F1.H2]` (#27), which replaces this function through the
 * `deps.parseVerdict` seam without touching `runReview`.
 *
 * Module-private in the sense that matters here: never re-exported from the
 * module's public `index.ts` (AC-16). The file-level `export` exists only so
 * `run-review.ts` can use it as the default parser.
 */

import type { Verdict } from "./verdict.js";

/** Anchored, case-sensitive marker. Applied to an already trimmed line. */
const VERDICT_LINE = /^VERDICT:\s*(approve|request-changes|comment)$/;

/**
 * Extracts the single distinct verdict from raw engine output.
 *
 * Returns the verdict when exactly one DISTINCT value is found — repeated
 * identical markers collapse to that one value. Returns `null` when zero
 * markers match or when two conflicting values are present; `runReview` turns
 * `null` into the `ambiguous` terminal state.
 */
export function extractBuiltInVerdict(output: string): Verdict | null {
  const found = new Set<Verdict>();
  for (const line of output.split("\n")) {
    const match = VERDICT_LINE.exec(line.trim());
    if (match !== null) {
      found.add(match[1] as Verdict);
    }
  }
  const [only] = [...found];
  return found.size === 1 && only !== undefined ? only : null;
}
