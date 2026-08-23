/**
 * Core module: run — driven port `ProcessRunner` (PRD §4.3).
 *
 * Runs an arbitrary command with a timeout and captures its output. It never
 * knows about repo config, declared validations, or an allowlist — that
 * provenance decision belongs to `[E5.F1.H2]` (spec.md D1). `command` and
 * `args` are always separate: the implementing adapter never invokes a shell
 * (D3), so injection through an argument is impossible by shape, not by
 * escaping.
 *
 * Adapters implement this port in `src/adapters/driven/exec/*`; the core
 * never knows which process-execution library runs underneath.
 */
export interface ProcessRunner {
  /**
   * Run one process to completion (or until `timeoutMs` elapses) and return
   * its captured result. Resolves for every process that actually ran —
   * including a non-zero exit (D3, AC-10) — and rejects only when the
   * request was malformed (`InvalidProcessRequestError`) or the process
   * never ran at all (`ProcessSpawnError`).
   */
  run(request: ProcessRunRequest): Promise<ProcessRunResult>;
}

/** Invocation input: what to run, where, and under what budget. */
export interface ProcessRunRequest {
  /** Binary or command name. Never shell-interpreted. */
  readonly command: string;
  /** Arguments passed verbatim, never joined into a shell string. */
  readonly args: readonly string[];
  /** Working directory the child runs in. Must be absolute (adapter-checked, D-2). */
  readonly cwd: string;
  /** Hard wall-clock budget for the invocation, in milliseconds. */
  readonly timeoutMs: number;
  /** Overlaid on top of the inherited parent environment, never a replacement (D2). */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Whether the child inherits the reviewing process's own environment.
   * `true` or absent (default): unchanged `[E5.F1.H1]` D2 behavior — `env`,
   * when present, overlays the full inherited parent environment. `false`:
   * the child receives ONLY `env` — the parent environment is not visible to
   * it at all. `env` MUST be present when this is `false`
   * (`InvalidProcessRequestError` otherwise, D2-amend below) — execa's own
   * `extendEnv:false` is a no-op without an accompanying `env`, empirically
   * confirmed (design.md Amendment 1, A-1), so this guard is not optional
   * hardening, it is what makes the field safe to expose at all.
   */
  readonly inheritEnv?: boolean;
  /** Per-stream capture budget, in characters (execa's own unit — not bytes). Adapter-defaulted when absent. */
  readonly maxOutputChars?: number;
}

/** Invocation output: captured streams plus how the process actually ended. */
export interface ProcessRunResult {
  /** Full stdout, up to `maxOutputChars`. */
  readonly stdout: string;
  /** Full stderr, captured independently of stdout, up to `maxOutputChars`. */
  readonly stderr: string;
  /** Present when the process exited normally; absent when killed by a signal. */
  readonly exitCode?: number;
  /** Present when the process was terminated by a signal; absent on a normal exit. */
  readonly signal?: string;
  /** `true` when `timeoutMs` elapsed and the process was terminated as a result. */
  readonly timedOut: boolean;
  /** `true` when stdout was cut off at `maxOutputChars`. */
  readonly stdoutTruncated: boolean;
  /** `true` when stderr was cut off at `maxOutputChars`. */
  readonly stderrTruncated: boolean;
}
