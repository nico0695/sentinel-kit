/**
 * Core module: run — review orchestration, states, verdict (PRD §4.2).
 *
 * Public API: the `ReviewEngine` driven port and its invocation types, the
 * run-domain `TerminalState` model, the `WorktreeRef` boundary value, and the
 * `runReview` use case with its request/deps/result shapes, its error family
 * and its two injectable seams (`VerdictParser`, `TimeoutScheduler`). The
 * module's second driven port, ProcessRunner, lands in E5.F1.x.
 *
 * Deliberately NOT public (AC-16): the built-in verdict extraction, the
 * default timeout scheduler, the engine race helper and the failure
 * classifier. They are implementation detail of the use case — `[E4.F1.H2]`
 * (#27) replaces the built-in extraction through the `deps.parseVerdict`
 * seam without touching this surface.
 */

export type { TimeoutScheduler } from "./engine-timeout.js";
export type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
  ReviewUsage,
} from "./ports/review-engine.js";
export {
  EngineInvocationError,
  EngineTimeoutError,
  InvalidRunRequestError,
  RunError,
  type RunErrorOptions,
} from "./run-errors.js";
export {
  type RunCleanupOutcome,
  type RunCleanupReason,
  type RunFailure,
  type RunReviewDeps,
  type RunReviewRequest,
  type RunReviewResult,
  type RunStage,
  runReview,
} from "./run-review.js";
export type { TerminalState } from "./terminal-state.js";
export type { Verdict, VerdictParser } from "./verdict.js";
export type { WorktreeRef } from "./worktree-ref.js";
