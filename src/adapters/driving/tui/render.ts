/**
 * Driving adapter: tui — minimal rendering (`[E6.F2.H1]`, #38; AC-7, AC-9).
 *
 * Deliberately minimal, per the H1/H2 boundary: the result step shows the
 * terminal state, the verdict when one exists, and the persisted run
 * directory — no markdown rendering, no severity highlighting. Rich
 * rendering is `[E6.F2.H2]`'s entire scope and will rewrite this surface.
 */

import type { TerminalState, Verdict } from "../../../core/run/index.js";

/** Rendered in place of a run directory that does not exist (D13 path). */
const ABSENT = "-";

/**
 * Reduces any throwable to a single human-readable line.
 *
 * DELIBERATE DUPLICATION of the CLI's `render/format-error.ts`
 * (design §Resolution 2): the `adapters-isolated` guard forbids every
 * cross-adapter import — driving → driving included — and editing a PRD §4.5
 * guard to save these ~10 lines is disproportionate. Revisit only if
 * `[E6.F2.H2]` materially grows the overlap.
 */
export function formatTuiErrorLine(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const collapsed = raw.replace(/\s*\n\s*/g, " ").trim();

  if (collapsed !== "") {
    return collapsed;
  }

  return error instanceof Error && error.name !== ""
    ? error.name
    : "Unknown error";
}

/**
 * The minimal result block (AC-7): state, verdict when present, run
 * directory. `runDir` renders as `-` when persistence failed — nothing was
 * written, so no directory is fabricated (mirrors the CLI's D13 semantics).
 */
export function formatTuiResult(
  state: TerminalState,
  verdict: Verdict | undefined,
  runDir?: string,
): readonly string[] {
  return [
    `State: ${state}`,
    ...(verdict !== undefined ? [`Verdict: ${verdict}`] : []),
    `Run directory: ${runDir ?? ABSENT}`,
  ];
}
