/**
 * Core module: run — verdict domain type (PRD §9 glossary).
 *
 * The review's opinion, as opposed to `TerminalState`, which describes the
 * run itself: `state: "ok"` + `verdict: "request-changes"` is a normal,
 * successful run (PRD §5.2). A verdict exists only when the run reached the
 * `ok` state; `ambiguous` is precisely the absence of a single distinct one.
 */
export type Verdict = "approve" | "request-changes" | "comment";

/**
 * The seam `runReview` applies to raw engine output. `null` means "no single
 * distinct verdict" — zero matches or conflicting matches — which the run
 * domain turns into the `ambiguous` terminal state.
 *
 * H1 ships a deliberately naive built-in implementation; `[E4.F1.H2]` (#27)
 * replaces it with the defensive parser through this same type, so
 * `runReview` does not change.
 */
export type VerdictParser = (output: string) => Verdict | null;
