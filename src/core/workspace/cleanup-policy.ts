/**
 * Core module: workspace — cleanup policy for ephemeral worktrees.
 *
 * Controls when a review worktree is removed after a review completes:
 * - "always": remove regardless of review outcome.
 * - "on-success": remove only when the review succeeded; keep on failure.
 * - "keep": never remove (useful for debugging).
 */
export type CleanupPolicy = "always" | "on-success" | "keep";
