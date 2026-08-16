/**
 * Driven adapter: opencode — the `runProcess` injection seam and its
 * `execa`-backed default (PRD §4.2). Pure process-spawning plumbing: no
 * `ReviewResult`/`ReviewUsage` knowledge, no NDJSON parsing, no typed-error
 * construction — those live in `envelope.ts`/`errors.ts` and are composed
 * on top of this seam by `opencode-adapter.ts`.
 */
import { execa } from "execa";

/** Options passed to an `OpenCodeProcessRunner` invocation. */
export interface OpenCodeProcessRunOptions {
  readonly cwd: string;
  /** stdin payload; absent for the `--version` pre-check. */
  readonly input?: string;
  /** 0/absent semantics: no timeout enforced by the runner itself. */
  readonly timeoutMs: number;
  /**
   * ALWAYS carries `OPENCODE_CONFIG` (AC-7). Required, not optional — a
   * deliberate divergence from the claude-code adapter's process-runner
   * (which has no `env` field at all): making it required closes off the
   * "forgot to inject the deny config on this call site" hazard at
   * compile time rather than relying on test coverage to catch it.
   */
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Narrow process-invocation seam. Resolves for both a clean exit AND a
 * non-zero/signal-terminated exit — the adapter branches on
 * `exitCode`/`signal`, it does not rely on rejection to detect process
 * failure. Only a genuine spawn failure (ENOENT, permission denied)
 * REJECTS. This is the sole binary-mocking seam for the opencode adapter:
 * a test double is a plain async function literal, no `PATH` shimming or
 * `execa` monkey-patching required.
 */
export type OpenCodeProcessRunner = (
  args: readonly string[],
  options: OpenCodeProcessRunOptions,
) => Promise<OpenCodeProcessResult>;

/** Result of an `OpenCodeProcessRunner` invocation. */
export interface OpenCodeProcessResult {
  readonly stdout: string;
  /** undefined when terminated by a signal. */
  readonly exitCode?: number;
  /** e.g. "SIGTERM" / "SIGKILL"; undefined on a clean exit. */
  readonly signal?: string;
  /** execa's own `timedOut` — true iff its own `timeout` option fired. */
  readonly timedOut: boolean;
}

/**
 * Factory: returns an `OpenCodeProcessRunner` backed by `execa`, closing
 * over `binaryPath`. Mirrors the claude-code adapter's
 * `createDefaultRunProcess` naming and shape exactly, extended only with
 * the `env` passthrough.
 *
 * **Resolve-not-reject design choice.** Same as the claude-code adapter:
 * `execa`'s default `reject: true` behavior throws an `ExecaError` on
 * non-zero exit or signal termination, but that error object carries the
 * same fields (`stdout`, `exitCode`, `signal`, `timedOut`) as a success
 * `Result`. Calling execa with `{ reject: false }` and returning its
 * `Result` directly in every case (except a genuine spawn failure) keeps
 * the seam's contract simple for a fixture-replaying test double.
 *
 * **`env` passthrough.** Passed straight to execa's own `env` option;
 * execa merges it onto `process.env` by default (`extendEnv: true`), so
 * this never needs to manually spread `process.env` itself.
 *
 * **Timeout wiring.** Identical to the claude-code adapter's resolution of
 * this same question: `timeout: timeoutMs` unchanged (not shortened) plus
 * an explicit `forceKillAfterDelay: 2000` (overriding execa's 5000ms
 * default), reused rather than re-derived — see design.md's Alternatives
 * And Trade-Offs.
 */
export function createDefaultRunProcess(
  binaryPath: string,
): OpenCodeProcessRunner {
  return async (
    args: readonly string[],
    { cwd, input, timeoutMs, env }: OpenCodeProcessRunOptions,
  ): Promise<OpenCodeProcessResult> => {
    const result = await execa(binaryPath, args, {
      cwd,
      env,
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
