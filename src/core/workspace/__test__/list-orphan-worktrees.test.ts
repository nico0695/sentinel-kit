import { describe, expect, it } from "vitest";
import { GitWorktreeError } from "../../repos/index.js";
import { type ListOrphanWorktreesDeps, listOrphanWorktrees } from "../index.js";
import { createFakeGitPort } from "./workspace-git-fake.js";

const REPO_PATH = "/sentinel/clones/owner/my-repo";
const WORKTREES_DIR = "/sentinel/worktrees";

function makeDeps(
  overrides?: Partial<ListOrphanWorktreesDeps>,
): ListOrphanWorktreesDeps {
  return {
    git: createFakeGitPort(),
    worktreesDir: WORKTREES_DIR,
    activeWorktreePaths: new Set(),
    ...overrides,
  };
}

describe("listOrphanWorktrees", () => {
  it("returns empty when no worktrees exist under worktreesDir", async () => {
    const deps = makeDeps();

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toEqual([]);
  });

  it("identifies orphan worktrees under worktreesDir", async () => {
    const orphanPath = "/sentinel/worktrees/my-repo/feature-x-123";
    const git = createFakeGitPort({
      initialWorktrees: new Map([
        [orphanPath, { head: "abc123", branch: "refs/heads/feature-x" }],
      ]),
    });
    const deps = makeDeps({ git });

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.path).toBe(orphanPath);
    expect(result.orphans[0]?.head).toBe("abc123");
    expect(result.orphans[0]?.branch).toBe("refs/heads/feature-x");
  });

  it("excludes active worktree paths from orphans", async () => {
    const activePath = "/sentinel/worktrees/my-repo/feature-x-123";
    const orphanPath = "/sentinel/worktrees/my-repo/feature-y-456";
    const git = createFakeGitPort({
      initialWorktrees: new Map([
        [activePath, { head: "abc123", branch: null }],
        [orphanPath, { head: "def456", branch: null }],
      ]),
    });
    const deps = makeDeps({
      git,
      activeWorktreePaths: new Set([activePath]),
    });

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.path).toBe(orphanPath);
  });

  it("excludes worktrees outside worktreesDir", async () => {
    const outsidePath = "/other/location/my-repo/feature-z-789";
    const git = createFakeGitPort({
      initialWorktrees: new Map([
        [outsidePath, { head: "abc123", branch: null }],
      ]),
    });
    const deps = makeDeps({ git });

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toEqual([]);
  });

  it("excludes worktrees whose path shares a prefix but is not a child", async () => {
    const siblingPath = "/sentinel/worktrees-backup/my-repo/feature-x-123";
    const git = createFakeGitPort({
      initialWorktrees: new Map([
        [siblingPath, { head: "abc123", branch: null }],
      ]),
    });
    const deps = makeDeps({ git });

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toEqual([]);
  });

  it("excludes the main worktree from orphans", async () => {
    // The fake always prepends the main worktree (at REPO_PATH).
    // It should be excluded because it does not start with worktreesDir.
    const deps = makeDeps();

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toEqual([]);
  });

  it("maps empty head string to null", async () => {
    const orphanPath = "/sentinel/worktrees/my-repo/feature-x-123";
    const git = createFakeGitPort({
      initialWorktrees: new Map([[orphanPath, { head: "", branch: null }]]),
    });
    const deps = makeDeps({ git });

    const result = await listOrphanWorktrees({ repoPath: REPO_PATH }, deps);

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.head).toBeNull();
  });

  it("propagates GitWorktreeError unwrapped", async () => {
    const git = createFakeGitPort({
      listError: new GitWorktreeError("list failed"),
    });
    const deps = makeDeps({ git });

    await expect(
      listOrphanWorktrees({ repoPath: REPO_PATH }, deps),
    ).rejects.toThrow(GitWorktreeError);
  });
});
