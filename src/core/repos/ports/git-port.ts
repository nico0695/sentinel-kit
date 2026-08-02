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
  clone(request: CloneRequest): Promise<void>;
  fetch(request: FetchRequest): Promise<void>;
  branches(repoPath: string): Promise<readonly BranchRef[]>;
  defaultBranch(request: DefaultBranchRequest): Promise<string>;
}
