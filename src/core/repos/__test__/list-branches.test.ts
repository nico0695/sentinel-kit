import { beforeEach, describe, expect, it } from "vitest";
import {
  BranchListError,
  type BranchRef,
  type ConfigStore,
  type FetchRequest,
  GitCommandError,
  GitFetchError,
  type GitPort,
  type GlobalConfig,
  type ListBranchesDeps,
  listBranches,
  RepoNotFoundError,
  type RepoRegistry,
} from "../index.js";

function createFakeConfigStore(
  initial?: RepoRegistry,
): ConfigStore & { repos: RepoRegistry } {
  const state = {
    repos: (initial ?? {}) as RepoRegistry,
    config: {
      defaultEngine: "claude-code",
      defaultBaseBranch: "main",
    } as GlobalConfig,
  };
  return {
    get repos() {
      return state.repos;
    },
    async readConfig() {
      return state.config;
    },
    async writeConfig(c: GlobalConfig) {
      state.config = c;
    },
    async readRepos() {
      return state.repos;
    },
    async writeRepos(r: RepoRegistry) {
      state.repos = r;
    },
  };
}

const DEFAULT_BRANCHES: readonly BranchRef[] = [
  { name: "main", kind: "local" },
  { name: "main", kind: "remote", remote: "origin" },
  { name: "feature/x", kind: "remote", remote: "origin" },
];

function createFakeGitPort(opts?: {
  branchesResult?: readonly BranchRef[];
  fetchError?: Error;
  branchesError?: Error;
}): GitPort & {
  fetchCalls: FetchRequest[];
  branchesCalls: string[];
  callOrder: string[];
} {
  const fetchCalls: FetchRequest[] = [];
  const branchesCalls: string[] = [];
  const callOrder: string[] = [];
  const notImplemented = () => {
    throw new Error("not implemented");
  };

  return {
    fetchCalls,
    branchesCalls,
    callOrder,
    async fetch(req: FetchRequest) {
      callOrder.push("fetch");
      if (opts?.fetchError) throw opts.fetchError;
      fetchCalls.push(req);
    },
    async branches(repoPath: string) {
      callOrder.push("branches");
      if (opts?.branchesError) throw opts.branchesError;
      branchesCalls.push(repoPath);
      return opts?.branchesResult ?? DEFAULT_BRANCHES;
    },
    clone: notImplemented as GitPort["clone"],
    defaultBranch: notImplemented as GitPort["defaultBranch"],
    worktreeAdd: notImplemented as GitPort["worktreeAdd"],
    worktreeRemove: notImplemented as GitPort["worktreeRemove"],
    worktreeList: notImplemented as GitPort["worktreeList"],
    mergeBase: notImplemented as GitPort["mergeBase"],
    diff: notImplemented as GitPort["diff"],
  };
}

const CLONES_DIR = "/sentinel/clones";
const TEST_ALIAS = "test-owner/test-repo";

describe("listBranches", () => {
  let git: ReturnType<typeof createFakeGitPort>;
  let config: ReturnType<typeof createFakeConfigStore>;
  let deps: ListBranchesDeps;

  beforeEach(() => {
    git = createFakeGitPort();
    config = createFakeConfigStore({
      [TEST_ALIAS]: { url: "https://github.com/test-owner/test-repo" },
    } as RepoRegistry);
    deps = { git, config, clonesDir: CLONES_DIR };
  });

  it("fetches and returns branches for registered repo", async () => {
    const result = await listBranches({ alias: TEST_ALIAS }, deps);

    expect(result.alias).toBe(TEST_ALIAS);
    expect(result.branches).toEqual(DEFAULT_BRANCHES);
    expect(git.fetchCalls).toHaveLength(1);
    expect(git.fetchCalls[0]?.repoPath).toBe(
      "/sentinel/clones/test-owner/test-repo",
    );
    expect(git.branchesCalls).toHaveLength(1);
    expect(git.branchesCalls[0]).toBe("/sentinel/clones/test-owner/test-repo");
  });

  it("uses entry.localPath when available instead of clonesDir", async () => {
    config = createFakeConfigStore({
      [TEST_ALIAS]: {
        url: "https://github.com/test-owner/test-repo",
        localPath: "/custom/local/repo",
      },
    } as RepoRegistry);
    deps = { git, config, clonesDir: CLONES_DIR };

    const result = await listBranches({ alias: TEST_ALIAS }, deps);

    expect(result.branches).toEqual(DEFAULT_BRANCHES);
    expect(git.fetchCalls[0]?.repoPath).toBe("/custom/local/repo");
    expect(git.branchesCalls[0]).toBe("/custom/local/repo");
  });

  it("throws RepoNotFoundError for unknown alias", async () => {
    await expect(listBranches({ alias: "unknown/repo" }, deps)).rejects.toThrow(
      RepoNotFoundError,
    );

    try {
      await listBranches({ alias: "unknown/repo" }, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(RepoNotFoundError);
      expect((error as RepoNotFoundError).message).toBe(
        "Repository not found: unknown/repo",
      );
    }
  });

  it("wraps GitFetchError in BranchListError", async () => {
    const fetchError = new GitFetchError("network down");
    git = createFakeGitPort({ fetchError });
    deps = { git, config, clonesDir: CLONES_DIR };

    await expect(listBranches({ alias: TEST_ALIAS }, deps)).rejects.toThrow(
      BranchListError,
    );

    try {
      await listBranches({ alias: TEST_ALIAS }, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(BranchListError);
      expect((error as BranchListError).cause).toBeInstanceOf(GitFetchError);
    }
  });

  it("wraps GitCommandError from branches() in BranchListError", async () => {
    const branchesError = new GitCommandError("not a git repo");
    git = createFakeGitPort({ branchesError });
    deps = { git, config, clonesDir: CLONES_DIR };

    await expect(listBranches({ alias: TEST_ALIAS }, deps)).rejects.toThrow(
      BranchListError,
    );

    try {
      await listBranches({ alias: TEST_ALIAS }, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(BranchListError);
      expect((error as BranchListError).cause).toBeInstanceOf(GitCommandError);
    }
  });

  it("calls fetch before branches", async () => {
    await listBranches({ alias: TEST_ALIAS }, deps);

    expect(git.callOrder).toEqual(["fetch", "branches"]);
  });
});
