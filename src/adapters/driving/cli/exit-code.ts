/**
 * Driving adapter: cli — the review exit-code policy (`[E6.F1.H2]`, #37).
 *
 * `[E6.F1.H1]` left the seam explicit: `createCli(deps).run(argv)` resolves 0
 * for any completed invocation and the `review` command renders `result.state`
 * without interpreting it. This module is the first code that turns a run's
 * terminal state — and, when `ok`, its verdict — into a process exit code, so a
 * script or CI job can branch on the outcome without a TTY (PRD use case 6).
 *
 * The mapping is a pure two-axis function (spec AC-7): it reads `state` always
 * and reads `verdict` only inside the `ok` branch, exactly mirroring the domain
 * shape where `RunReviewResult.verdict` is present only when `state === "ok"`.
 * It imports the exported `TerminalState`/`Verdict` **types** and nothing else
 * from core — no domain logic lands here, and no sixth terminal state is
 * invented (PRD §4).
 */

import type { TerminalState, Verdict } from "../../../core/run/index.js";

/**
 * The exit-code table (decision e6h2-D1). `changesExitCode` is the resolved
 * `--changes-exit-code` value (default 1).
 *
 * | state             | verdict           | code             |
 * |-------------------|-------------------|------------------|
 * | `ok`              | `approve`         | 0                |
 * | `ok`              | `comment`         | 0                |
 * | `ok`              | `request-changes` | `changesExitCode`|
 * | `ok`              | — (absent)        | 2                |
 * | any non-`ok`      | — (none)          | 2                |
 *
 * `0` = the review ran and does not block; `changesExitCode` = the review ran
 * and blocks (the gate); `2` = the tool could not produce a trustworthy verdict
 * (`ambiguous` / `engine-error` / `timeout` / `validation-failed`, and an `ok`
 * run with no verdict — see below). Only the `request-changes` row is
 * configurable; `0` and `2` are fixed.
 *
 * A `verdict` absent on `ok` is type-impossible per `RunReviewResult`, but the
 * mapping fails closed on it — `2`, not `0`. An `ok` with no verdict is, to a
 * gate, indistinguishable from `ambiguous` (a completed run with no trustworthy
 * verdict), so it belongs in the same bucket: a gate must reject a run it
 * cannot judge, never pass it silently. This is the safe default for the one
 * consumer that matters here — a CI gate branching on `$?`.
 */
export function resolveReviewExitCode(
  state: TerminalState,
  verdict: Verdict | undefined,
  changesExitCode: number,
): number {
  if (state !== "ok" || verdict === undefined) {
    return 2;
  }

  return verdict === "request-changes" ? changesExitCode : 0;
}

/**
 * Carries a completed review's exit code out of the `commander` action to
 * `runProgram`'s catch, which returns `error.code` as `run()`'s value.
 *
 * A `commander` action callback cannot return a value to `run()`, so the
 * review action signals its outcome the same way `commander` signals its own:
 * by throwing. This is the mechanism `runProgram` already implements for
 * `CommanderError.exitCode` (design risk-e6h2-002). It is stateless — each
 * invocation's code is fully local, so a program built once and `run()`
 * repeatedly never leaks a stale code — and it keeps `CliDeps` an immutable
 * contract.
 *
 * It is an adapter control-signal, not a domain error: it never reaches
 * `formatErrorLine`, and the five terminal states in PRD §4 stay untouched.
 * Extending `Error` satisfies Biome's throw-only-`Error` rule and mirrors
 * `CommanderError`.
 */
export class ReviewExitSignal extends Error {
  constructor(readonly code: number) {
    super(`review resolved exit code ${code}`);
    this.name = "ReviewExitSignal";
  }
}
