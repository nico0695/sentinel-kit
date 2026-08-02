import { beforeEach, describe, expect, it } from "vitest";
import {
  type CloneRequest,
  type ConfigStore,
  type DefaultBranchRequest,
  GitCloneError,
  GitNoDefaultBranchError,
  type GitPort,
  type GlobalConfig,
  InvalidRepoRequestError,
  type RegisterRepoDeps,
  type RepoEntry,
  RepoRegistrationError,
  type RepoRegistry,
  registerRepo,
} from "../index.js";

function createFakeConfigStore(
  initial?: RepoRegistry,
): ConfigStore & { repos: RepoRegistry; writeReposCalled: boolean } {
  const state = {
    repos: (initial ?? {}) as RepoRegistry,
    config: {
      defaultEngine: "claude-code",
      defaultBaseBranch: "main",
    } as GlobalConfig,
    writeReposCalled: false,
  };
  return {
    get repos() {
      return state.repos;
    },
    get writeReposCalled() {
      return state.writeReposCalled;
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
      state.writeReposCalled = true;
    },
  };
}

function createFakeGitPort(opts?: {
  defaultBranchResult?: string;
  cloneError?: Error;
  defaultBranchError?: Error;
}): GitPort & {
  cloneCalls: CloneRequest[];
  defaultBranchCalls: DefaultBranchRequest[];
} {
  const cloneCalls: CloneRequest[] = [];
  const defaultBranchCalls: DefaultBranchRequest[] = [];
  const notImplemented = () => {
    throw new Error("not implemented");
  };

  return {
    cloneCalls,
    defaultBranchCalls,
    async clone(req: CloneRequest) {
      if (opts?.cloneError) throw opts.cloneError;
      cloneCalls.push(req);
    },
    async defaultBranch(req) {
      if (opts?.defaultBranchError) throw opts.defaultBranchError;
      defaultBranchCalls.push(req);
      return opts?.defaultBranchResult ?? "main";
    },
    fetch: notImplemented as GitPort["fetch"],
    branches: notImplemented as GitPort["branches"],
    worktreeAdd: notImplemented as GitPort["worktreeAdd"],
    worktreeRemove: notImplemented as GitPort["worktreeRemove"],
    worktreeList: notImplemented as GitPort["worktreeList"],
    mergeBase: notImplemented as GitPort["mergeBase"],
    diff: notImplemented as GitPort["diff"],
  };
}

const CLONES_DIR = "/sentinel/clones";
const TEST_URL = "https://github.com/test-owner/test-repo";
const TEST_ALIAS = "test-owner/test-repo";

describe("registerRepo", () => {
  let git: ReturnType<typeof createFakeGitPort>;
  let config: ReturnType<typeof createFakeConfigStore>;
  let deps: RegisterRepoDeps;

  beforeEach(() => {
    git = createFakeGitPort();
    config = createFakeConfigStore();
    deps = { git, config, clonesDir: CLONES_DIR };
  });

  it("registers repo via URL with clone and branch detection", async () => {
    const result = await registerRepo({ url: TEST_URL }, deps);

    expect(result.alias).toBe(TEST_ALIAS);
    expect(result.alreadyRegistered).toBe(false);
    expect(result.entry.url).toBe(TEST_URL);
    expect(result.entry.baseBranch).toBe("main");
    expect(git.cloneCalls.length).toBe(1);
    expect(git.cloneCalls[0]?.targetPath).toBe(
      "/sentinel/clones/test-owner/test-repo",
    );
    expect(git.defaultBranchCalls.length).toBe(1);
    expect(config.repos[TEST_ALIAS]).toBeDefined();
  });

  it("registers repo via local path without cloning", async () => {
    const result = await registerRepo(
      { url: TEST_URL, localPath: "/repos/local" },
      deps,
    );

    expect(git.cloneCalls.length).toBe(0);
    expect(git.defaultBranchCalls[0]?.repoPath).toBe("/repos/local");
    expect(result.entry.localPath).toBe("/repos/local");
  });

  it("returns existing entry when alias already registered", async () => {
    const existing: RepoEntry = { url: TEST_URL, baseBranch: "develop" };
    config = createFakeConfigStore({
      [TEST_ALIAS]: existing,
    } as RepoRegistry);
    deps = { git, config, clonesDir: CLONES_DIR };

    const result = await registerRepo({ url: TEST_URL }, deps);

    expect(result.alreadyRegistered).toBe(true);
    expect(result.entry.baseBranch).toBe("develop");
    expect(git.cloneCalls.length).toBe(0);
    expect(git.defaultBranchCalls.length).toBe(0);
    expect(config.writeReposCalled).toBe(false);
  });

  it("uses explicit baseBranch and skips detection", async () => {
    const result = await registerRepo(
      { url: TEST_URL, baseBranch: "develop" },
      deps,
    );

    expect(result.entry.baseBranch).toBe("develop");
    expect(git.defaultBranchCalls.length).toBe(0);
  });

  it("wraps clone failure in RepoRegistrationError", async () => {
    git = createFakeGitPort({
      cloneError: new GitCloneError("network error"),
    });
    deps = { git, config, clonesDir: CLONES_DIR };

    await expect(registerRepo({ url: TEST_URL }, deps)).rejects.toThrow(
      RepoRegistrationError,
    );

    try {
      await registerRepo({ url: TEST_URL }, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(RepoRegistrationError);
      expect((error as RepoRegistrationError).cause).toBeInstanceOf(
        GitCloneError,
      );
    }
  });

  it("wraps defaultBranch failure in RepoRegistrationError", async () => {
    git = createFakeGitPort({
      defaultBranchError: new GitNoDefaultBranchError("no HEAD"),
    });
    deps = { git, config, clonesDir: CLONES_DIR };

    await expect(registerRepo({ url: TEST_URL }, deps)).rejects.toThrow(
      RepoRegistrationError,
    );

    try {
      await registerRepo({ url: TEST_URL }, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(RepoRegistrationError);
      expect((error as RepoRegistrationError).cause).toBeInstanceOf(
        GitNoDefaultBranchError,
      );
    }
  });

  it("rejects empty URL with InvalidRepoRequestError", async () => {
    await expect(registerRepo({ url: "" }, deps)).rejects.toThrow(
      InvalidRepoRequestError,
    );
    await expect(registerRepo({ url: "   " }, deps)).rejects.toThrow(
      InvalidRepoRequestError,
    );
    expect(git.cloneCalls.length).toBe(0);
  });

  it("rejects relative localPath with InvalidRepoRequestError", async () => {
    await expect(
      registerRepo({ url: TEST_URL, localPath: "relative/path" }, deps),
    ).rejects.toThrow(InvalidRepoRequestError);
    expect(git.cloneCalls.length).toBe(0);
  });

  it("derives alias from various URL formats", async () => {
    const formats = [
      "https://github.com/owner/repo",
      "https://github.com/owner/repo.git",
      "git@github.com:owner/repo.git",
      "ssh://git@github.com/owner/repo",
    ];

    for (const url of formats) {
      const freshGit = createFakeGitPort();
      const freshConfig = createFakeConfigStore();
      const freshDeps: RegisterRepoDeps = {
        git: freshGit,
        config: freshConfig,
        clonesDir: CLONES_DIR,
      };

      const result = await registerRepo({ url }, freshDeps);
      expect(result.alias).toBe("owner/repo");
    }
  });
});
