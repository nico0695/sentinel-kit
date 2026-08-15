/**
 * Driven adapter: claude-code — typed local error classes for the
 * `ClaudeCodeAdapter` (PRD §4.2). Three flat `Error` subclasses, no shared
 * base class — spec.md fixes exactly three, no family hierarchy implied.
 * None touch the `ReviewEngine` port, which declares no error types.
 */

/** Thrown when the pre-flight `claude --version` check fails (AC-5). No `cause` — the pre-check's own rejection/non-zero exit is not itself informative beyond "the binary is unusable". */
export class ClaudeCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCodeUnavailableError";
  }
}

/** Thrown when stdout cannot be parsed as JSON, or parses but lacks a usable `.result` on `is_error:false` (AC-8, AC-9, AC-14). */
export class ClaudeCodeInvocationError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ClaudeCodeInvocationError";
    if (options !== undefined && "cause" in options) this.cause = options.cause;
  }
}

/** Thrown when the real review invocation's own envelope reports `.is_error === true`, for ANY cause including an adapter-initiated SIGTERM kill that still flushed JSON (AC-13, AC-18). Message = `.result` when present, else a fallback naming exit code/signal. */
export class ClaudeCodeReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCodeReviewError";
  }
}
