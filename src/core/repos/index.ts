/**
 * Core module: repos — repo registration and configuration (PRD §4.2).
 *
 * Public API: the `GitPort` driven port + its invocation/domain types, and
 * its typed error family. Use cases (registerRepo, listRepos, listBranches)
 * land in E2.F2.x.
 */
export type {
  BranchRef,
  CloneRequest,
  DefaultBranchRequest,
  DiffRequest,
  DiffResult,
  FetchOptions,
  FetchRequest,
  FileStats,
  GitPort,
  MergeBaseRequest,
  WorktreeAddRequest,
  WorktreeInfo,
  WorktreeRemoveRequest,
} from "./ports/git-port.js";
export {
  GitCloneError,
  GitCommandError,
  GitDiffError,
  GitError,
  type GitErrorOptions,
  GitFetchError,
  GitMergeBaseError,
  GitNoDefaultBranchError,
  GitWorktreeError,
} from "./ports/git-port-errors.js";
