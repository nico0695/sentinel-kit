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
 *    the run — an unregistered alias persists nothing. When it *throws*, the
 *    outcome is still rendered on `stdout` and the failure is reported on
 *    `stderr` with a non-zero exit (D13); a finished review is never
 *    discarded because a write failed.
 * 3. **The exit code is the run's terminal state, resolved by a pure mapping
 *    and signalled by a throw** (`[E6.F1.H2]`, #37). After a successful
 *    `persistRun` and render, the action computes
 *    `resolveReviewExitCode(state, verdict, changesExitCode)` and throws a
 *    `ReviewExitSignal` carrying it; `createCli`'s `runProgram` catch returns
 *    that code. The throw is deliberately placed *after* persistence: when
 *    `persistRun` fails the original error is rethrown first and dominates via
 *    the catch-all (exit 1), so a run whose record could not be written is
 *    never reported as a trustworthy gate result (AC-9). The state is
 *    interpreted only through the pure mapping — no policy lives inline.
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
import type { PersistRunResult } from "../../../../core/history/index.js";
import {
  type ResolveReviewRequestFlags,
  resolveReviewRequest,
} from "../../../../core/run/index.js";
import type { CliDeps } from "../cli-deps.js";
import { ReviewExitSignal, resolveReviewExitCode } from "../exit-code.js";
import {
  formatReviewOutcome,
  formatUnpersistedReviewOutcome,
} from "../render/format-review.js";

interface ReviewOptions {
  readonly type?: string;
  readonly engine?: string;
  /** Already a number: `parseTimeoutMs` runs as commander's `parseArg`. */
  readonly timeout?: number;
  /**
   * Always a number: `parseChangesExitCode` runs as commander's `parseArg`
   * and the option carries a default of 1, so no absent case exists (D2/AC-2).
   */
  readonly changesExitCode: number;
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
 * Parses `--changes-exit-code <n>`. Mirrors `parseTimeoutMs`: `commander`
 * hands the value over as a string, so the conversion happens here and an
 * unusable value is reported as a usage error — a message and a non-zero
 * exit — before any review work starts (AC-6), rather than reaching the
 * exit-code mapping as a `NaN`.
 *
 * The bound is the POSIX exit-status range: an integer 0–255. `0` is a valid
 * soft gate (AC-5); the default of 1 is applied by `commander`, not here.
 *
 * The empty/whitespace guard is load-bearing: `Number("")` and `Number("  ")`
 * are `0`, so without it an empty `--changes-exit-code` would silently become a
 * soft gate rather than the usage error a blank value is — a scripting footgun
 * (a variable that expanded to nothing would disable the gate unnoticed).
 */
function parseChangesExitCode(raw: string): number {
  if (raw.trim() === "") {
    throw new InvalidArgumentError("expected an integer 0-255");
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new InvalidArgumentError("expected an integer 0-255");
  }

  return value;
}

/**
 * The `--help` footer documenting the exit-code contract (AC-10). This is the
 * in-product documentation surface for the codes until `[E7.F2.H1]` writes
 * user-facing docs, so it states every branch a script would test.
 */
const EXIT_CODE_HELP = [
  "",
  "Exit codes:",
  "  0  the review passed — verdict approve or comment (non-blocking)",
  "  1  changes requested — configurable via --changes-exit-code (0 for a",
  "     soft gate that still passes)",
  "  2  the review could not complete — ambiguous, engine-error, timeout or",
  "     validation-failed",
].join("\n");

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
    .option(
      "--changes-exit-code <n>",
      "exit code when the verdict is request-changes (0-255, 0 for a soft gate)",
      parseChangesExitCode,
      1,
    )
    .addHelpText("after", EXIT_CODE_HELP)
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

      let persisted: PersistRunResult;

      try {
        // Unconditional: every completed run is persisted, `ok` or not (AC-6).
        persisted = await deps.useCases.persistRun({
          repoName: repo,
          startedAtEpochMs,
          request,
          result,
        });
      } catch (error) {
        // D13 / `R4-001`: the review itself is finished — minutes of engine
        // work — and its verdict must not be swallowed because the record
        // could not be written. The outcome is rendered from the request and
        // the result, `runDir` renders as `-` because no directory exists,
        // one diagnostic says so on `stderr`, and the original failure is
        // rethrown so `createCli`'s catch-all renders it and resolves a
        // non-zero exit code. No terminal state is invented: the five in
        // PRD §4 are a domain contract and this is an adapter concern.
        for (const line of formatUnpersistedReviewOutcome(
          repo,
          request,
          result,
          Math.max(0, deps.now() - startedAtEpochMs),
        )) {
          deps.io.stdout(line);
        }

        deps.io.stderr(
          "The review completed but its run could not be persisted: no history was written and `sentinel runs show` will not find it.",
        );

        throw error;
      }

      for (const line of formatReviewOutcome(
        repo,
        persisted.record,
        persisted.runDir,
      )) {
        deps.io.stdout(line);
      }

      // Only reached on the success path — persist succeeded and the outcome
      // is rendered. Signalling by throw lets `runProgram`'s catch return the
      // code without a mutable channel; the mapping is the sole interpreter of
      // the terminal state (AC-7). AC-9's ordering is load-bearing: a
      // persistence failure has already rethrown above and never gets here.
      throw new ReviewExitSignal(
        resolveReviewExitCode(
          result.state,
          result.verdict,
          options.changesExitCode,
        ),
      );
    });
}
