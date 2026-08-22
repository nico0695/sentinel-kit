/**
 * Core module: history — `RunStore` driven port (PRD §4.3).
 *
 * Owned by `history`, backed by `storage` (`docs/architecture.md`). A run's
 * types arrive through `run`'s public barrel — the only cross-module import
 * this file makes, permitted by the `core-modules-via-index` guard.
 */
import type {
  ReviewUsage,
  RunStage,
  TerminalState,
  Verdict,
} from "../../run/index.js";

/**
 * Diff facts worth persisting — deliberately NOT the diff bodies. Full
 * per-file diff text already lives in the prompt sent to the engine
 * (`prompt.md`); duplicating it into metadata would be redundant and, if
 * a future edit accepted `ReviewDiff` directly instead of this summary,
 * would risk writing the whole diff into `metadata.json`.
 */
export interface RunDiffSummary {
  readonly fileCount: number;
  readonly totalLines: number;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
}

/**
 * No `cause`, no stack, no exception object — a raw throwable is
 * structurally unable to reach disk through this shape.
 */
export interface RunFailureRecord {
  readonly stage: RunStage;
  readonly message: string;
}

/**
 * A fully composed run, ready to persist. `RunStore` does not compose this
 * from a `RunReviewRequest`/`RunReviewResult` pair — the caller does, so
 * `history` never depends on `run`'s request shape and `runReview` is never
 * touched by this module's existence.
 */
export interface RunRecord {
  readonly repoName: string;
  readonly startedAtEpochMs: number;
  readonly durationMs: number;
  readonly harness: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly state: TerminalState;
  readonly engine?: string;
  readonly verdict?: Verdict;
  readonly prompt?: string;
  readonly engineOutput?: string;
  readonly diff?: RunDiffSummary;
  readonly usage?: ReviewUsage;
  readonly validationOutput?: readonly string[];
  readonly failure?: RunFailureRecord;
}

export interface RunStore {
  /** Resolves with the absolute path of the created run directory. */
  save(record: RunRecord): Promise<string>;
}
