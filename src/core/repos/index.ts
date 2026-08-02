/**
 * Core module: repos — repo registration and configuration (PRD §4.2).
 *
 * Public API: the `GitPort` and `ConfigStore` driven ports + their
 * invocation/domain types and typed error families. Use cases
 * (registerRepo, listRepos, listBranches) land in E2.F2.x.
 */

export {
  DiffLimitsSchema,
  type GlobalConfig,
  GlobalConfigSchema,
  type RepoEntry,
  RepoEntrySchema,
  type RepoRegistry,
  RepoRegistrySchema,
} from "./ports/config-schemas.js";
export type { ConfigStore } from "./ports/config-store.js";
export {
  ConfigError,
  type ConfigErrorOptions,
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
} from "./ports/config-store-errors.js";
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
