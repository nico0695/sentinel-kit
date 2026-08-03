/**
 * Core module: workspace — use case `createReviewWorktree`.
 *
 * Creates an ephemeral git worktree for a single code review (PRD §5.1).
 * The worktree path is derived deterministically from the repo basename,
 * sanitized branch label, and a timestamp to avoid collisions across
 * concurrent reviews.
 */

import type { GitPort } from "../repos/index.js";
import { GitWorktreeError } from "../repos/index.js";
import { deriveWorktreePath } from "./helpers.js";
import {
  InvalidWorktreeRequestError,
  WorktreeCreationError,
} from "./workspace-errors.js";

export interface CreateReviewWorktreeRequest {
  readonly repoPath: string;
  readonly commitish: string;
  readonly branchLabel: string;
}

export interface CreateReviewWorktreeDeps {
  readonly git: GitPort;
  readonly worktreesDir: string;
  readonly now?: () => number;
}

export interface ReviewWorktreeResult {
  readonly path: string;
}

export async function createReviewWorktree(
  request: CreateReviewWorktreeRequest,
  deps: CreateReviewWorktreeDeps,
): Promise<ReviewWorktreeResult> {
  if (request.repoPath === "") {
    throw new InvalidWorktreeRequestError("repoPath must not be empty");
  }
  if (!request.repoPath.startsWith("/")) {
    throw new InvalidWorktreeRequestError("repoPath must be an absolute path");
  }
  if (request.commitish === "") {
    throw new InvalidWorktreeRequestError("commitish must not be empty");
  }
  if (request.branchLabel === "") {
    throw new InvalidWorktreeRequestError("branchLabel must not be empty");
  }
  if (deps.worktreesDir === "") {
    throw new InvalidWorktreeRequestError("worktreesDir must not be empty");
  }
  if (!deps.worktreesDir.startsWith("/")) {
    throw new InvalidWorktreeRequestError(
      "worktreesDir must be an absolute path",
    );
  }

  const timestamp = (deps.now ?? Date.now)();
  const targetPath = deriveWorktreePath(
    deps.worktreesDir,
    request.repoPath,
    request.branchLabel,
    timestamp,
  );

  try {
    await deps.git.worktreeAdd({
      repoPath: request.repoPath,
      targetPath,
      commitish: request.commitish,
    });
  } catch (error) {
    if (error instanceof GitWorktreeError) {
      throw new WorktreeCreationError(
        `Failed to create worktree for "${request.branchLabel}"`,
        { cause: error },
      );
    }
    throw error;
  }

  return { path: targetPath };
}
