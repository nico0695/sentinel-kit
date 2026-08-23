/**
 * Core module: run — use case `runReview` (PRD §4.6, §5.1, §5.2, §9).
 *
 * The flow the whole product converges on:
 * worktree → diff → prompt → engine → parse → terminal state → cleanup.
 *
 * Two structural guarantees shape this file, and neither is a convention a
 * future edit may quietly drop:
 *
 * 1. `executePipeline` CANNOT throw. Its return type carries a mandatory
 *    `TerminalState`, so "every run ends in exactly one terminal state" is a
 *    compile-time obligation rather than discipline spread over eight stages,
 *    and one exhaustive `catch (error: unknown)` at a single call site makes
 *    escape impossible (any unrecognized throwable becomes `engine-error`
 *    with the original preserved in `failure.error`).
 * 2. Cleanup therefore runs SEQUENTIALLY after the pipeline returns, never in
 *    a `finally`. Because the pipeline cannot throw, cleanup cannot be
 *    skipped — and because no `finally` exists, cleanup has no way to
 *    override the already-computed outcome. It annotates only.
 */

import type { GitPort } from "../repos/index.js";
import {
  assemblePrompt,
  ContextModeNotSupportedError,
  HarnessNotFoundError,
  HarnessValidationError,
  type LoadHarnessesDeps,
  loadHarnesses,
  SkillNotFoundError,
} from "../review/index.js";
import {
  type CleanupPolicy,
  type CleanupWorktreeResult,
  cleanupWorktree,
  computeReviewDiff,
  createReviewWorktree,
  DiffSizePolicyError,
  InvalidWorktreeRequestError,
  type ReviewDiff,
} from "../workspace/index.js";
import { extractBuiltInVerdict } from "./builtin-verdict-extraction.js";
import {
  defaultTimeoutScheduler,
  runEngineWithTimeout,
  type TimeoutScheduler,
} from "./engine-timeout.js";
import type { ProcessRunner } from "./ports/process-runner.js";
import type { ReviewEngine, ReviewUsage } from "./ports/review-engine.js";
import {
  EngineTimeoutError,
  InvalidProcessRequestError,
  InvalidRunRequestError,
  InvalidValidationDeclarationError,
} from "./run-errors.js";
import {
  runValidations,
  validateValidationDeclarations,
} from "./run-validations.js";
import type { TerminalState } from "./terminal-state.js";
import type { Verdict, VerdictParser } from "./verdict.js";

/* ------------------------------------------------------------------ */
/*  Public request / dependency / result shapes                        */
/* ------------------------------------------------------------------ */

export interface RunReviewRequest {
  /**
   * Managed clone the review runs against. Absoluteness is validated by
   * `createReviewWorktree`, deliberately not re-validated here (see the
   * request stage).
   */
  readonly repoPath: string;
  /** Base ref of the comparison — `merge-base(base, target)..target`. */
  readonly baseRef: string;
  /** Ref under review; also the worktree's commitish and branch label. */
  readonly targetRef: string;
  /** Harness type name, resolved internally through `deps.harnesses`. */
  readonly harnessType: string;
  /** Hard wall-clock budget for the engine invocation, in milliseconds. */
  readonly timeoutMs: number;
  /** Worktree cleanup policy. Defaults to `"always"` (PRD §5.1). */
  readonly cleanupPolicy?: CleanupPolicy;
  /** Diff size limits; omitted means the workspace module's defaults. */
  readonly limits?: {
    readonly maxLines: number;
    readonly maxTokens: number;
  };
  /**
   * Caller-supplied validation evidence, forwarded verbatim ahead of any
   * evidence this run computes itself (AC-16's ordering) — the seam
   * `[E4.F1.H1]` introduced before declared validations existed.
   */
  readonly validationOutput?: readonly string[];
  /**
   * Declared validation strings (`RepoEntry.validations`), run at stage 5
   * through `deps.processRunner` when both it and this list are non-empty
   * (`[E5.F1.H2]`, #32). Absent or empty is a byte-identical no-op — no
   * stage-1 check fires and stage 5 stays skipped (AC-1).
   */
  readonly validations?: readonly string[];
  /**
   * Per-script wall-clock budget forwarded to `runValidations`. Range-checked
   * at stage 1 (AC-4) only when validations will actually run; omitted means
   * `runValidations`' own `DEFAULT_VALIDATION_TIMEOUT_MS`.
   */
  readonly validationTimeoutMs?: number;
  /**
   * Opaque echo, not inspected or validated by `runReview` — a caller that
   * already resolved which engine `deps.engine` implements (`resolveEngine`,
   * `[E4.F2.H3]`, #30) may carry that fact through the run so a result
   * consumer can see it without a `RunStore` (`docs/backlog-mvp-sentinel.md`
   * §E4.F2.H3's "engine used recorded in run metadata").
   */
  readonly engineName?: string;
}

