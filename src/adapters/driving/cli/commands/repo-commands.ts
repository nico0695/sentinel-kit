/**
 * Driving adapter: cli — the `repo` command group (`[E6.F1.H1]`, #36).
 *
 * `repo add` → `registerRepo`, `repo list` → `listRepos`: one use case per
 * command path (AC-3), and nothing else. A body here parses arguments, calls
 * exactly one injected thunk and hands the result to a pure renderer — no
 * lookup, no cascade, no filtering, no sorting, no adapter construction
 * (AC-1). Every option carries a description string, which is what makes
 * `--help` non-empty at each level (AC-2).
 *
 * Errors are not caught: a typed core error propagates out of `parseAsync`
 * into `createCli`'s catch-all, which renders it as one `stderr` line and
 * resolves a non-zero exit code (AC-13).
 */

import type { Command } from "commander";
import type { RegisterRepoRequest } from "../../../../core/repos/index.js";
import type { CliDeps } from "../cli-deps.js";
import {
  formatRegisterOutcome,
  formatRepoLine,
} from "../render/format-repos.js";

interface RepoAddOptions {
  readonly localPath?: string;
  readonly baseBranch?: string;
  readonly harness?: string;
}

/**
 * Builds the request from the parsed flags. Absent flags stay absent keys
 * rather than becoming `undefined` values, which is what
 * `exactOptionalPropertyTypes` asks for and what keeps the request shape
 * identical to the one a caller would hand `registerRepo` directly.
 */
function toRegisterRequest(
  url: string,
  options: RepoAddOptions,
): RegisterRepoRequest {
  return {
    url,
    ...(options.localPath !== undefined
      ? { localPath: options.localPath }
      : {}),
    ...(options.baseBranch !== undefined
      ? { baseBranch: options.baseBranch }
      : {}),
    ...(options.harness !== undefined
      ? { defaultHarness: options.harness }
      : {}),
  };
}

export function registerRepoCommands(program: Command, deps: CliDeps): void {
  const repo = program
    .command("repo")
    .description("register and inspect the repositories sentinel reviews");

  repo
    .command("add")
    .description(
      "register a repository, cloning it unless a local path is given",
    )
    .argument("<url>", "git URL of the repository (https or ssh)")
    .option(
      "--local-path <path>",
      "absolute path of an existing clone to use instead of cloning",
    )
    .option(
      "--base-branch <branch>",
      "base branch reviews diff against (detected from the repository when omitted)",
    )
    .option(
      "--harness <name>",
      "default harness `sentinel review` uses for this repository",
    )
    .action(async (url: string, options: RepoAddOptions) => {
      const result = await deps.useCases.registerRepo(
        toRegisterRequest(url, options),
      );

      deps.io.stdout(formatRegisterOutcome(result));
    });

  repo
    .command("list")
    .description("print one record per registered repository")
    .action(async () => {
      const { repos } = await deps.useCases.listRepos();
      const entries = Object.entries(repos);

      if (entries.length === 0) {
        // An empty registry is not an error and produces no stdout record —
        // a piped consumer reads zero lines. The note is a diagnostic and
        // belongs on stderr (AC-10).
        deps.io.stderr("No repositories registered.");
        return;
      }

      for (const [alias, entry] of entries) {
        deps.io.stdout(formatRepoLine(alias, entry));
      }
    });
}
