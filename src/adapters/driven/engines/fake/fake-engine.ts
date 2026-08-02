/**
 * Driven adapter: FakeEngine — a scripted `ReviewEngine` for tests and e2e
 * smoke (PRD §4.2). A shipped adapter (lives in production `src`, not under
 * `__test__/`) because the future e2e smoke wires it as the real engine.
 *
 * It implements the frozen THIN `ReviewEngine` port (dec-004): `review()`
 * yields a scripted `ReviewResult` or rejects with a plain `Error`. It does
 * NOT enforce `timeoutMs`, compute a verdict, decide a `TerminalState`, or add
 * any typed port error — those belong to the run flow downstream (E4.F1.x).
 */
import type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
} from "../../../../core/run/index.js";

/** One scripted outcome of a `review()` call: resolve a result or reject. */
export type FakeReviewOutcome =
  | { readonly ok: true; readonly result: ReviewResult }
  | { readonly ok: false; readonly error: Error };

/**
 * A FakeEngine script: a single outcome (repeated on every call) or an
 * ordered sequence consumed one outcome per `review()` call.
 */
export type FakeEngineScript = FakeReviewOutcome | readonly FakeReviewOutcome[];

/**
 * Create a `ReviewEngine` whose behavior is fully scripted.
 *
 * - A single `FakeReviewOutcome` repeats on every `review()` call.
 * - A readonly array is consumed in order via an internal cursor; a call past
 *   the end rejects with a plain `Error` (script exhausted).
 *
 * A resolving outcome returns its `ReviewResult`; a rejecting outcome throws
 * its plain `Error` (throwing in an async function rejects the promise).
 */
export function createFakeEngine(script: FakeEngineScript): ReviewEngine {
  const single: FakeReviewOutcome | undefined = Array.isArray(script)
    ? undefined
    : (script as FakeReviewOutcome);
  const sequence: readonly FakeReviewOutcome[] | undefined = Array.isArray(
    script,
  )
    ? (script as readonly FakeReviewOutcome[])
    : undefined;
  let cursor = 0;

  return {
    async review(_request: ReviewRequest): Promise<ReviewResult> {
      let outcome: FakeReviewOutcome;
      if (single !== undefined) {
        outcome = single;
      } else {
        // `noUncheckedIndexedAccess`: index access is `T | undefined`, so the
        // exhaustion branch is explicit.
        const next = sequence?.[cursor];
        if (next === undefined) {
          throw new Error("FakeEngine: script exhausted");
        }
        cursor += 1;
        outcome = next;
      }

      if (outcome.ok) {
        return outcome.result;
      }
      throw outcome.error;
    },
  };
}
