/**
 * Shared, adapter-agnostic `GitPort` contract suite (setup §5.4).
 *
 * Parameterized over a harness of scenario factories so every `GitPort`
 * implementation reuses it verbatim (the `git-cli` adapter today; a mock
 * adapter or a future engine-specific wrapper tomorrow). This file imports
 * ONLY vitest + core port TYPES and core error classes — never any
 * concrete adapter (mirrors the ReviewEngine.contract pattern).
 *
 * Rejection is asserted as `instanceof <specific GitError subclass>` (and,
 * for the never-bare-Error rule, `instanceof GitError`) so a future typed
 * child still satisfies the contract.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GitCloneError,
  GitCommandError,
  GitDiffError,
  GitError,
  GitFetchError,
  GitMergeBaseError,
  GitNoDefaultBranchError,
  type GitPort,
  GitWorktreeError,
} from "../../../../core/repos/index.js";

export interface GitFixture {
  /** Absolute path to the primary bare remote. */
  readonly barePath: string;
  /** Absolute path to a SECOND bare remote whose default branch differs. */
  readonly upstreamBarePath: string;
  /** Remote name added to `clonePath` pointing at `upstreamBarePath`. */
  readonly upstreamRemoteName: string;
  /** Default branch of `upstreamBarePath` (must differ from `defaultBranch`). */
  readonly upstreamDefaultBranch: string;
  /** Absolute path to a working clone of `barePath` with `upstream` added. */
  readonly clonePath: string;
  /** Absolute path to a git repo with no remote HEAD (empty repo). */
  readonly emptyRepoPath: string;
  /** Absolute path to an existing directory that is NOT a git repo. */
  readonly nonRepoPath: string;
  /** Default branch of `barePath`, e.g. `main`. */
  readonly defaultBranch: string;
  /** A branch that exists only locally on `clonePath`. */
  readonly localOnlyBranch: string;
  /** A branch that exists both locally and as `origin/<name>`. */
  readonly pushedBranch: string;
  /**
   * Append a new commit to `barePath` via a throwaway working clone and
   * return the resulting commit SHA (used by the fetch test).
   */
  readonly addCommitToBare: () => Promise<string>;
  /** Branch forked from main with file additions (for diff testing). */
  readonly featureBranch: string;
  /** SHA of the fork point (common ancestor of main and featureBranch). */
  readonly forkPointSha: string;
  /** Number of files changed on featureBranch since fork point. */
  readonly featureBranchChangedFiles: number;
}

export interface GitPortContractHarness {
  /** Build the port under test. Called ONCE per test. */
  readonly build: () => GitPort;
  /** Provision a fresh, hermetic fixture. Called in `beforeEach`. */
  readonly setupFixture: () => Promise<GitFixture>;
  /** Clean up the fixture. Called in `afterEach`. */
  readonly teardownFixture: (fixture: GitFixture) => Promise<void>;
}

