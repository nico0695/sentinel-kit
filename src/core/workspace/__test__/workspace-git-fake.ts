/**
 * Fake GitPort for workspace module tests.
 *
 * Implements only worktreeAdd/Remove/List with call tracking, error
 * injection, and in-memory worktree state. All other GitPort methods
 * throw "not implemented".
 */

import type {
  GitPort,
  WorktreeAddRequest,
  WorktreeInfo,
  WorktreeRemoveRequest,
} from "../../repos/index.js";

export interface FakeWorktreeState {
  readonly addCalls: WorktreeAddRequest[];
  readonly removeCalls: WorktreeRemoveRequest[];
  readonly listCalls: string[];
  readonly worktrees: Map<string, { head: string; branch: string | null }>;
}

export interface FakeGitPortConfig {
  readonly addError?: Error;
  readonly removeError?: Error;
  readonly listError?: Error;
  readonly initialWorktrees?: ReadonlyMap<
    string,
    { head: string; branch: string | null }
  >;
}

export function createFakeGitPort(
  config?: FakeGitPortConfig,
): GitPort & FakeWorktreeState {
  const addCalls: WorktreeAddRequest[] = [];
  const removeCalls: WorktreeRemoveRequest[] = [];
  const listCalls: string[] = [];
  const worktrees = new Map<string, { head: string; branch: string | null }>();

  if (config?.initialWorktrees !== undefined) {
    for (const [path, info] of config.initialWorktrees) {
      worktrees.set(path, info);
    }
  }

  const notImplemented = () => {
    throw new Error("not implemented");
  };

  return {
    addCalls,
    removeCalls,
    listCalls,
    worktrees,

    async worktreeAdd(req: WorktreeAddRequest) {
      addCalls.push(req);
      if (config?.addError) throw config.addError;
      worktrees.set(req.targetPath, {
        head: req.commitish,
        branch: null,
      });
    },

    async worktreeRemove(req: WorktreeRemoveRequest) {
      removeCalls.push(req);
      if (config?.removeError) throw config.removeError;
      worktrees.delete(req.worktreePath);
    },

    async worktreeList(repoPath: string): Promise<readonly WorktreeInfo[]> {
      listCalls.push(repoPath);
      if (config?.listError) throw config.listError;
      const entries: WorktreeInfo[] = [
        { path: repoPath, head: "abc123", branch: "refs/heads/main" },
      ];
      for (const [path, info] of worktrees) {
        entries.push({ path, head: info.head, branch: info.branch });
      }
      return entries;
    },

    clone: notImplemented as GitPort["clone"],
    fetch: notImplemented as GitPort["fetch"],
    branches: notImplemented as GitPort["branches"],
    defaultBranch: notImplemented as GitPort["defaultBranch"],
    mergeBase: notImplemented as GitPort["mergeBase"],
    diff: notImplemented as GitPort["diff"],
  };
}
