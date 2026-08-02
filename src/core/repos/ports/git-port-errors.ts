/**
 * Core module: repos — `GitPort` error family (dec-006).
 *
 * Base class + one typed subclass per failure family so the future run flow
 * and use cases can discriminate by `instanceof` rather than by a string
 * code (exhaustive under strict TS, verbatimModuleSyntax-friendly).
 *
 * `cause` is typed `unknown` on purpose: adapters preserve the raw
 * ExecaError-or-similar for observability, but the core signature must NOT
 * name any I/O type (guard 2 `core-no-io-libs`). The base constructor
 * stores `cause` conditionally via `if ("cause" in options)`, so adapters
 * may pass `{ cause: err }` unconditionally without violating
 * exactOptionalPropertyTypes.
 */

/** Constructor options shared by every `GitError` subclass. */
export interface GitErrorOptions {
  readonly cause?: unknown;
}

/**
 * Base class for every port-level git failure. Catch this to react to any
 * git error without discriminating; catch a subclass to react to one
 * specific family. Never thrown directly — every path in the adapter
 * chooses one of the four subclasses below.
 */
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

/** Raised when `clone()` fails (bad URL, network, auth, relative path). */
export class GitCloneError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitCloneError";
  }
}

/** Raised when `fetch()` fails (unknown remote, network, auth). */
export class GitFetchError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitFetchError";
  }
}

/**
 * Catch-all for other git-invocation failures the port surface produces
 * (`branches()`, `defaultBranch()` when the root cause is a git error other
 * than an unset HEAD — for example: not a git repo, missing binary). Kept
 * separate from `GitError` so downstream code that only wants to react to
 * "git command misbehaved" (as opposed to "clone/fetch failed") can catch
 * this class specifically.
 */
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

/** Raised by `worktreeAdd()`, `worktreeRemove()`, `worktreeList()` on failure. */
export class GitWorktreeError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitWorktreeError";
  }
}

/** Raised by `mergeBase()` when either ref is unresolvable. */
export class GitMergeBaseError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitMergeBaseError";
  }
}

/** Raised by `diff()` on any git failure. */
export class GitDiffError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitDiffError";
  }
}