export function gitPortContract(
  harness: GitPortContractHarness,
  label?: string,
): void {
  describe(`GitPort contract${label ? `: ${label}` : ""}`, () => {
    let git: GitPort;
    let fixture: GitFixture;

    beforeEach(async () => {
      git = harness.build();
      fixture = await harness.setupFixture();
    });
    afterEach(async () => {
      await harness.teardownFixture(fixture);
    });

    // -------------------------------------------------------------------
    // clone
    // -------------------------------------------------------------------

    describe("clone", () => {
      it("clones a bare repo into an absolute target path", async () => {
        const target = `${fixture.clonePath}-clone-ok`;
        await git.clone({ url: fixture.barePath, targetPath: target });
        // Verify by listing branches on the freshly cloned working copy.
        const refs = await git.branches(target);
        expect(refs.some((r) => r.kind === "local")).toBe(true);
      });

      it("rejects a relative targetPath with GitCloneError (no spawn)", async () => {
        const rejection = git.clone({
          url: fixture.barePath,
          targetPath: "relative/path",
        });
        await expect(rejection).rejects.toBeInstanceOf(GitCloneError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
      });

      it("wraps a bad URL failure as GitCloneError with preserved cause", async () => {
        const rejection = git.clone({
          url: `${fixture.nonRepoPath}/does-not-exist`,
          targetPath: `${fixture.clonePath}-clone-bad`,
        });
        await expect(rejection).rejects.toBeInstanceOf(GitCloneError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          expect(err).toBeInstanceOf(GitCloneError);
          const gitErr = err as GitCloneError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // fetch
    // -------------------------------------------------------------------

    describe("fetch", () => {
      it("picks up a new commit pushed to bare", async () => {
        const sha = await fixture.addCommitToBare();
        await git.fetch({ repoPath: fixture.clonePath });
        const refs = await git.branches(fixture.clonePath);
        expect(
          refs.some(
            (r) =>
              r.kind === "remote" &&
              r.name === `origin/${fixture.defaultBranch}`,
          ),
        ).toBe(true);
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
      });

      it("uses the configured remote (fetches upstream)", async () => {
        await git.fetch({
          repoPath: fixture.clonePath,
          options: { remote: fixture.upstreamRemoteName },
        });
        const refs = await git.branches(fixture.clonePath);
        expect(
          refs.some(
            (r) =>
              r.kind === "remote" &&
              r.remote === fixture.upstreamRemoteName &&
              r.name ===
                `${fixture.upstreamRemoteName}/${fixture.upstreamDefaultBranch}`,
          ),
        ).toBe(true);
      });

      it("wraps an unknown remote as GitFetchError with preserved cause", async () => {
        const rejection = git.fetch({
          repoPath: fixture.clonePath,
          options: { remote: "does-not-exist" },
        });
        await expect(rejection).rejects.toBeInstanceOf(GitFetchError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitFetchError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // branches
    // -------------------------------------------------------------------

    describe("branches", () => {
      it("returns tagged local + remote refs (HEAD symbolic ref excluded)", async () => {
        const refs = await git.branches(fixture.clonePath);

        // Local: `defaultBranch`, `localOnlyBranch`, `pushedBranch` all present.
        expect(refs).toEqual(
          expect.arrayContaining([
            { name: fixture.defaultBranch, kind: "local" },
            { name: fixture.localOnlyBranch, kind: "local" },
            { name: fixture.pushedBranch, kind: "local" },
          ]),
        );

        // Remote: origin/<default> and origin/<pushed> present.
        expect(refs).toEqual(
          expect.arrayContaining([
            {
              name: `origin/${fixture.defaultBranch}`,
              kind: "remote",
              remote: "origin",
            },
            {
              name: `origin/${fixture.pushedBranch}`,
              kind: "remote",
              remote: "origin",
            },
          ]),
        );

        // The `origin/HEAD` symbolic ref must be filtered out.
        expect(refs.some((r) => r.name === "origin/HEAD")).toBe(false);
      });

      it("returns a stable order across repeated calls (same input)", async () => {
        const a = await git.branches(fixture.clonePath);
        const b = await git.branches(fixture.clonePath);
        expect(b).toEqual(a);
      });

      it("wraps a non-repo path as GitCommandError with preserved cause", async () => {
        const rejection = git.branches(fixture.nonRepoPath);
        await expect(rejection).rejects.toBeInstanceOf(GitCommandError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitCommandError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // defaultBranch
    // -------------------------------------------------------------------

    describe("defaultBranch", () => {
      it("returns the short name for the default remote", async () => {
        const name = await git.defaultBranch({ repoPath: fixture.clonePath });
        expect(name).toBe(fixture.defaultBranch);
      });

      it("targets refs/remotes/<remote>/HEAD when remote is provided", async () => {
        const name = await git.defaultBranch({
          repoPath: fixture.clonePath,
          remote: fixture.upstreamRemoteName,
        });
        expect(name).toBe(fixture.upstreamDefaultBranch);
      });

      it("rejects with GitNoDefaultBranchError when HEAD is unset", async () => {
        const rejection = git.defaultBranch({
          repoPath: fixture.emptyRepoPath,
        });
        await expect(rejection).rejects.toBeInstanceOf(GitNoDefaultBranchError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        // Expected outcome, not a bug: cause MUST NOT be set (design §Error
        // translation table).
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitNoDefaultBranchError;
          expect(gitErr.cause).toBeUndefined();
        });
      });

      it("wraps a non-repo path as GitCommandError with preserved cause", async () => {
        const rejection = git.defaultBranch({ repoPath: fixture.nonRepoPath });
        await expect(rejection).rejects.toBeInstanceOf(GitCommandError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitCommandError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // worktreeAdd
    // -------------------------------------------------------------------

    describe("worktreeAdd", () => {
      it("creates a worktree at absolute path; worktreeList includes it (AC-1)", async () => {
        const wtPath = `${fixture.clonePath}-wt-ok`;
        await git.worktreeAdd({
          repoPath: fixture.clonePath,
          targetPath: wtPath,
          commitish: fixture.defaultBranch,
        });
        const list = await git.worktreeList(fixture.clonePath);
        const entry = list.find((w) => w.path === wtPath);
        expect(entry).toBeDefined();
        expect(entry?.head).toMatch(/^[0-9a-f]{40}$/);
      });

      it("rejects relative path with GitWorktreeError, no cause (AC-2)", async () => {
        const rejection = git.worktreeAdd({
          repoPath: fixture.clonePath,
          targetPath: "relative/path",
          commitish: fixture.defaultBranch,
        });
        await expect(rejection).rejects.toBeInstanceOf(GitWorktreeError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitWorktreeError;
          expect(gitErr.cause).toBeUndefined();
        });
      });

      it("wraps bad commitish as GitWorktreeError with cause", async () => {
        const rejection = git.worktreeAdd({
          repoPath: fixture.clonePath,
          targetPath: `${fixture.clonePath}-wt-bad`,
          commitish: "does-not-exist-ref",
        });
        await expect(rejection).rejects.toBeInstanceOf(GitWorktreeError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitWorktreeError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // worktreeRemove
    // -------------------------------------------------------------------

    describe("worktreeRemove", () => {
      it("removes a worktree; worktreeList no longer includes it (AC-3)", async () => {
        const wtPath = `${fixture.clonePath}-wt-rm`;
        await git.worktreeAdd({
          repoPath: fixture.clonePath,
          targetPath: wtPath,
          commitish: fixture.defaultBranch,
        });
        await git.worktreeRemove({
          repoPath: fixture.clonePath,
          worktreePath: wtPath,
        });
        const list = await git.worktreeList(fixture.clonePath);
        expect(list.find((w) => w.path === wtPath)).toBeUndefined();
      });

      it("wraps non-existent path as GitWorktreeError with cause", async () => {
        const rejection = git.worktreeRemove({
          repoPath: fixture.clonePath,
          worktreePath: `${fixture.clonePath}-wt-nonexistent`,
        });
        await expect(rejection).rejects.toBeInstanceOf(GitWorktreeError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitWorktreeError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // worktreeList
    // -------------------------------------------------------------------

    describe("worktreeList", () => {
      it("returns WorktreeInfo[] with main worktree always present (AC-4)", async () => {
        const list = await git.worktreeList(fixture.clonePath);
        expect(list.length).toBeGreaterThanOrEqual(1);
        const main = list[0];
        expect(main).toBeDefined();
        expect(main?.path).toBe(fixture.clonePath);
        expect(main?.head).toMatch(/^[0-9a-f]{40}$/);
      });

      it("wraps non-repo path as GitWorktreeError with cause", async () => {
        const rejection = git.worktreeList(fixture.nonRepoPath);
        await expect(rejection).rejects.toBeInstanceOf(GitWorktreeError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitWorktreeError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // mergeBase
    // -------------------------------------------------------------------

    describe("mergeBase", () => {
      it("returns 40-hex SHA for two valid refs (AC-5)", async () => {
        const sha = await git.mergeBase({
          repoPath: fixture.clonePath,
          commitA: `origin/${fixture.defaultBranch}`,
          commitB: `origin/${fixture.featureBranch}`,
        });
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
        expect(sha).toBe(fixture.forkPointSha);
      });

      it("wraps unresolvable ref as GitMergeBaseError with cause", async () => {
        const rejection = git.mergeBase({
          repoPath: fixture.clonePath,
          commitA: fixture.defaultBranch,
          commitB: "does-not-exist-ref",
        });
        await expect(rejection).rejects.toBeInstanceOf(GitMergeBaseError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitMergeBaseError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // diff
    // -------------------------------------------------------------------

    describe("diff", () => {
      it("returns DiffResult with raw and stats (AC-6)", async () => {
        const base = fixture.forkPointSha;
        const result = await git.diff({
          repoPath: fixture.clonePath,
          from: base,
          to: `origin/${fixture.featureBranch}`,
        });
        expect(result.raw).toContain("diff --git");
        expect(result.stats.length).toBe(fixture.featureBranchChangedFiles);
        for (const s of result.stats) {
          expect(s.path).toBeTruthy();
          expect(typeof s.additions).toBe("number");
          expect(typeof s.deletions).toBe("number");
        }
      });

      it("identical refs return empty raw and empty stats (AC-7)", async () => {
        const head = `origin/${fixture.defaultBranch}`;
        const result = await git.diff({
          repoPath: fixture.clonePath,
          from: head,
          to: head,
        });
        expect(result.raw).toBe("");
        expect(result.stats).toEqual([]);
      });

      it("PR-semantics: diff(mergeBase(base, target), target) shows only target changes (AC-8)", async () => {
        const base = await git.mergeBase({
          repoPath: fixture.clonePath,
          commitA: `origin/${fixture.defaultBranch}`,
          commitB: `origin/${fixture.featureBranch}`,
        });
        const result = await git.diff({
          repoPath: fixture.clonePath,
          from: base,
          to: `origin/${fixture.featureBranch}`,
        });
        expect(result.stats.length).toBe(fixture.featureBranchChangedFiles);
        const paths = result.stats.map((s) => s.path);
        expect(paths).toContain("file-a.txt");
        expect(paths).toContain("file-b.txt");
        expect(paths).not.toContain("file-c.txt");
      });

      it("wraps unresolvable ref as GitDiffError with cause", async () => {
        const rejection = git.diff({
          repoPath: fixture.clonePath,
          from: fixture.defaultBranch,
          to: "does-not-exist-ref",
        });
        await expect(rejection).rejects.toBeInstanceOf(GitDiffError);
        await expect(rejection).rejects.toBeInstanceOf(GitError);
        await rejection.catch((err: unknown) => {
          const gitErr = err as GitDiffError;
          expect(gitErr.cause).toBeInstanceOf(Error);
        });
      });
    });

    // -------------------------------------------------------------------
    // error hierarchy (AC-9)
    // -------------------------------------------------------------------

    describe("error hierarchy (AC-9)", () => {
      it("all three new errors extend GitError", () => {
        const wt = new GitWorktreeError("test");
        const mb = new GitMergeBaseError("test");
        const df = new GitDiffError("test");

        expect(wt).toBeInstanceOf(GitError);
        expect(wt).toBeInstanceOf(GitWorktreeError);

        expect(mb).toBeInstanceOf(GitError);
        expect(mb).toBeInstanceOf(GitMergeBaseError);

        expect(df).toBeInstanceOf(GitError);
        expect(df).toBeInstanceOf(GitDiffError);
      });
    });
  });
}
