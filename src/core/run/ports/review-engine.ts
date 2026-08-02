import type { WorktreeRef } from "../worktree-ref.js";

/**
 * Core module: run — driven port `ReviewEngine` (PRD §4.3).
 *
 * The border contract the whole product converges on: given a prepared
 * worktree, a prompt, and a timeout, run the review with a delegated engine
 * (Claude Code, OpenCode, …) and return its raw output plus optional usage.
 *
 * THIN invocation contract (dec-004 / Q2): it returns only what the engine
 * produced. It does NOT parse a verdict and does NOT decide a TerminalState —
 * that is run-domain work done downstream (E4.F1.H1/H2). Adapters implement
 * this port in `src/adapters/driven/engines/*`; the core never knows which
 * engine runs. Its shared contract suite + FakeEngine land in E0.F2.H2 (#6).
 */
export interface ReviewEngine {
  /**
   * Run one review in the given worktree and return the engine's raw output.
   * Asynchronous by nature — the implementing adapter spawns an external CLI.
   */
  review(request: ReviewRequest): Promise<ReviewResult>;
}

/** Invocation input: what an engine needs to run one review. */
export interface ReviewRequest {
  /** The ephemeral worktree the review runs in. */
  readonly worktree: WorktreeRef;
  /** Fully assembled prompt (harness + skills + diff + validations). */
  readonly prompt: string;
  /** Hard wall-clock budget for the invocation, in milliseconds. */
  readonly timeoutMs: number;
}

/** Invocation output: the engine's raw result, nothing interpreted. */
export interface ReviewResult {
  /** Raw, unparsed engine output (markdown / text / JSON as produced). */
  readonly output: string;
  /** Optional, best-effort resource usage if the engine exposes it. */
  readonly usage?: ReviewUsage;
}

/**
 * Minimal, intentionally loose usage shape. Every field optional so E1
 * engine-spike fixtures can refine it without churn (Q4). Not a cost/billing
 * model — only what an engine happens to report.
 */
export interface ReviewUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}
