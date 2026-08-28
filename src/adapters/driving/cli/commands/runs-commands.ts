/**
 * Driving adapter: cli — the `runs` command group (`[E6.F1.H1]`, #36).
 *
 * `runs list` → `listRuns`, `runs show` → `getRun`: one use case per command
 * path (AC-3). The bodies hold no domain logic (AC-1) — in particular they do
 * not sort, filter or merge the entries the store returned (`RunStore.list`
 * is already ascending by start time) and they do not translate the alias:
 * the storage-key rule lives in `core/history` (D7).
 *
 * Both commands echo the alias the caller typed back into their output rather
 * than the `repoName` the store returns, which carries the normalised storage
 * key (`risk-e6h1-009`).
 */

import type { Command } from "commander";
import type { CliDeps } from "../cli-deps.js";
import {
  formatRunRecordBlock,
  formatRunSummaryLine,
} from "../render/format-runs.js";

export function registerRunsCommands(program: Command, deps: CliDeps): void {
  const runs = program
    .command("runs")
    .description("inspect the review history of a repository");

  runs
    .command("list")
    .description("print one record per stored run, oldest first")
    .argument("<repo>", "repository alias, as printed by `sentinel repo list`")
    .action(async (repo: string) => {
      const result = await deps.useCases.listRuns({ repoName: repo });

      if (result.runs.length === 0) {
        // No runs is not an error and produces no stdout record (AC-10).
        deps.io.stderr(`No runs recorded for "${repo}".`);
        return;
      }

      for (const summary of result.runs) {
        deps.io.stdout(formatRunSummaryLine(repo, summary));
      }
    });

  runs
    .command("show")
    .description("print the stored record of a single run")
    .argument("<repo>", "repository alias, as printed by `sentinel repo list`")
    .argument("<id>", "run id, as printed by `sentinel runs list`")
    .action(async (repo: string, id: string) => {
      const record = await deps.useCases.getRun({ repoName: repo, id });

      for (const line of formatRunRecordBlock(repo, id, record)) {
        deps.io.stdout(line);
      }
    });
}
