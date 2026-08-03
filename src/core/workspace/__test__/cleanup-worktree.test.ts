import { describe, expect, it } from "vitest";
import { GitWorktreeError } from "../../repos/index.js";
import {
  type CleanupWorktreeDeps,
  cleanupWorktree,
  WorktreeCleanupError,
} from "../index.js";
import { createFakeGitPort } from "./workspace-git-fake.js";

const REPO_PATH = "/sentinel/clones/owner/my-repo";
const WORKTREE_PATH = "/sentinel/worktrees/my-repo/feature-login-1700000000000";

function makeDeps(
  overrides?: Partial<CleanupWorktreeDeps>,
): CleanupWorktreeDeps {
  return {
    git: createFakeGitPort(),
    ...overrides,
  };
}

describe("cleanupWorktree", () => {
  it("removes worktree when policy is 'always' and review succeeded", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "always",
        reviewSucceeded: true,
      },
      deps,
    );

    expect(result.removed).toBe(true);
    expect(result.reason).toBe("policy-always");
    expect(git.removeCalls).toHaveLength(1);
    expect(git.removeCalls[0]?.worktreePath).toBe(WORKTREE_PATH);
  });

  it("removes worktree when policy is 'always' and review failed", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "always",
        reviewSucceeded: false,
      },
      deps,
    );

    expect(result.removed).toBe(true);
    expect(result.reason).toBe("policy-always");
    expect(git.removeCalls).toHaveLength(1);
  });

  it("removes worktree when policy is 'on-success' and review succeeded", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "on-success",
        reviewSucceeded: true,
      },
      deps,
    );

    expect(result.removed).toBe(true);
    expect(result.reason).toBe("policy-on-success");
    expect(git.removeCalls).toHaveLength(1);
  });

  it("skips removal when policy is 'on-success' and review failed", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "on-success",
        reviewSucceeded: false,
      },
      deps,
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe("review-failed");
    expect(git.removeCalls).toHaveLength(0);
  });

  it("skips removal when policy is 'keep' and review succeeded", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "keep",
        reviewSucceeded: true,
      },
      deps,
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe("policy-keep");
    expect(git.removeCalls).toHaveLength(0);
  });

  it("skips removal when policy is 'keep' and review failed", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await cleanupWorktree(
      {
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        policy: "keep",
        reviewSucceeded: false,
      },
      deps,
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe("policy-keep");
    expect(git.removeCalls).toHaveLength(0);
  });

  it("wraps GitWorktreeError in WorktreeCleanupError", async () => {
    const gitError = new GitWorktreeError("remove failed");
    const git = createFakeGitPort({ removeError: gitError });
    const deps = makeDeps({ git });

    await expect(
      cleanupWorktree(
        {
          repoPath: REPO_PATH,
          worktreePath: WORKTREE_PATH,
          policy: "always",
          reviewSucceeded: true,
        },
        deps,
      ),
    ).rejects.toThrow(WorktreeCleanupError);

    try {
      await cleanupWorktree(
        {
          repoPath: REPO_PATH,
          worktreePath: WORKTREE_PATH,
          policy: "always",
          reviewSucceeded: true,
        },
        deps,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(WorktreeCleanupError);
      expect((error as WorktreeCleanupError).cause).toBeInstanceOf(
        GitWorktreeError,
      );
    }
  });

  it("rethrows non-GitWorktreeError without wrapping", async () => {
    const unexpected = new TypeError("unexpected");
    const git = createFakeGitPort({ removeError: unexpected });
    const deps = makeDeps({ git });

    await expect(
      cleanupWorktree(
        {
          repoPath: REPO_PATH,
          worktreePath: WORKTREE_PATH,
          policy: "always",
          reviewSucceeded: true,
        },
        deps,
      ),
    ).rejects.toThrow(TypeError);
  });
});
