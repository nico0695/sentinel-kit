/**
 * Core module: run — error family (PRD §4.2, sanctioned by `d-dec004-scope`).
 *
 * Base class + one typed subclass per failure family, following the same
 * pattern as `WorkspaceError` / `GitError` / `HarnessError`: `Error` suffix,
 * `cause` typed `unknown` and stored conditionally so callers may pass
 * `{ cause: err }` unconditionally without violating
 * exactOptionalPropertyTypes.
 *
 * These classes are what `runReview` (E4.F1.H1) discriminates on when it maps
 * a stage fault to a `TerminalState`. That mapping keys on the concrete
 * subclasses only: the `RunError` base is never tested, so adding a subclass
 * later cannot silently reroute an existing state.
 */

/** Constructor options shared by every `RunError` subclass. */
export interface RunErrorOptions {
  readonly cause?: unknown;
}

/**
 * Base class for every run-domain failure. Catch this to react to any run
 * error without discriminating; catch a subclass to react to one specific
 * family. Never thrown directly — every path chooses one of the subclasses
 * below.
 */
export class RunError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: RunErrorOptions) {
    super(message);
    this.name = "RunError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

/**
 * Raised by the run request pre-flight when the caller's `RunReviewRequest`
 * is malformed (non-positive `timeoutMs`, empty `harnessType`, empty refs).
 * An EXPECTED domain outcome, not a bug: `cause` is intentionally not
 * populated, mirroring `InvalidWorktreeRequestError`.
 */
export class InvalidRunRequestError extends RunError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRunRequestError";
  }
}

/**
 * Raised when the `ReviewEngine` invocation rejects. The raw rejection is
 * preserved in `cause` for observability — the core never names the engine's
 * own error types (guard 2 `core-no-io-libs`).
 */
export class EngineInvocationError extends RunError {
  constructor(message: string, options?: RunErrorOptions) {
    super(message, options);
    this.name = "EngineInvocationError";
  }
}

/**
 * Raised when the `ReviewEngine` invocation exceeds the run's budget. Kept
 * distinct from `EngineInvocationError` because it is the sole producer of
 * the `timeout` terminal state. `timeoutMs` is the budget that elapsed, not
 * the time actually spent.
 */
export class EngineTimeoutError extends RunError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, options?: RunErrorOptions) {
    super(`Engine invocation timed out after ${timeoutMs}ms`, options);
    this.name = "EngineTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Raised by `validateProcessRunRequest` when a `ProcessRunRequest` is
 * malformed (empty `command`, empty `cwd`, non-positive/non-finite
 * `timeoutMs`, or an invalid `maxOutputChars`) — before any process is
 * spawned. An EXPECTED domain outcome, not a bug: `cause` is intentionally
 * not populated, mirroring `InvalidRunRequestError`.
 */
export class InvalidProcessRequestError extends RunError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProcessRequestError";
  }
}

/**
 * Raised by the `ProcessRunner` adapter when the process never actually ran
 * (a nonexistent binary, a non-executable file, an unusable `cwd`, …). The
 * raw underlying error is preserved in `cause` for observability — the core
 * never names the process-execution library's own error types (guard 2
 * `core-no-io-libs`).
 */
export class ProcessSpawnError extends RunError {
  constructor(message: string, options?: RunErrorOptions) {
    super(message, options);
    this.name = "ProcessSpawnError";
  }
}

/**
 * Raised by `validateValidationDeclarations` / `tokenizeDeclaration` when a
 * declared validation entry is malformed: it contains a character with a
 * meaning in POSIX shell word expansion that `shell: false` cannot honor
 * (spec.md AC-7), or it is empty / yields zero tokens after trimming
 * (AC-8). An EXPECTED domain outcome, not a bug: `cause` is intentionally
 * not populated, mirroring `InvalidRunRequestError`.
 */
export class InvalidValidationDeclarationError extends RunError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidValidationDeclarationError";
  }
}

/** The cascade level a rejected `resolveEngine` value came from (PRD §3.1-D). */
export type EngineResolutionLevel = "run" | "repo" | "global";

/**
 * Raised by `resolveEngine` when the precedence-resolved value (whichever of
 * run/repo/global override actually won) is not a recognized engine name. A
 * deterministic input-shape failure, not a wrapped exception: `cause` is
 * intentionally not populated, mirroring `InvalidRunRequestError`.
 */
export class UnknownEngineError extends RunError {
  readonly value: string;
  readonly level: EngineResolutionLevel;
  constructor(value: string, level: EngineResolutionLevel) {
    super(`Unknown engine "${value}" from ${level} override`);
    this.name = "UnknownEngineError";
    this.value = value;
    this.level = level;
  }
}
