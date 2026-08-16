/**
 * Driven adapter: opencode — typed local error classes for the
 * `OpenCodeAdapter` (PRD §4.2). Three flat `Error` subclasses, no shared
 * base class, no `cause` field on any of them — unlike claude-code's
 * `ClaudeCodeInvocationError`, there is no single underlying exception to
 * preserve here (AC-10 drops unparseable NDJSON lines silently, with no
 * per-line error object worth attaching). None touch the `ReviewEngine`
 * port, which declares no error types.
 */

/** Thrown when the pre-flight `opencode --version` check fails (AC-5). */
export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeUnavailableError";
  }
}

/** Thrown when zero lines of stdout parse as valid JSON (AC-15) — the review never started (e.g. an unknown-model log dump). */
export class OpenCodeInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeInvocationError";
  }
}

/** Thrown when a review session started but failed: an in-stream `error` event (AC-16) or no output was ever produced (AC-17). */
export class OpenCodeReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeReviewError";
  }
}