export interface RunReviewDeps {
  readonly git: GitPort;
  readonly engine: ReviewEngine;
  /** The `{ factory, user }` harness loader pair (`d-harness-resolution`). */
  readonly harnesses: LoadHarnessesDeps;
  /** Absolute directory the ephemeral worktrees are created under. */
  readonly worktreesDir: string;
  /** Clock seam, forwarded to `createReviewWorktree`. */
  readonly now?: () => number;
  /** Verdict parsing seam; the built-in default was hardened by `[E4.F1.H2]` (#27). */
  readonly parseVerdict?: VerdictParser;
  /** Timeout scheduling seam; defaults to the global-timer scheduler. */
  readonly scheduleTimeout?: TimeoutScheduler;
  /**
   * Declared-validation execution seam (`[E5.F1.H2]`, #32). Absent means
   * stage 5 never runs, regardless of `request.validations` — the
   * composition root wires this only once an adapter exists (E6).
   */
  readonly processRunner?: ProcessRunner;
}

/**
 * The pipeline stage a fault occurred in, so E6 can render an accurate
 * message without a sixth terminal state.
 *
 * `"cleanup"` is deliberately absent: a cleanup fault is structurally
 * incapable of becoming a `RunFailure`.
 */
export type RunStage =
  | "request"
  | "harness"
  | "worktree"
  | "diff"
  | "validations"
  | "prompt"
  | "engine"
  | "parse";

export interface RunFailure {
  readonly stage: RunStage;
  /**
   * `unknown` rather than `Error` because the catch-all is total: a non-`Error`
   * throwable is reachable and is preserved here untouched.
   */
  readonly error: unknown;
}

/** `CleanupWorktreeResult`'s reasons plus the fault-annotation reason. */
export type RunCleanupReason =
  | CleanupWorktreeResult["reason"]
  | "cleanup-failed";

/**
 * Cleanup outcome, annotation-only (it never influences `state`).
 *
 * `attempted: true` means a worktree existed and `cleanupWorktree` was
 * consulted — INCLUDING the paths where it returns without ever invoking git:
 * `policy: "keep"` (`reason: "policy-keep"`) and `on-success` after a failed
 * review (`reason: "review-failed"`). So `attempted: true, removed: false`
 * does not by itself mean "tried and failed"; read `reason` to distinguish a
 * policy retention from an actual `"cleanup-failed"` fault.
 *
 * `attempted: false` means no worktree was ever created (a stage-1/stage-2
 * fault), so there was nothing to consult.
 */
export type RunCleanupOutcome =
  | { readonly attempted: false }
  | {
      readonly attempted: true;
      readonly removed: boolean;
      readonly reason: RunCleanupReason;
      readonly error?: unknown;
    };

