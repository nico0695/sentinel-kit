/**
 * Core module: run — worktree boundary value.
 *
 * The minimal, run-owned reference handed to a ReviewEngine: the on-disk
 * location of the ephemeral git worktree a review runs in (PRD §5.1). A pure
 * value object — zero I/O, no handle, no coupling to the `workspace` module
 * that creates worktrees (dec-005 / Q3). Kept a named type (not a bare
 * `string`) so it can grow extra invocation-relevant fields without churn.
 */
export interface WorktreeRef {
  /** Absolute filesystem path of the review's worktree. */
  readonly path: string;
}
