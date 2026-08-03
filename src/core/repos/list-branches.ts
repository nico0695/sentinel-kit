import { BranchListError, RepoNotFoundError } from "./list-branches-errors.js";
import type { ConfigStore } from "./ports/config-store.js";
import type { BranchRef, GitPort } from "./ports/git-port.js";
import { GitError } from "./ports/git-port-errors.js";

export interface ListBranchesRequest {
  readonly alias: string;
}

export interface ListBranchesDeps {
  readonly git: GitPort;
  readonly config: ConfigStore;
  readonly clonesDir: string;
}

export interface ListBranchesResult {
  readonly alias: string;
  readonly branches: readonly BranchRef[];
}

export async function listBranches(
  request: ListBranchesRequest,
  deps: ListBranchesDeps,
): Promise<ListBranchesResult> {
  const repos = await deps.config.readRepos();
  const entry = repos[request.alias];

  if (entry === undefined) {
    throw new RepoNotFoundError(request.alias);
  }

  const repoPath = entry.localPath ?? `${deps.clonesDir}/${request.alias}`;

  try {
    await deps.git.fetch({ repoPath });
  } catch (error) {
    if (error instanceof GitError) {
      throw new BranchListError(
        `Failed to fetch remotes for "${request.alias}"`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    return {
      alias: request.alias,
      branches: await deps.git.branches(repoPath),
    };
  } catch (error) {
    if (error instanceof GitError) {
      throw new BranchListError(
        `Failed to list branches for "${request.alias}"`,
        { cause: error },
      );
    }
    throw error;
  }
}