export interface RunReviewResult {
  /** Exactly one terminal state, always present. */
  readonly state: TerminalState;
  /** Present only on `ok`. `ok` describes the run, not the opinion. */
  readonly verdict?: Verdict;
  /** Present once the worktree stage succeeded. */
  readonly worktreePath?: string;
  /** Present once the diff stage succeeded; warnings included. */
  readonly diff?: ReviewDiff;
  /** Present once the prompt stage succeeded (PRD §9 persists it). */
  readonly prompt?: string;
  /**
   * Raw, unparsed engine output — present whenever the ENGINE stage
   * succeeded, not only on `ok` / `ambiguous`: a parse-stage fault yields
   * `engine-error` with `engineOutput` AND `failure` both set.
   */
  readonly engineOutput?: string;
  /** Passthrough of whatever the engine reported, if anything. */
  readonly usage?: ReviewUsage;
  /**
   * Present on every state other than `ok` / `ambiguous`. Not exclusive with
   * `engineOutput` — see its comment above.
   */
  readonly failure?: RunFailure;
  /** Always present. Never influences `state`. */
  readonly cleanup: RunCleanupOutcome;
  /** Echoes `request.engineName` verbatim when the caller supplied one. */
  readonly engineName?: string;
}

/* ------------------------------------------------------------------ */
/*  Internal state (NOT exported)                                      */
/* ------------------------------------------------------------------ */

/**
 * Node's `setTimeout` upper bound (2^31 - 1 ms). Larger values overflow the
 * signed 32-bit timer and are clamped to 1 ms, which would invert an
 * "effectively no limit" budget into an immediate bogus `timeout` — so the
 * pre-flight rejects them instead.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Partial results accumulated as the pipeline advances. Mutable by design so
 * a fault at stage N still reports everything stages 1..N-1 produced.
 */
interface RunDraft {
  worktreePath?: string;
  diff?: ReviewDiff;
  prompt?: string;
  engineOutput?: string;
  usage?: ReviewUsage;
}

/**
 * The pipeline's only return shape. `state` is MANDATORY: that is what makes
 * "exactly one terminal state" a property the compiler checks.
 */
interface PipelineOutcome {
  readonly state: TerminalState;
  readonly verdict?: Verdict;
  readonly failure?: RunFailure;
}

/* ------------------------------------------------------------------ */
/*  Use case                                                           */
/* ------------------------------------------------------------------ */

/**
 * Runs one code review end to end and ALWAYS resolves — never rejects — with
 * a result carrying exactly one terminal state.
 *
 * The worktree is cleaned up on every path where one was created, according
 * to `request.cleanupPolicy`. A cleanup fault is reported in `result.cleanup`
 * and changes nothing else.
 */
