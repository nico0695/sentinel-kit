/**
 * Driving adapter: cli — the `review` command (`[E6.F1.H1]`, #36).
 *
 * The only command path that calls two use cases: `runReview` then
 * `persistRun` (D1/AC-3). Everything between them that could look like a
 * decision is not one — the body parses arguments, asks core to compose the
 * request, runs it, persists it exactly once and renders the outcome:
 *
 * ```
 * resolveReviewRequest → runReview → persistRun → render
 * ```
 *
 * Four properties are load-bearing:
 *
 * 1. **No cascade lives here.** `resolveReviewRequest` (core `run`, D5) owns
 *    the registry lookup, the flag → repo → global precedence for every field
 *    of `RunReviewRequest`, and the internal `resolveEngine` call — so
 *    `RepoNotFoundError`, `InvalidRunRequestError` and `UnknownEngineError`
 *    all surface before any git or engine work starts, and the TUI
 *    (`[E6.F2.H1]`) will resolve a review exactly the way this command does
 *    (AC-1).
 * 2. **`persistRun` is called exactly once per completed invocation, whatever
 *    the terminal state** (AC-6). A failed run is precisely the run a user
 *    later wants to read back; dropping it would resurrect the gap D1 exists
 *    to close. It is not called at all when the invocation fails *before*
 *    the run — an unregistered alias persists nothing.
 * 3. **Nothing reads `result.state` to decide an exit code** (AC-12). A
 *    completed invocation resolves to 0 through `createCli`'s normal path
 *    regardless of terminal state; the terminal-state → exit-code mapping is
 *    `[E6.F1.H2]`'s (#37). The state is rendered, never interpreted.
 * 4. **`--timeout` is parsed, not trusted.** `commander` hands option values
 *    over as strings while `ResolveReviewRequestFlags.timeoutMs` is a number;
 *    a non-numeric value is rejected as a usage error rather than forwarded
 *    as a `NaN` budget.
 *
 * Typed core errors are not caught: they propagate out of `parseAsync` into
 * `createCli`'s catch-all, which renders one `stderr` line with no stack and
 * resolves a non-zero exit code (AC-13).
 */

import { type Command, InvalidArgumentError } from "commander";
import {
  type ResolveReviewRequestFlags,
  resolveReviewRequest,
} from "../../../../core/run/index.js";
import type { CliDeps } from "../cli-deps.js";
import { formatReviewOutcome } from "../render/format-review.js";

interface ReviewOptions {
  readonly type?: string;
  readonly engine?: string;
  /** Already a number: `parseTimeoutMs` runs as commander's `parseArg`. */
  readonly timeout?: number;
}

/**
 * Parses `--timeout <ms>`. `commander` delivers every option value as a
 * string, so the conversion has to happen somewhere; doing it here means an
 * unusable value is reported as what it is — a usage error, with a message
 * and a non-zero exit — instead of reaching `runReview` as `NaN` and being
 * discovered as a bogus timeout mid-run.
 *
 * Only the shape is checked. The upper bound belongs to `runReview`'s
 * request pre-flight, which already rejects a budget beyond Node's timer
 * range; re-stating it here would duplicate a domain rule (AC-1).
 */
function parseTimeoutMs(raw: string): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidArgumentError(
      "expected a positive whole number of milliseconds",
    );
  }

  return value;
}

/**
 * Builds the per-invocation overrides. Absent flags stay absent keys rather
 * than becoming `undefined` values (`exactOptionalPropertyTypes`), so the
 * precedence inside `resolveReviewRequest` sees exactly what the user passed.
 */
function toFlags(options: ReviewOptions): ResolveReviewRequestFlags {
  return {
    ...(options.type !== undefined ? { harnessType: options.type } : {}),
    ...(options.engine !== undefined ? { engineName: options.engine } : {}),
    ...(options.timeout !== undefined ? { timeoutMs: options.timeout } : {}),
  };
}

export function registerReviewCommand(program: Command, deps: CliDeps): void {
  program
    .command("review")
    .description("review a branch of a registered repository")
    .argument("<repo>", "repository alias, as printed by `sentinel repo list`")
    .argument("<branch>", "branch or ref to review, diffed against its base")
    .option(
      "--type <harness>",
      "harness to review with (defaults to the repository's harness)",
    )
    .option(
      "--engine <engine>",
      "review engine for this run (claude-code or opencode)",
    )
    .option(
      "--timeout <ms>",
      "wall-clock budget for the engine invocation, in milliseconds",
      parseTimeoutMs,
    )
    .action(async (repo: string, branch: string, options: ReviewOptions) => {
      const { config, repos } = await deps.loadContext();

      const request = resolveReviewRequest({
        repoAlias: repo,
        targetRef: branch,
        repos,
        config,
        clonesDir: deps.clonesDir,
        flags: toFlags(options),
      });

      const startedAtEpochMs = deps.now();
      const result = await deps.useCases.runReview(request);

      // Unconditional: every completed run is persisted, `ok` or not (AC-6).
      const { runDir, record } = await deps.useCases.persistRun({
        repoName: repo,
        startedAtEpochMs,
        request,
        result,
      });

      for (const line of formatReviewOutcome(repo, record, runDir)) {
        deps.io.stdout(line);
      }
    });
}
