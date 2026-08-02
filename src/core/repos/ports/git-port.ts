/**
 * Core module: repos — driven port `GitPort` (PRD §4.3).
 *
 * Thin domain contract for source-control operations the review flow needs.
 * H1: clone, fetch, branches, defaultBranch.
 * H2: worktreeAdd/Remove/List, mergeBase, diff.
 * Adapters live under `src/adapters/driven/git/*`; the core never spawns
 * a process.
 */

/** clone(url, targetPath) — `targetPath` must be ABSOLUTE (dec-004). */
export interface CloneRequest {
  readonly url: string;
  readonly targetPath: string;
}

/** fetch(repoPath, options?) — `options.remote` defaults to `origin` (dec-005). */
export interface FetchRequest {
  readonly repoPath: string;
  readonly options?: FetchOptions;
}

export interface FetchOptions {
  readonly remote?: string;
}

/**
 * A branch reference in a local repo, tagged by origin so downstream
 * consumers (H2 merge-base needs local; H3 listBranches needs remote) share
 * one shape without new methods (dec-002).
 */
export interface BranchRef {
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly remote?: string;
}

/** defaultBranch(repoPath, remote?) — remote defaults to `origin` (dec-003). */
export interface DefaultBranchRequest {
  readonly repoPath: string;
  readonly remote?: string;
}

/** worktreeAdd(request) — targetPath must be ABSOLUTE (dec-a1). */
export interface WorktreeAddRequest {
  readonly repoPath: string;
  readonly targetPath: string;
  readonly commitish: string;
}

/** worktreeRemove(request) — callers should supply an absolute worktreePath (dec-a1). */
export interface WorktreeRemoveRequest {
  readonly repoPath: string;
  readonly worktreePath: string;
}

/** mergeBase(request) — two commit-ish strings (dec-a2). */
export interface MergeBaseRequest {
  readonly repoPath: string;
  readonly commitA: string;
  readonly commitB: string;
}

/** diff(request) — two commit-ish, caller does merge-base separately (dec-a2). */
export interface DiffRequest {
  readonly repoPath: string;
  readonly from: string;
  readonly to: string;
}

/** Single entry from git worktree list --porcelain. */
export interface WorktreeInfo {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
}

/** Per-file change stats from diff --numstat. */
export interface FileStats {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

/** Combined diff output (dec-b3). */
export interface DiffResult {
  readonly raw: string;
  readonly stats: readonly FileStats[];
}

export interface GitPort {
  /**
   * Clone `request.url` into `request.targetPath` (absolute; dec-004).
   * Adapters reject a non-absolute `targetPath` with `GitCloneError` before
   * spawning git — the port refuses to leak layout choices back to the core.
   * Rejects with `GitCloneError` on any underlying git/network failure.
   */
  clone(request: CloneRequest): Promise<void>;

  /**
   * Fetch from `request.options.remote` (default `origin`, dec-005) in the
   * local repo at `request.repoPath`. Rejects with `GitFetchError` on any
   * underlying git failure (unknown remote, unreachable URL, auth denial).
   */
  fetch(request: FetchRequest): Promise<void>;

  /**
   * List branches in the local repo at `repoPath`. Returns BOTH local
   * (`refs/heads`) and remote (`refs/remotes`) refs in one tagged shape
   * (dec-002) so H2 (merge-base needs local refs) and H3 (listBranches
   * needs remote refs) share this port without new methods. The
   * `refs/remotes/<remote>/HEAD` symbolic entry is excluded — it is not
   * a branch. Rejects with `GitCommandError` on any git failure.
   */
  branches(repoPath: string): Promise<readonly BranchRef[]>;

  /**
   * Return the short name of the remote HEAD's branch (e.g. `main`, not
   * `origin/main`) for `request.remote` (default `origin`, dec-003) in the
   * local repo at `request.repoPath`, via `git symbolic-ref`. When HEAD is
   * not set for that remote, rejects with `GitNoDefaultBranchError` — an
   * expected domain outcome, not a bug. Any other git failure rejects with
   * `GitCommandError`.
   */
  defaultBranch(request: DefaultBranchRequest): Promise<string>;

  /**
   * Create a detached worktree at `request.targetPath` (absolute; dec-a1)
   * checked out to `request.commitish`. Adapters reject a non-absolute
   * `targetPath` with `GitWorktreeError` before spawning git.
   */
  worktreeAdd(request: WorktreeAddRequest): Promise<void>;

  /**
   * Remove the worktree at `request.worktreePath` from the repo at
   * `request.repoPath`. Uses `--force` so dirty worktrees are removed
   * without complaint (ephemeral review worktrees, PRD §5.1).
   */
  worktreeRemove(request: WorktreeRemoveRequest): Promise<void>;

  /**
   * List worktrees in the local repo at `repoPath` via
   * `git worktree list --porcelain`. Always returns at least one entry
   * (the main worktree). Rejects with `GitWorktreeError` on any git failure.
   */
  worktreeList(repoPath: string): Promise<readonly WorktreeInfo[]>;

  /**
   * Return the merge-base commit SHA (40-hex) of `request.commitA` and
   * `request.commitB` in the local repo at `request.repoPath`.
   * Rejects with `GitMergeBaseError` if either ref is unresolvable.
   */
  mergeBase(request: MergeBaseRequest): Promise<string>;

  /**
   * Produce a unified diff between `request.from` and `request.to` in the
   * local repo at `request.repoPath`. Returns `{ raw, stats }` where `raw`
   * is the full unified diff text and `stats` is per-file add/delete counts
   * from `--numstat` (dec-b3). Empty diff returns empty `raw` and empty
   * `stats`. Rejects with `GitDiffError` on any git failure.
   */
  diff(request: DiffRequest): Promise<DiffResult>;
}
