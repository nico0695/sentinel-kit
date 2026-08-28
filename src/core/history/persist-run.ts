/**
 * Core module: history — use case `persistRun` (D1, AC-5).
 *
 * The owner of the act nobody had: composing a `RunRecord` from the
 * `RunReviewRequest`/`RunReviewResult` pair and handing it to
 * `RunStore.save()`. `[E4.F1.H1]` deliberately left `runReview` without a
 * `RunStore` dependency and `[E5.F2.H1]` deliberately left `RunRecord`
 * caller-composed, so "history never depends on run's request shape and
 * runReview is never touched by this module's existence". This use case is
 * that caller — inside `history`, where the persistence rules already live,
 * and therefore not in the CLI command (AC-1) and not in `src/main/`.
 *
 * Two reduction rules are load-bearing, not stylistic:
 *
 * 1. `result.diff` (a full `ReviewDiff`, file bodies included) is reduced to
 *    `RunDiffSummary`. The per-file diff text is already persisted as
 *    `prompt.md`; letting it reach `metadata.json` would duplicate the whole
 *    diff on disk (see `ports/run-store.ts`).
 * 2. `result.failure` (whose `error` is `unknown` by design — a non-`Error`
 *    throwable is reachable) is reduced to `{ stage, message }`. No `cause`,
 *    no stack, no exception object, so nothing sensitive a throwable might
 *    carry can be written out.
 *
 * `run`'s types arrive through its public barrel, the only cross-module
 * import here, as the `core-modules-via-index` guard requires.
 */

import type { RunReviewRequest, RunReviewResult } from "../run/index.js";
import type {
  RunDiffSummary,
  RunFailureRecord,
  RunRecord,
  RunStore,
} from "./ports/run-store.js";
import { toRunStorageKey } from "./run-storage-key.js";

export interface PersistRunRequest {
  /**
   * User-facing repo alias (`owner/repo`); normalised to a single-segment
   * storage key before it reaches the store, exactly as `listRuns`/`getRun`
   * normalise their query input (D7).
   */
  readonly repoName: string;
  /** Epoch ms the run started at — the caller's clock reading, not ours. */
  readonly startedAtEpochMs: number;
  /** The request `runReview` was invoked with. */
  readonly request: RunReviewRequest;
  /** The result `runReview` resolved with, whatever its terminal state. */
  readonly result: RunReviewResult;
}

export interface PersistRunDeps {
  readonly store: RunStore;
  /** Clock seam used only to derive `durationMs`. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface PersistRunResult {
  /** Absolute path of the created run directory, as `RunStore.save` resolves it. */
  readonly runDir: string;
  /** The record exactly as persisted, so a caller can render it without a re-read. */
  readonly record: RunRecord;
}

/**
 * Reduces a review diff to the facts worth keeping in `metadata.json`.
 * Reads `ReviewDiff` structurally, so neither `workspace` nor `run` needs a
 * new export for this module's sake.
 */
function toDiffSummary(
  diff: NonNullable<RunReviewResult["diff"]>,
): RunDiffSummary {
  return {
    fileCount: diff.files.length,
    totalLines: diff.totalLines,
    estimatedTokens: diff.estimatedTokens,
    truncated: diff.truncated,
    warnings: diff.warnings.map((warning) => warning.message),
  };
}

/**
 * Reduces a run failure to a persistable shape. `error` is `unknown`, so the
 * message is derived defensively: an `Error` yields its message, anything
 * else is stringified.
 */
function toFailureRecord(
  failure: NonNullable<RunReviewResult["failure"]>,
): RunFailureRecord {
  return {
    stage: failure.stage,
    message:
      failure.error instanceof Error
        ? failure.error.message
        : String(failure.error),
  };
}

/**
 * Composes the record for one completed review and persists it.
 *
 * Called after `runReview` resolves — for every terminal state, not only
 * `ok`: a failed run is exactly the run a user later wants to read back.
 *
 * @returns the absolute run directory and the persisted record.
 */
export async function persistRun(
  request: PersistRunRequest,
  deps: PersistRunDeps,
): Promise<PersistRunResult> {
  const { request: runRequest, result } = request;
  const now = deps.now ?? Date.now;
  const engine = result.engineName ?? runRequest.engineName;

  const record: RunRecord = {
    repoName: toRunStorageKey(request.repoName),
    startedAtEpochMs: request.startedAtEpochMs,
    durationMs: Math.max(0, now() - request.startedAtEpochMs),
    harness: runRequest.harnessType,
    baseRef: runRequest.baseRef,
    targetRef: runRequest.targetRef,
    state: result.state,
    ...(engine !== undefined ? { engine } : {}),
    ...(result.verdict !== undefined ? { verdict: result.verdict } : {}),
    ...(result.prompt !== undefined ? { prompt: result.prompt } : {}),
    ...(result.engineOutput !== undefined
      ? { engineOutput: result.engineOutput }
      : {}),
    ...(result.diff !== undefined ? { diff: toDiffSummary(result.diff) } : {}),
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
    ...(runRequest.validationOutput !== undefined
      ? { validationOutput: runRequest.validationOutput }
      : {}),
    ...(result.failure !== undefined
      ? { failure: toFailureRecord(result.failure) }
      : {}),
  };

  const runDir = await deps.store.save(record);
  return { runDir, record };
}