export async function runReview(
  request: RunReviewRequest,
  deps: RunReviewDeps,
): Promise<RunReviewResult> {
  const draft: RunDraft = {};
  const outcome = await executePipeline(request, deps, draft);
  // Deliberate policy: `ambiguous` counts as NOT succeeded for cleanup
  // purposes, so under `on-success` the worktree is retained for inspection.
  // Rationale fixed in spec.md (Cleanup semantics): literal reading of
  // "success" — keeping a worktree is cheap and reversible, deleting one
  // someone wanted is not.
  const cleanup = await performCleanup(
    request,
    deps,
    draft,
    outcome.state === "ok",
  );

  return {
    state: outcome.state,
    ...(outcome.verdict !== undefined ? { verdict: outcome.verdict } : {}),
    ...(draft.worktreePath !== undefined
      ? { worktreePath: draft.worktreePath }
      : {}),
    ...(draft.diff !== undefined ? { diff: draft.diff } : {}),
    ...(draft.prompt !== undefined ? { prompt: draft.prompt } : {}),
    ...(draft.engineOutput !== undefined
      ? { engineOutput: draft.engineOutput }
      : {}),
    ...(draft.usage !== undefined ? { usage: draft.usage } : {}),
    ...(outcome.failure !== undefined ? { failure: outcome.failure } : {}),
    cleanup,
    ...(request.engineName !== undefined
      ? { engineName: request.engineName }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Pipeline (private, cannot throw)                                   */
/* ------------------------------------------------------------------ */

/**
 * Runs the review stages, recording partial results in `draft` as they become
 * available. Declared to return a `PipelineOutcome`, and the single
 * catch-all below guarantees it does: no throwable escapes.
 */
async function executePipeline(
  request: RunReviewRequest,
  deps: RunReviewDeps,
  draft: RunDraft,
): Promise<PipelineOutcome> {
  let stage: RunStage = "request";

  try {
    /* --- 1. request pre-flight --- */
    if (request.repoPath === "") {
      throw new InvalidRunRequestError("repoPath must not be empty");
    }
    if (request.baseRef === "") {
      throw new InvalidRunRequestError("baseRef must not be empty");
    }
    if (request.baseRef.startsWith("-")) {
      throw new InvalidRunRequestError(
        "baseRef must not start with '-' (would be parsed as a git option)",
      );
    }
    if (request.targetRef === "") {
      throw new InvalidRunRequestError("targetRef must not be empty");
    }
    if (request.targetRef.startsWith("-")) {
      throw new InvalidRunRequestError(
        "targetRef must not start with '-' (would be parsed as a git option)",
      );
    }
    if (request.harnessType === "") {
      throw new InvalidRunRequestError("harnessType must not be empty");
    }
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
      throw new InvalidRunRequestError(
        "timeoutMs must be a finite number greater than 0",
      );
    }
    if (request.timeoutMs > MAX_TIMEOUT_MS) {
      throw new InvalidRunRequestError(
        `timeoutMs must not exceed ${MAX_TIMEOUT_MS} (Node's setTimeout upper bound)`,
      );
    }

    // Hoisted declared-validations pre-flight (design.md D-4). Conditional on
    // validations actually running at stage 5 — when no runner is wired or
    // no validations are declared, this is a byte-identical no-op (AC-1).
    // `declarations` is computed once here and reused at stage 5 so the two
    // sites can never see different lists.
    const declarations = request.validations ?? [];
    const validationsWillRun =
      deps.processRunner !== undefined && declarations.length > 0;
    if (validationsWillRun) {
      if (request.validationTimeoutMs !== undefined) {
        if (
          !Number.isFinite(request.validationTimeoutMs) ||
          request.validationTimeoutMs <= 0
        ) {
          throw new InvalidRunRequestError(
            "validationTimeoutMs must be a finite number greater than 0",
          );
        }
        if (request.validationTimeoutMs > MAX_TIMEOUT_MS) {
          throw new InvalidRunRequestError(
            `validationTimeoutMs must not exceed ${MAX_TIMEOUT_MS} (Node's setTimeout upper bound)`,
          );
        }
      }
      validateValidationDeclarations(declarations);
    }

    /* --- 2. harness (hoisted: an unknown harness leaves no orphan) --- */
    stage = "harness";
    const harnesses = await loadHarnesses(deps.harnesses);
    const resolvedHarness = harnesses.get(request.harnessType);
    if (resolvedHarness === undefined) {
      throw new HarnessNotFoundError(request.harnessType);
    }

    /* --- 3. worktree --- */
    stage = "worktree";
    const worktree = await createReviewWorktree(
      {
        repoPath: request.repoPath,
        commitish: request.targetRef,
        branchLabel: request.targetRef,
      },
      {
        git: deps.git,
        worktreesDir: deps.worktreesDir,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
      },
    );
    draft.worktreePath = worktree.path;

    /* --- 4. diff (against the managed clone, not the worktree) --- */
    stage = "diff";
    const diff = await computeReviewDiff(
      {
        repoPath: request.repoPath,
        baseRef: request.baseRef,
        targetRef: request.targetRef,
        ...(request.limits !== undefined ? { limits: request.limits } : {}),
      },
      { git: deps.git },
    );
    draft.diff = diff;

    /* --- 5. validations (optional; a runtime outcome is evidence, never a fault) --- */
    let validationOutput: readonly string[] | undefined =
      request.validationOutput;
    const processRunner = deps.processRunner;
    if (processRunner !== undefined && declarations.length > 0) {
      stage = "validations";
      const computed = await runValidations(
        {
          declarations,
          cwd: worktree.path,
          ...(request.validationTimeoutMs !== undefined
            ? { timeoutMs: request.validationTimeoutMs }
            : {}),
        },
        { processRunner },
      );
      validationOutput = [...(request.validationOutput ?? []), ...computed]; // AC-16 order
    }

    /* --- 6. prompt --- */
    stage = "prompt";
    const prompt = assemblePrompt({
      resolvedHarness,
      diff,
      ...(validationOutput !== undefined ? { validationOutput } : {}),
    });
    draft.prompt = prompt;

    /* --- 7. engine, raced against the run's own wall clock --- */
    stage = "engine";
    const engineResult = await runEngineWithTimeout(
      () =>
        deps.engine.review({
          worktree: { path: worktree.path },
          prompt,
          timeoutMs: request.timeoutMs,
        }),
      request.timeoutMs,
      deps.scheduleTimeout ?? defaultTimeoutScheduler,
    );
    draft.engineOutput = engineResult.output;
    if (engineResult.usage !== undefined) {
      draft.usage = engineResult.usage;
    }

    /* --- 8. parse --- */
    stage = "parse";
    const parse = deps.parseVerdict ?? extractBuiltInVerdict;
    const verdict = parse(engineResult.output);
    if (verdict === null) {
      return { state: "ambiguous" };
    }
    return { state: "ok", verdict };
  } catch (error: unknown) {
    return { state: classifyFailure(error), failure: { stage, error } };
  }
}

/* ------------------------------------------------------------------ */
/*  Failure classification (private, pure, total)                      */
/* ------------------------------------------------------------------ */

/**
 * Maps a stage fault to its terminal state.
 *
 * Keyed on the ERROR CLASS ALONE: every class in the spec's mapping table
 * resolves to the same state in every stage it can appear in, so pairing it
 * with the stage would add a second source of truth. `failure.stage` records
 * the stage independently.
 *
 * The chain never tests the base classes `RunError`, `WorkspaceError` or
 * `HarnessError` — that is what keeps `WorktreeCreationError` (and any future
 * sibling) on the `engine-error` fall-through instead of silently inheriting
 * `validation-failed`.
 */
function classifyFailure(error: unknown): TerminalState {
  if (error instanceof EngineTimeoutError) {
    return "timeout";
  }
  if (
    error instanceof InvalidRunRequestError ||
    error instanceof InvalidWorktreeRequestError ||
    error instanceof DiffSizePolicyError ||
    error instanceof HarnessNotFoundError ||
    error instanceof SkillNotFoundError ||
    error instanceof HarnessValidationError ||
    error instanceof ContextModeNotSupportedError ||
    error instanceof InvalidValidationDeclarationError ||
    error instanceof InvalidProcessRequestError
  ) {
    return "validation-failed";
  }
  // `ProcessSpawnError` is deliberately absent from this branch: AC-12
  // guarantees `runValidations` catches it per entry and records it as
  // evidence, so it can never reach this classifier.
  return "engine-error";
}

/* ------------------------------------------------------------------ */
/*  Cleanup (private, cannot throw, annotates only)                    */
/* ------------------------------------------------------------------ */

/**
 * Removes the ephemeral worktree according to the policy, converting any
 * fault into an annotation. `reviewSucceeded` arrives already computed and
 * read-only, so nothing here can reach the terminal state.
 */
async function performCleanup(
  request: RunReviewRequest,
  deps: RunReviewDeps,
  draft: RunDraft,
  reviewSucceeded: boolean,
): Promise<RunCleanupOutcome> {
  if (draft.worktreePath === undefined) {
    return { attempted: false };
  }

  try {
    const result = await cleanupWorktree(
      {
        repoPath: request.repoPath,
        worktreePath: draft.worktreePath,
        policy: request.cleanupPolicy ?? "always",
        reviewSucceeded,
      },
      { git: deps.git },
    );
    return { attempted: true, removed: result.removed, reason: result.reason };
  } catch (error: unknown) {
    return {
      attempted: true,
      removed: false,
      reason: "cleanup-failed",
      error,
    };
  }
}
