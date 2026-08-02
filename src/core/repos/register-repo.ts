import type { RepoEntry } from "./ports/config-schemas.js";
import type { ConfigStore } from "./ports/config-store.js";
import type { GitPort } from "./ports/git-port.js";
import { GitError } from "./ports/git-port-errors.js";
import {
  InvalidRepoRequestError,
  RepoRegistrationError,
} from "./register-repo-errors.js";

export interface RegisterRepoRequest {
  readonly url: string;
  readonly localPath?: string;
  readonly baseBranch?: string;
  readonly defaultHarness?: string;
}

export interface RegisterRepoResult {
  readonly alias: string;
  readonly entry: RepoEntry;
  readonly alreadyRegistered: boolean;
}

export interface RegisterRepoDeps {
  readonly git: GitPort;
  readonly config: ConfigStore;
  readonly clonesDir: string;
}

function deriveAlias(url: string): string {
  let s = url.trim();

  if (s.endsWith(".git")) {
    s = s.slice(0, -4);
  }

  let segments: string[];

  if (s.includes("://")) {
    segments = s.split("/");
  } else if (s.includes(":")) {
    const afterColon = s.slice(s.indexOf(":") + 1);
    segments = afterColon.split("/");
  } else {
    segments = s.split("/");
  }

  const nonEmpty = segments.filter((seg) => seg !== "");

  if (nonEmpty.length < 2) {
    return nonEmpty.join("/");
  }

  return `${nonEmpty[nonEmpty.length - 2]}/${nonEmpty[nonEmpty.length - 1]}`;
}

export async function registerRepo(
  request: RegisterRepoRequest,
  deps: RegisterRepoDeps,
): Promise<RegisterRepoResult> {
  const url = request.url.trim();

  if (url === "") {
    throw new InvalidRepoRequestError("url must not be empty");
  }

  if (request.localPath !== undefined && !request.localPath.startsWith("/")) {
    throw new InvalidRepoRequestError("localPath must be an absolute path");
  }

  const alias = deriveAlias(url);

  const repos = await deps.config.readRepos();

  const existing = repos[alias];
  if (existing !== undefined) {
    return { alias, entry: existing, alreadyRegistered: true };
  }

  let repoPath: string;

  if (request.localPath !== undefined) {
    repoPath = request.localPath;
  } else {
    const targetPath = `${deps.clonesDir}/${alias}`;
    try {
      await deps.git.clone({ url, targetPath });
    } catch (error) {
      if (error instanceof GitError) {
        throw new RepoRegistrationError(`Failed to clone repository "${url}"`, {
          cause: error,
        });
      }
      throw error;
    }
    repoPath = targetPath;
  }

  let baseBranch: string | undefined;

  if (request.baseBranch !== undefined) {
    baseBranch = request.baseBranch;
  } else {
    try {
      baseBranch = await deps.git.defaultBranch({ repoPath });
    } catch (error) {
      if (error instanceof GitError) {
        throw new RepoRegistrationError(
          `Failed to detect default branch for "${alias}"`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  const entry: RepoEntry = {
    url,
    ...(request.localPath !== undefined
      ? { localPath: request.localPath }
      : {}),
    ...(baseBranch !== undefined ? { baseBranch } : {}),
    ...(request.defaultHarness !== undefined
      ? { defaultHarness: request.defaultHarness }
      : {}),
  };

  await deps.config.writeRepos({ ...repos, [alias]: entry });

  return { alias, entry, alreadyRegistered: false };
}
