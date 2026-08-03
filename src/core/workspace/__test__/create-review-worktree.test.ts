import { describe, expect, it } from "vitest";
import { GitWorktreeError } from "../../repos/index.js";
import type { WorktreeRef } from "../../run/index.js";
import {
  type CreateReviewWorktreeDeps,
  createReviewWorktree,
  InvalidWorktreeRequestError,
  WorktreeCreationError,
} from "../index.js";
import { createFakeGitPort } from "./workspace-git-fake.js";

const WORKTREES_DIR = "/sentinel/worktrees";
const REPO_PATH = "/sentinel/clones/owner/my-repo";
const COMMITISH = "abc1234";
const BRANCH_LABEL = "feature/login";
const FIXED_TS = 1700000000000;

function makeDeps(
  overrides?: Partial<CreateReviewWorktreeDeps>,
): CreateReviewWorktreeDeps {
  return {
    git: createFakeGitPort(),
    worktreesDir: WORKTREES_DIR,
    now: () => FIXED_TS,
    ...overrides,
  };
}

describe("createReviewWorktree", () => {
  it("creates worktree at the derived path", async () => {
    const git = createFakeGitPort();
    const deps = makeDeps({ git });

    const result = await createReviewWorktree(
      { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: BRANCH_LABEL },
      deps,
    );

    expect(result.path).toBe(
      "/sentinel/worktrees/my-repo/feature-login-1700000000000",
    );
    expect(git.addCalls).toHaveLength(1);
    expect(git.addCalls[0]?.repoPath).toBe(REPO_PATH);
    expect(git.addCalls[0]?.targetPath).toBe(result.path);
    expect(git.addCalls[0]?.commitish).toBe(COMMITISH);
  });

  it("produces unique paths for different timestamps", async () => {
    let callCount = 0;
    const deps = makeDeps({ now: () => FIXED_TS + ++callCount });

    const r1 = await createReviewWorktree(
      { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: BRANCH_LABEL },
      deps,
    );
    const r2 = await createReviewWorktree(
      { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: BRANCH_LABEL },
      deps,
    );

    expect(r1.path).not.toBe(r2.path);
  });

  it("sanitizes branch label slashes into dashes", async () => {
    const deps = makeDeps();

    const result = await createReviewWorktree(
      {
        repoPath: REPO_PATH,
        commitish: COMMITISH,
        branchLabel: "feature/nested/deep",
      },
      deps,
    );

    expect(result.path).toBe(
      "/sentinel/worktrees/my-repo/feature-nested-deep-1700000000000",
    );
  });

  it("trims leading and trailing dashes from sanitized label", async () => {
    const deps = makeDeps();

    const result = await createReviewWorktree(
      {
        repoPath: REPO_PATH,
        commitish: COMMITISH,
        branchLabel: "/leading-and-trailing/",
      },
      deps,
    );

    expect(result.path).toBe(
      "/sentinel/worktrees/my-repo/leading-and-trailing-1700000000000",
    );
  });

  it("handles repo path with trailing slash", async () => {
    const deps = makeDeps();

    const result = await createReviewWorktree(
      {
        repoPath: "/sentinel/clones/owner/my-repo/",
        commitish: COMMITISH,
        branchLabel: "main",
      },
      deps,
    );

    expect(result.path).toBe("/sentinel/worktrees/my-repo/main-1700000000000");
  });

  it("uses Date.now when deps.now is not provided", async () => {
    const git = createFakeGitPort();
    const deps: CreateReviewWorktreeDeps = { git, worktreesDir: WORKTREES_DIR };

    const before = Date.now();
    const result = await createReviewWorktree(
      { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: "main" },
      deps,
    );
    const after = Date.now();

    // The path must end with a numeric timestamp in [before, after]
    const parts = result.path.split("-");
    const ts = Number(parts[parts.length - 1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("result is assignable to WorktreeRef", async () => {
    const deps = makeDeps();

    const result = await createReviewWorktree(
      { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: BRANCH_LABEL },
      deps,
    );

    // Compile-time structural compatibility check
    const _ref: WorktreeRef = result;
    expect(_ref.path).toBe(result.path);
  });

  it("rejects empty repoPath with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps();

    await expect(
      createReviewWorktree(
        { repoPath: "", commitish: COMMITISH, branchLabel: BRANCH_LABEL },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects relative repoPath with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps();

    await expect(
      createReviewWorktree(
        {
          repoPath: "relative/path",
          commitish: COMMITISH,
          branchLabel: BRANCH_LABEL,
        },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects empty commitish with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps();

    await expect(
      createReviewWorktree(
        { repoPath: REPO_PATH, commitish: "", branchLabel: BRANCH_LABEL },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects empty branchLabel with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps();

    await expect(
      createReviewWorktree(
        { repoPath: REPO_PATH, commitish: COMMITISH, branchLabel: "" },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects empty worktreesDir with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps({ worktreesDir: "" });

    await expect(
      createReviewWorktree(
        {
          repoPath: REPO_PATH,
          commitish: COMMITISH,
          branchLabel: BRANCH_LABEL,
        },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects relative worktreesDir with InvalidWorktreeRequestError", async () => {
    const deps = makeDeps({ worktreesDir: "relative/worktrees" });

    await expect(
      createReviewWorktree(
        {
          repoPath: REPO_PATH,
          commitish: COMMITISH,
          branchLabel: BRANCH_LABEL,
        },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("wraps GitWorktreeError in WorktreeCreationError", async () => {
    const gitError = new GitWorktreeError("bad ref");
    const git = createFakeGitPort({ addError: gitError });
    const deps = makeDeps({ git });

    await expect(
      createReviewWorktree(
        {
          repoPath: REPO_PATH,
          commitish: COMMITISH,
          branchLabel: BRANCH_LABEL,
        },
        deps,
      ),
    ).rejects.toThrow(WorktreeCreationError);

    try {
      await createReviewWorktree(
        {
          repoPath: REPO_PATH,
          commitish: COMMITISH,
          branchLabel: BRANCH_LABEL,
        },
        deps,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(WorktreeCreationError);
      expect((error as WorktreeCreationError).cause).toBeInstanceOf(
        GitWorktreeError,
      );
    }
  });
});
