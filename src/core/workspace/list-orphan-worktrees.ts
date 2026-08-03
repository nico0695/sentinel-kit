/**
 * Core module: workspace — use case `listOrphanWorktrees`.
 *
 * Lists worktrees under the managed worktrees directory that are NOT
 * tracked by any active review run. Callers supply the set of paths
 * considered active; everything else under `worktreesDir` is orphaned.
 * `GitWorktreeError` propagates unwrapped — there is no domain-level
 * translation for list failures here.
 */

import type { GitPort } from "../repos/index.js";

export interface OrphanWorktreeInfo {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
}

export interface ListOrphanWorktreesRequest {
  readonly repoPath: string;
}

export interface ListOrphanWorktreesDeps {
  readonly git: GitPort;
  readonly worktreesDir: string;
  readonly activeWorktreePaths: ReadonlySet<string>;
}

export interface ListOrphanWorktreesResult {
  readonly orphans: readonly OrphanWorktreeInfo[];
}

export async function listOrphanWorktrees(
  request: ListOrphanWorktreesRequest,
  deps: ListOrphanWorktreesDeps,
): Promise<ListOrphanWorktreesResult> {
  const worktrees = await deps.git.worktreeList(request.repoPath);

  const orphans: OrphanWorktreeInfo[] = [];

  for (const wt of worktrees) {
    if (
      wt.path.startsWith(`${deps.worktreesDir}/`) &&
      !deps.activeWorktreePaths.has(wt.path)
    ) {
      orphans.push({
        path: wt.path,
        head: wt.head === "" ? null : wt.head,
        branch: wt.branch,
      });
    }
  }

  return { orphans };
}
