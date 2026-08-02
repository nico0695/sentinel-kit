/**
 * Core module: repos — `ConfigStore` driven port (PRD §4.3).
 *
 * Owned by `repos` (decision B1). The `review` module imports
 * these types via `repos/index.ts`.
 */
import type { GlobalConfig, RepoRegistry } from "./config-schemas.js";

export interface ConfigStore {
  readConfig(): Promise<GlobalConfig>;
  writeConfig(config: GlobalConfig): Promise<void>;
  readRepos(): Promise<RepoRegistry>;
  writeRepos(repos: RepoRegistry): Promise<void>;
}
