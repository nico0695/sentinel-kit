/**
 * Core module: run — review orchestration, states, verdict (PRD §4.2).
 *
 * Public API: the `ReviewEngine` driven port and its invocation types, the
 * run-domain `TerminalState` model, the `WorktreeRef` boundary value, the
 * `runReview` use case with its request/deps/result shapes, its error family
 * and its two injectable seams (`VerdictParser`, `TimeoutScheduler`), and the
 * `resolveEngine` cascade function (`[E4.F2.H3]`, #30) with its own error.
 * The module's second driven port, `ProcessRunner` (`[E5.F1.H1]`, #31), and
 * its request pre-flight `validateProcessRunRequest` — no caller yet, an
 * execa adapter lands the same story.
 *
 * Deliberately NOT public (AC-16): the built-in verdict extraction, the
 * default timeout scheduler, the engine race helper and the failure
 * classifier. They are implementation detail of the use case — `[E4.F1.H2]`
 * (#27) hardened the built-in extraction in place, still reached only
 * through the `deps.parseVerdict` seam, without touching this surface.
 */

export type { TimeoutScheduler } from "./engine-timeout.js";
export type {
  ProcessRunner,
  ProcessRunRequest,
  ProcessRunResult,
} from "./ports/process-runner.js";
export type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
  ReviewUsage,
} from "./ports/review-engine.js";
export { validateProcessRunRequest } from "./process-run-request.js";
export { type ResolveEngineInput, resolveEngine } from "./resolve-engine.js";
export {
  EngineInvocationError,
  type EngineResolutionLevel,
  EngineTimeoutError,
  InvalidProcessRequestError,
  InvalidRunRequestError,
  InvalidValidationDeclarationError,
  ProcessSpawnError,
  RunError,
  type RunErrorOptions,
  UnknownEngineError,
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
export {
  type RunValidationsDeps,
  type RunValidationsRequest,
  type RunValidationsResult,
  runValidations,
  validateValidationDeclarations,
} from "./run-validations.js";
export type { TerminalState } from "./terminal-state.js";
export type { Verdict, VerdictParser } from "./verdict.js";
export type { WorktreeRef } from "./worktree-ref.js";
