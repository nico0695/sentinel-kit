/**
 * Core module: workspace — use case `cleanupWorktree`.
 *
 * Removes an ephemeral review worktree according to the configured
 * cleanup policy (PRD §5.1):
 * - always: remove regardless of outcome.
 * - on-success: remove only when the review succeeded.
 * - keep: never remove (debugging).
 */

import type { GitPort } from "../repos/index.js";
import { GitWorktreeError } from "../repos/index.js";
import type { CleanupPolicy } from "./cleanup-policy.js";
import { WorktreeCleanupError } from "./workspace-errors.js";

export interface CleanupWorktreeRequest {
  readonly repoPath: string;
  readonly worktreePath: string;
  readonly policy: CleanupPolicy;
  readonly reviewSucceeded: boolean;
}

export interface CleanupWorktreeDeps {
  readonly git: GitPort;
}

export interface CleanupWorktreeResult {
  readonly removed: boolean;
  readonly reason:
    | "policy-always"
    | "policy-on-success"
    | "policy-keep"
    | "review-failed";
}

export async function cleanupWorktree(
  request: CleanupWorktreeRequest,
  deps: CleanupWorktreeDeps,
): Promise<CleanupWorktreeResult> {
  if (request.policy === "keep") {
    return { removed: false, reason: "policy-keep" };
  }

  if (request.policy === "on-success" && !request.reviewSucceeded) {
    return { removed: false, reason: "review-failed" };
  }

  try {
    await deps.git.worktreeRemove({
      repoPath: request.repoPath,
      worktreePath: request.worktreePath,
    });
  } catch (error) {
    if (error instanceof GitWorktreeError) {
      throw new WorktreeCleanupError(
        `Failed to remove worktree "${request.worktreePath}"`,
        { cause: error },
      );
    }
    throw error;
  }

  const reason =
    request.policy === "always" ? "policy-always" : "policy-on-success";
  return { removed: true, reason };
}
