/**
 * Core module: run — review orchestration, states, verdict (PRD §4.2).
 *
 * Public API (types only in H1): the `ReviewEngine` driven port and its
 * invocation types, plus the run-domain `TerminalState` model and the
 * `WorktreeRef` boundary value. The runReview use case lands in E4.F1.x; the
 * module's second driven port, ProcessRunner, lands in E5.F1.x.
 */
export type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
  ReviewUsage,
} from "./ports/review-engine.js";
export type { TerminalState } from "./terminal-state.js";
export type { WorktreeRef } from "./worktree-ref.js";
