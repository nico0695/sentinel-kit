/**
 * Driving adapter: cli — review-outcome rendering (`[E6.F1.H1]`, #36; AC-10).
 *
 * One completed `sentinel review` produces one block of `key<TAB>value` lines,
 * the same shape `runs show` uses — deliberately, because the block describes
 * the very record `sentinel runs show` will render later, and a consumer that
 * can parse one can parse the other.
 *
 * Three properties are load-bearing:
 *
 * 1. **The alias echoed back is the one the caller typed.** `RunRecord`'s own
 *    `repoName` carries D7's storage key (`owner/repo` → `owner__repo`), so
 *    printing it would show a user something they never typed
 *    (`risk-e6h1-009`). The alias arrives as a parameter and the stored field
 *    is ignored, exactly as `format-runs.ts` does it.
 * 2. **The terminal state is rendered, never interpreted.** Nothing here maps
 *    a state to an exit code, a colour or a severity — that mapping is
 *    `[E6.F1.H2]`'s (#37) and this story introduces no exit-code table
 *    (AC-12).
 * 3. **A failed run renders its failure.** `failureStage`/`failureMessage`
 *    are fields of the record like any other, so an `engine-error` run
 *    explains itself on stdout without a stderr branch and without
 *    decoration.
 */

import type { RunRecord } from "../../../../core/history/index.js";

/** Rendered in place of a field the record does not carry. */
const ABSENT = "-";

/**
 * Renders one scalar field. Tabs and newlines collapse to single spaces:
 * they are the field and record separators, and a failure message carrying a
 * newline would otherwise split one record across two lines (AC-10).
 */
function field(value: string | number | undefined): string {
  if (value === undefined) {
    return ABSENT;
  }

  const rendered = String(value)
    .replace(/[\t\r\n]+/g, " ")
    .trim();

  return rendered === "" ? ABSENT : rendered;
}

/**
 * Field order of the `review` outcome block. Exported so the tests assert the
 * contract rather than a hand-copied string, and so a future `--json` mode
 * (deferred by D6) has one place to read the field names from.
 */
export const REVIEW_OUTCOME_FIELDS = [
  "repo",
  "targetRef",
  "state",
  "verdict",
  "engine",
  "harness",
  "durationMs",
  "failureStage",
  "failureMessage",
  "runDir",
] as const;

/**
 * The outcome of one completed review: the persisted record's facts plus the
 * absolute run directory `persistRun` resolved (AC-6).
 *
 * @param repoAlias the alias the caller typed — never `record.repoName`.
 * @param record the record as persisted, returned by `persistRun`.
 * @param runDir the absolute run directory, returned by `persistRun`.
 */
export function formatReviewOutcome(
  repoAlias: string,
  record: RunRecord,
  runDir: string,
): readonly string[] {
  const scalars: Array<string | number | undefined> = [
    repoAlias,
    record.targetRef,
    record.state,
    record.verdict,
    record.engine,
    record.harness,
    record.durationMs,
    record.failure?.stage,
    record.failure?.message,
    runDir,
  ];

  return REVIEW_OUTCOME_FIELDS.map(
    (key, index) => `${key}\t${field(scalars[index])}`,
  );
}
