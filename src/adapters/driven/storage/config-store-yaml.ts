/**
 * Driven adapter: storage — YAML-backed `ConfigStore` implementation.
 *
 * Reads/writes `config.yaml` and `repos.yaml` under a configurable
 * base directory, validating through the zod schemas from core.
 * I/O and validation failures are translated into the port error
 * hierarchy — callers never see raw fs or yaml errors.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { ZodError } from "zod";
import type { ConfigStore } from "../../../core/repos/index.js";
import {
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
  type GlobalConfig,
  GlobalConfigSchema,
  type RepoRegistry,
  RepoRegistrySchema,
} from "../../../core/repos/index.js";

const CONFIG_FILE = "config.yaml";
const REPOS_FILE = "repos.yaml";

function zodToFields(
  err: ZodError,
): ReadonlyArray<{ readonly path: string; readonly message: string }> {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

export function createConfigStoreAdapter(basePath: string): ConfigStore {
  const configPath = join(basePath, CONFIG_FILE);
  const reposPath = join(basePath, REPOS_FILE);

  return {
    async readConfig(): Promise<GlobalConfig> {
      let raw: string;
      try {
        raw = await readFile(configPath, "utf-8");
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return GlobalConfigSchema.parse({});
        }
        throw new ConfigReadError(`Failed to read ${CONFIG_FILE}`, {
          cause: err,
        });
      }

      let parsed: unknown;
      try {
        parsed = parse(raw);
      } catch (err: unknown) {
        throw new ConfigReadError(`Failed to parse ${CONFIG_FILE}`, {
          cause: err,
        });
      }

      const result = GlobalConfigSchema.safeParse(parsed ?? {});
      if (!result.success) {
        throw new ConfigValidationError(
          `Invalid ${CONFIG_FILE}`,
          zodToFields(result.error),
        );
      }
      return result.data;
    },

    async writeConfig(config: GlobalConfig): Promise<void> {
      const result = GlobalConfigSchema.safeParse(config);
      if (!result.success) {
        throw new ConfigValidationError(
          `Invalid config data`,
          zodToFields(result.error),
        );
      }
      try {
        await writeFile(configPath, stringify(result.data), "utf-8");
      } catch (err: unknown) {
        throw new ConfigWriteError(`Failed to write ${CONFIG_FILE}`, {
          cause: err,
        });
      }
    },

    async readRepos(): Promise<RepoRegistry> {
      let raw: string;
      try {
        raw = await readFile(reposPath, "utf-8");
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return {};
        }
        throw new ConfigReadError(`Failed to read ${REPOS_FILE}`, {
          cause: err,
        });
      }

      let parsed: unknown;
      try {
        parsed = parse(raw);
      } catch (err: unknown) {
        throw new ConfigReadError(`Failed to parse ${REPOS_FILE}`, {
          cause: err,
        });
      }

      const result = RepoRegistrySchema.safeParse(parsed ?? {});
      if (!result.success) {
        throw new ConfigValidationError(
          `Invalid ${REPOS_FILE}`,
          zodToFields(result.error),
        );
      }
      return result.data;
    },

    async writeRepos(repos: RepoRegistry): Promise<void> {
      const result = RepoRegistrySchema.safeParse(repos);
      if (!result.success) {
        throw new ConfigValidationError(
          `Invalid repos data`,
          zodToFields(result.error),
        );
      }
      try {
        await writeFile(reposPath, stringify(result.data), "utf-8");
      } catch (err: unknown) {
        throw new ConfigWriteError(`Failed to write ${REPOS_FILE}`, {
          cause: err,
        });
      }
    },
  };
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
