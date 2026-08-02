/**
 * Core module: repos — repo registration and configuration (PRD §4.2).
 *
 * Public API (types only in H1): the `GitPort` driven port + its invocation
 * types (dec-001), and its typed error family (dec-006). Use cases
 * (registerRepo, listRepos, listBranches) land in E2.F2.x.
 */
export type {
  BranchRef,
  CloneRequest,
  DefaultBranchRequest,
  FetchOptions,
  FetchRequest,
  GitPort,
} from "./ports/git-port.js";
export {
  GitCloneError,
  GitCommandError,
  GitError,
  type GitErrorOptions,
  GitFetchError,
  GitNoDefaultBranchError,
} from "./ports/git-port-errors.js";
