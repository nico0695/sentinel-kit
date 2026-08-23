/**
 * Driven adapter: exec — the pure `execa`→`ProcessRunResult` translation
 * (design.md D-3). Under `reject: false`, execa's single resolved value
 * conflates six materially different outcomes (clean exit, non-zero exit,
 * timeout kill, output overflow, spawn failure, overflow-then-hang), and
 * three of its own fields (`failed`, `timedOut`, `isMaxBuffer`) are unsound
 * as direct signals for at least one of those outcomes (spec revision 2,
 * R1-R5). This function is the whole story: no `execa` import, no
 * `child_process`, no I/O — every rule is provable with a hand-built input
 * record.
 */
import type { ProcessRunResult } from "../../../core/run/index.js";
import { ProcessSpawnError } from "../../../core/run/index.js";

/**
 * The subset of execa's resolved value this classifier depends on, named
 * explicitly rather than importing execa's own `Result` type — keeps this
 * module's contract self-contained and its test file execa-free.
 */
export interface ExecaLikeResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly isMaxBuffer: boolean;
  /** Present on a genuine spawn-failure error (e.g. "ENOENT", "EACCES"). */
  readonly code?: string;
  /**
   * Identifying context for a genuine spawn failure (R4-001) — carried
   * through into `ProcessSpawnError`'s message/`cause` so an operator can
   * tell which binary/args/cwd actually failed without inspecting the raw
   * execa result.
   */
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/**
 * Turns one execa-shaped result into a `ProcessRunResult`, or throws
 * `ProcessSpawnError` when the process never ran. `budget` is the caller's
 * already-resolved `maxOutputChars` (never undefined here); `elapsedMs` is
 * the adapter's own clock reading, not execa's `durationMs` — one fewer
 * execa semantic to depend on.
 */
export function classifyExecaResult(
  result: ExecaLikeResult,
  budget: number,
  timeoutMs: number,
  elapsedMs: number,
): ProcessRunResult {
  // Never ran (D-5): empirically the one condition unique to a process that
  // was never spawned — ENOENT/EACCES/bad cwd all leave BOTH exitCode and
  // signal absent. Checked first: every other rule assumes the process ran.
  // `failed` is not a usable signal here (AC-16) — a plain exit-1 sets it
  // too, and the ExecaLikeResult type has no `failed` field at all, so a
  // classification that tried to key on it would not type-check.
  if (result.exitCode === undefined && result.signal === undefined) {
    throw new ProcessSpawnError(
      `process failed to spawn: ${result.command}${result.code !== undefined ? ` (${result.code})` : ""}`,
      { cause: result },
    );
  }

  // Timed out (D-4): derived from elapsed-vs-budget, never from a
  // `result.timedOut`-shaped field. execa's own `timedOut` is false when
  // truncation preceded the SIGTERM kill (R5, AC-17) — trusting it would
  // misreport exactly the overflow-then-hang case the spec calls out.
  const timedOut = result.signal !== undefined && elapsedMs >= timeoutMs;

  // Truncated (D-6): per stream, by length comparison against the budget.
  // `isMaxBuffer` is a single global flag (R3) — using it directly would
  // mark both streams truncated when only one actually overflowed.
  const stdoutTruncated = result.isMaxBuffer && result.stdout.length >= budget;
  const stderrTruncated = result.isMaxBuffer && result.stderr.length >= budget;

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    ...(result.signal !== undefined ? { signal: result.signal } : {}),
    timedOut,
    stdoutTruncated,
    stderrTruncated,
  };
}
