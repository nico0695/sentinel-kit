/**
 * Core module: workspace — error family (PRD §4.2).
 *
 * Base class + one typed subclass per failure family following the same
 * pattern as `RepoRegistrationError` in the repos module. `cause` is typed
 * `unknown` and stored conditionally for `exactOptionalPropertyTypes`
 * compliance.
 */

export interface WorkspaceErrorOptions {
  readonly cause?: unknown;
}

export class WorkspaceError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message);
    this.name = "WorkspaceError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class WorktreeCreationError extends WorkspaceError {
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message, options);
    this.name = "WorktreeCreationError";
  }
}

export class WorktreeCleanupError extends WorkspaceError {
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message, options);
    this.name = "WorktreeCleanupError";
  }
}

export class InvalidWorktreeRequestError extends WorkspaceError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorktreeRequestError";
  }
}
