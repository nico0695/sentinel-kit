/**
 * Driven adapter: claude-code — the `runProcess` injection seam and its
 * `execa`-backed default (PRD §4.2). This file is pure process-spawning
 * plumbing: no `ReviewResult`/`ReviewUsage` knowledge, no envelope parsing,
 * no typed-error construction — those live in `envelope.ts`/`errors.ts` and
 * are composed on top of this seam by `claude-code-adapter.ts` (ST-3).
 */
import { execa } from "execa";

/** Options passed to a `ClaudeCodeProcessRunner` invocation. */
export interface ClaudeCodeProcessRunOptions {
  readonly cwd: string;
  /** stdin payload; absent for the `--version` pre-check. */
  readonly input?: string;
  /** 0/absent semantics: no timeout enforced by the runner itself. */
  readonly timeoutMs: number;
}

/**
 * Narrow process-invocation seam (AC-20). Resolves for both a clean exit
 * AND a non-zero/signal-terminated exit — the adapter branches on
 * `exitCode`/`signal`, it does not rely on rejection to detect process
 * failure. Only a genuine spawn failure (ENOENT, permission denied)
 * REJECTS. This is the sole binary-mocking seam for the claude-code
 * adapter: a test double is a plain async function literal, no `PATH`
 * shimming or `execa` monkey-patching required.
 */
export type ClaudeCodeProcessRunner = (
  args: readonly string[],
  options: ClaudeCodeProcessRunOptions,
) => Promise<ClaudeCodeProcessResult>;

/** Result of a `ClaudeCodeProcessRunner` invocation. */
export interface ClaudeCodeProcessResult {
  readonly stdout: string;
  /** undefined when terminated by a signal. */
  readonly exitCode?: number;
  /** e.g. "SIGTERM" / "SIGKILL"; undefined on a clean exit. */
  readonly signal?: string;
  /** execa's own `timedOut` — true iff its own `timeout` option fired. */
  readonly timedOut: boolean;
}

/**
 * Factory: returns a `ClaudeCodeProcessRunner` backed by `execa`, closing
 * over `binaryPath` (AC-21). Mirrors `git-cli.ts`'s `createGitCliAdapter`
 * naming convention (`create<Thing>`), scoped down to the narrower seam
 * this adapter needs rather than a full port implementation.
 *
 * **Resolve-not-reject design choice.** execa's default `reject: true`
 * behavior throws an `ExecaError` on non-zero exit or signal termination —
 * but that `ExecaError` object carries the same fields (`stdout`,
 * `exitCode`, `signal`, `timedOut`) as a success `Result`, merged onto the
 * thrown error. Calling execa with `{ reject: false }` and returning its
 * `Result` directly in every case (except a genuine spawn failure) keeps
 * the seam's contract simple for a fixture-replaying test double: a double
 * only ever needs to *resolve* with a scripted `{ stdout, exitCode, signal,
 * timedOut }` tuple — it never needs to construct a fake rejection to
 * simulate a non-zero exit.
 *
 * **AC-19 timeout wiring.** `forceKillAfterDelay: 2000` is a deliberate
 * override of execa's 5000ms default, not an inherited default — it puts a
 * small, explicit ceiling on how long an adapter-initiated SIGTERM grace
 * window can stay open, closing (bounding) the `r-cleanup-races-abandoned-
 * engine` window rather than leaving it at execa's wider default.
 * `killSignal`/`forceKillAfterDelay` are only meaningful when `timeout` is
 * set, hence the conditional spread (`exactOptionalPropertyTypes`
 * compliance, same pattern `git-cli.ts` and `run-review.ts` use).
 */
export function createDefaultRunProcess(
  binaryPath: string,
): ClaudeCodeProcessRunner {
  return async (
    args: readonly string[],
    { cwd, input, timeoutMs }: ClaudeCodeProcessRunOptions,
  ): Promise<ClaudeCodeProcessResult> => {
    const result = await execa(binaryPath, args, {
      cwd,
      ...(input !== undefined ? { input } : {}),
      ...(timeoutMs > 0
        ? {
            timeout: timeoutMs,
            killSignal: "SIGTERM",
            forceKillAfterDelay: 2000,
          }
        : {}),
      reject: false,
    });
    return {
      stdout: result.stdout,
      ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
      ...(result.signal !== undefined ? { signal: result.signal } : {}),
      timedOut: result.timedOut,
    };
  };
}
