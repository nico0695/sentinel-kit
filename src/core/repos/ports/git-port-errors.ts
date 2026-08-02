/**
 * Core module: repos — `GitPort` error family (dec-006).
 *
 * Base class + one typed subclass per failure family so the future run flow
 * and use cases can discriminate by `instanceof` rather than a string code
 * (exhaustive under strict TS, verbatimModuleSyntax-friendly).
 *
 * `cause` is typed `unknown` on purpose: the adapter preserves the raw
 * ExecaError-or-similar for observability, but the core signature must NOT
 * name any I/O type (guard 2 `core-no-io-libs`). Adapters build the shape
 * CONDITIONALLY under exactOptionalPropertyTypes — never assign
 * `cause: undefined`.
 */

export interface GitErrorOptions {
  readonly cause?: unknown;
}

export class GitError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: GitErrorOptions) {
    super(message);
    this.name = "GitError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class GitCloneError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitCloneError";
  }
}

export class GitFetchError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitFetchError";
  }
}

export class GitCommandError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitCommandError";
  }
}

/**
 * Raised by `defaultBranch()` when the local repo has no symbolic HEAD for
 * the requested remote — an EXPECTED domain outcome, not a bug. `cause` is
 * intentionally not populated (spec §Error translation table).
 */
export class GitNoDefaultBranchError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitNoDefaultBranchError";
  }
}
