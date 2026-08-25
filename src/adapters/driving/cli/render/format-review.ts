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
import type {
  RunReviewRequest,
  RunReviewResult,
} from "../../../../core/run/index.js";
import { formatErrorLine } from "./format-error.js";

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
 * Renders one outcome block. The single place the field order is applied:
 * both renderers below index their scalars by {@link REVIEW_OUTCOME_FIELDS},
 * so the exported constant is the contract rather than a description of one.
 */
function renderOutcome(
  scalars: ReadonlyArray<string | number | undefined>,
): readonly string[] {
  return REVIEW_OUTCOME_FIELDS.map(
    (key, index) => `${key}\t${field(scalars[index])}`,
  );
}

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

  return renderOutcome(scalars);
}

/**
 * The same block for a review that completed but whose record never reached
 * disk (D13, `R4-001`).
 *
 * `persistRun` throwing used to discard the outcome entirely: the record and
 * the run directory are both *its* return values, so the happy-path renderer
 * has nothing to render. Rather than fabricate a `runDir` — which would
 * point a user at a directory that does not exist — this renderer produces
 * the identical field block from what the command still holds: the request
 * it built and the result `runReview` resolved with. `runDir` renders as the
 * `-` absence marker, which is the literal truth.
 *
 * It shares {@link REVIEW_OUTCOME_FIELDS} and {@link renderOutcome} with the
 * persisted renderer, so the two blocks cannot drift apart in shape.
 *
 * @param repoAlias the alias the caller typed.
 * @param request the request `runReview` was invoked with.
 * @param result the result `runReview` resolved with.
 * @param durationMs elapsed wall-clock time, measured by the command's clock
 *   seam — the same quantity `persistRun` would have recorded.
 */
export function formatUnpersistedReviewOutcome(
  repoAlias: string,
  request: RunReviewRequest,
  result: RunReviewResult,
  durationMs: number,
): readonly string[] {
  const scalars: Array<string | number | undefined> = [
    repoAlias,
    request.targetRef,
    result.state,
    result.verdict,
    // The engine the run reports, falling back to the one it was asked for.
    result.engineName ?? request.engineName,
    request.harnessType,
    durationMs,
    result.failure?.stage,
    // `RunFailure.error` is `unknown` by design; `formatErrorLine` is this
    // adapter's own reduction of any throwable to one line, so no core
    // reduction rule is restated here.
    result.failure === undefined
      ? undefined
      : formatErrorLine(result.failure.error),
    // Never fabricated: nothing was written, so there is no directory.
    undefined,
  ];

  return renderOutcome(scalars);
}
