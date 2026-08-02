import type { RepoRegistry } from "./ports/config-schemas.js";
import type { ConfigStore } from "./ports/config-store.js";

export interface ListReposDeps {
  readonly config: ConfigStore;
}

export interface ListReposResult {
  readonly repos: RepoRegistry;
}

export async function listRepos(deps: ListReposDeps): Promise<ListReposResult> {
  const repos = await deps.config.readRepos();
  return { repos };
}
