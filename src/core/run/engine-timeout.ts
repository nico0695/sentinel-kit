/**
 * Core module: run — the engine invocation timeout seam.
 *
 * Owns the only concurrency in the core: a race between the `ReviewEngine`
 * invocation and an elapsed budget. The scheduler is injectable and
 * CANCELLABLE, mirroring the `CreateReviewWorktreeDeps.now?` precedent, so
 * tests prove both halves of the contract — that `timeout` is reachable, and
 * that the timer is cleared on every path — without touching the wall clock
 * and without process-global fake timers.
 *
 * `setTimeout` / `clearTimeout` are used as runtime GLOBALS and never
 * imported: guard 2 (`core-no-io-libs`) bans both `node:timers` and the bare
 * `timers` specifier. `Date.now()` in `create-review-worktree.ts` is the
 * standing precedent.
 *
 * Nothing here is re-exported from the module's public `index.ts`: the seam
 * is reachable only through `runReview`.
 */

import type { ReviewResult } from "./ports/review-engine.js";
import { EngineInvocationError, EngineTimeoutError } from "./run-errors.js";

/**
 * Schedules `onElapsed` to run after `ms` and returns a cancel function.
 *
 * The cancel function must be idempotent and safe to call after the callback
 * already fired — `runEngineWithTimeout` calls it unconditionally on every
 * exit path.
 */
export type TimeoutScheduler = (
  ms: number,
  onElapsed: () => void,
) => () => void;

/**
 * Production scheduler, backed by the runtime's global timer functions.
 * Cancelling clears the pending timer so a fast review never keeps the event
 * loop alive.
 */
export const defaultTimeoutScheduler: TimeoutScheduler = (ms, onElapsed) => {
  const handle = setTimeout(onElapsed, ms);
  return () => {
    clearTimeout(handle);
  };
};

/**
 * Module-private race sentinel. A `unique symbol` can never collide with a
 * `ReviewResult`, so the winner of the race is discriminated without any
 * assumption about the engine's output shape.
 */
const TIMED_OUT = Symbol("engine-timed-out");

/**
 * Runs the engine invocation under a wall-clock budget.
 *
 * Outcomes:
 * - the invocation resolves first → its `ReviewResult` is returned;
 * - the budget elapses first → `EngineTimeoutError` (the sole producer of the
 *   `timeout` terminal state);
 * - the invocation rejects → `EngineInvocationError` with the raw rejection
 *   preserved in `cause` (the core never names an engine's own error types);
 * - `invoke` throws SYNCHRONOUSLY → the raw throwable escapes UNWRAPPED (not
 *   as `EngineInvocationError`): `invoke()` runs outside the `try` below.
 *   Accepted behaviour, recorded as risk `r-sync-throw-unwrapped`; the sole
 *   call site's catch-all still absorbs it into `engine-error`.
 *
 * The abandoned invocation keeps a no-op rejection handler attached, so a
 * late failure after a timeout can never surface as an unhandled rejection.
 * The engine promise itself is NOT cancellable — killing a real process is
 * the adapter's job, which is why `timeoutMs` is also forwarded to the engine
 * (risk `r-engine-not-cancellable`, carried to E4.F2).
 */
export async function runEngineWithTimeout(
  invoke: () => Promise<ReviewResult>,
  timeoutMs: number,
  schedule: TimeoutScheduler,
): Promise<ReviewResult> {
  const pending = invoke();
  void pending.catch(() => {
    // A rejection arriving after the race was lost is expected, not an error.
  });

  let cancel: () => void = () => {
    // Replaced synchronously by the promise executor below.
  };
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    cancel = schedule(timeoutMs, () => {
      resolve(TIMED_OUT);
    });
  });

  try {
    const settled = await Promise.race([pending, expiry]);
    if (settled === TIMED_OUT) {
      throw new EngineTimeoutError(timeoutMs);
    }
    return settled;
  } catch (error) {
    if (error instanceof EngineTimeoutError) {
      throw error;
    }
    throw new EngineInvocationError("Engine invocation failed", {
      cause: error,
    });
  } finally {
    cancel();
  }
}
