/**
 * In-memory `ProcessRunner` fake (design.md D-7).
 *
 * Kept in its own file, deliberately OUT of `run-review-fixtures.ts`: that
 * file drags in the adapters' fake engine, the review module's harness
 * loader fake and the workspace git fake — AC-18 requires
 * `run-validations.test.ts` to import "no harness or git fixture", and
 * `run-review-fixtures.ts` importing this file (for its own `buildDeps`
 * override surface) stays one-directional.
 *
 * Records every call as `{ command, args, cwd, timeoutMs }` (spec.md AC-2,
 * AC-3, AC-4) and resolves/rejects from a scripted, ordered queue. Throws if
 * a second `run()` starts while one is still pending — this is what makes a
 * `Promise.all` mutation fail on the fake's own assertion instead of a
 * timing race (design.md D-7).
 */

import type {
  ProcessRunner,
  ProcessRunRequest,
  ProcessRunResult,
} from "../ports/process-runner.js";

/** One scripted outcome: a result to resolve with, or a throwable to reject with. */
export type FakeProcessOutcome =
  | { readonly kind: "resolve"; readonly result: ProcessRunResult }
  | { readonly kind: "reject"; readonly error: unknown };

export interface FakeProcessRunnerCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface FakeProcessRunner extends ProcessRunner {
  /** Every call received so far, in call order. */
  readonly calls: readonly FakeProcessRunnerCall[];
}

/** Convenience: a well-formed clean-exit result with everything else at its zero value. */
export function okResult(
  overrides?: Partial<ProcessRunResult>,
): ProcessRunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

/**
 * Builds a fake `ProcessRunner` that resolves/rejects from `outcomes`, in
 * order — one entry consumed per `run()` call. Extra calls beyond the
 * scripted queue reject with an assertion-style error naming the overrun,
 * so a wiring bug that calls `run()` too many times fails loudly rather
 * than resolving with `undefined`.
 */
export function createFakeProcessRunner(
  outcomes: readonly FakeProcessOutcome[],
): FakeProcessRunner {
  const calls: FakeProcessRunnerCall[] = [];
  const queue = [...outcomes];
  let inFlight = false;

  return {
    calls,
    async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
      if (inFlight) {
        throw new Error(
          "FakeProcessRunner.run() called while a previous call was still pending — validations must run sequentially (AC-2)",
        );
      }
      inFlight = true;
      try {
        calls.push({
          command: request.command,
          args: request.args,
          cwd: request.cwd,
          timeoutMs: request.timeoutMs,
        });

        const outcome = queue.shift();
        if (outcome === undefined) {
          throw new Error(
            `FakeProcessRunner.run() called more times (${calls.length}) than outcomes were scripted (${outcomes.length})`,
          );
        }

        // Yield once so a genuinely concurrent second call (a `Promise.all`
        // mutation) has a chance to start before this one settles, which is
        // what makes the `inFlight` guard above catch it.
        await Promise.resolve();

        if (outcome.kind === "reject") {
          throw outcome.error;
        }
        return outcome.result;
      } finally {
        inFlight = false;
      }
    },
  };
}
