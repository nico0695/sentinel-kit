import { describe, expect, it } from "vitest";
import {
  type ConfigStore,
  type GlobalConfig,
  type ListReposDeps,
  listRepos,
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

describe("listRepos", () => {
  it("returns empty registry when no repos registered", async () => {
    const config = createFakeConfigStore();
    const deps: ListReposDeps = { config };

    const result = await listRepos(deps);

    expect(result.repos).toEqual({});
  });

  it("returns registry with registered repos", async () => {
    const registry: RepoRegistry = {
      "owner/repo-a": { url: "https://github.com/owner/repo-a" },
      "owner/repo-b": {
        url: "https://github.com/owner/repo-b",
        baseBranch: "develop",
      },
    };
    const config = createFakeConfigStore(registry);
    const deps: ListReposDeps = { config };

    const result = await listRepos(deps);

    expect(result.repos).toEqual(registry);
    expect(Object.keys(result.repos)).toHaveLength(2);
  });
});
