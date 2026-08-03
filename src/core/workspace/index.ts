/**
 * Core module: workspace — worktree lifecycle for reviews (PRD §4.2).
 *
 * Public API: three use cases (createReviewWorktree, cleanupWorktree,
 * listOrphanWorktrees), the CleanupPolicy type, the workspace error
 * family, and all request/result shapes. Helpers are internal.
 */

export type { CleanupPolicy } from "./cleanup-policy.js";
export {
  type CleanupWorktreeDeps,
  type CleanupWorktreeRequest,
  type CleanupWorktreeResult,
  cleanupWorktree,
} from "./cleanup-worktree.js";
export {
  type CreateReviewWorktreeDeps,
  type CreateReviewWorktreeRequest,
  createReviewWorktree,
  type ReviewWorktreeResult,
} from "./create-review-worktree.js";
export {
  type ListOrphanWorktreesDeps,
  type ListOrphanWorktreesRequest,
  type ListOrphanWorktreesResult,
  listOrphanWorktrees,
  type OrphanWorktreeInfo,
} from "./list-orphan-worktrees.js";
export {
  InvalidWorktreeRequestError,
  WorkspaceError,
  type WorkspaceErrorOptions,
  WorktreeCleanupError,
  WorktreeCreationError,
} from "./workspace-errors.js";
