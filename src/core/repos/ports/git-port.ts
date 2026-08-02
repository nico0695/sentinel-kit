/**
 * Core module: repos — driven port `GitPort` (PRD §4.3).
 *
 * Thin domain contract for source-control operations the review flow needs
 * (H1 scope: clone, fetch, branches, defaultBranch). Adapters live under
 * `src/adapters/driven/git/*`; the core never spawns a process. Worktrees,
 * merge-base and diff land in H2 — this port intentionally has NO methods
 * for them yet (spec §Non-goals).
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
}
