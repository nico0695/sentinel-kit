/**
 * Driven adapter: opencode — the `ReviewEngine` factory that wires the
 * deny-permission config lifecycle, the pre-flight check, the real review
 * invocation, and NDJSON outcome extraction into one `review()` call (PRD
 * §4.2, spec.md AC-1 through AC-25). Orchestration only: process spawning
 * lives in `process-runner.ts`, NDJSON parsing/outcome rules in
 * `envelope.ts`, typed errors in `errors.ts`, the `OPENCODE_CONFIG`
 * temp-file lifecycle in `permission-config.ts` — this file composes them.
 */
import type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
} from "../../../../core/run/index.js";
import { extractOutcome, parseNdjsonLines } from "./envelope.js";
import { OpenCodeReviewError, OpenCodeUnavailableError } from "./errors.js";
import { createDenyConfigFile } from "./permission-config.js";
import {
  createDefaultRunProcess,
  type OpenCodeProcessResult,
  type OpenCodeProcessRunner,
} from "./process-runner.js";

const DEFAULT_BINARY_PATH = "opencode";

/**
 * AC-25 (spec Amendment 1): reject a review whose process did not exit
 * cleanly, even when its partial stdout happened to parse into
 * usable-looking output.
 *
 * Without this gate, a run killed mid-flight (SIGTERM/SIGKILL, OOM,
 * container eviction) or crashing with a non-zero exit resolves as a
 * COMPLETE review — and because `opencode` emits the `VERDICT:` line in its
 * FIRST text chunk, the truncated result keeps a confident verdict while
 * silently dropping the findings that justified it.
 *
 * Check order is normative, not cosmetic: a timeout kill sets both
 * `timedOut` and `signal`, and any signal termination leaves `exitCode`
 * undefined — so testing `exitCode` first would report the useless
 * "exited with code undefined" instead of naming the real cause.
 *
 * Called only AFTER `extractOutcome` has had its chance to throw, so the
 * specific stdout-derived diagnostics (AC-15/16/17 — `ContextOverflowError`,
 * the `opencode models` hint) are never masked by this generic message.
 */
function assertCleanExit(result: OpenCodeProcessResult): void {
  if (result.timedOut) {
    throw new OpenCodeReviewError(
      "opencode: review timed out; output is incomplete",
    );
  }
  if (result.signal !== undefined) {
    throw new OpenCodeReviewError(
      `opencode: review terminated by signal ${result.signal}; output is incomplete`,
    );
  }
  if (result.exitCode !== 0) {
    throw new OpenCodeReviewError(
      `opencode: review exited with code ${result.exitCode}; output is incomplete`,
    );
  }
}

/**
 * Short, fixed budget for the `opencode --version` pre-flight check.
 * Deliberately NOT derived from `request.timeoutMs` — a hung pre-check must
 * not be able to consume the review's own timeout budget. Same value and
 * rationale as the claude-code adapter's `PREFLIGHT_TIMEOUT_MS`.
 */
const PREFLIGHT_TIMEOUT_MS = 5_000;

/** Factory options for `createOpenCodeAdapter`. */
export interface OpenCodeAdapterOptions {
  /** Path/name of the `opencode` binary to invoke. Default `"opencode"`. */
  readonly binaryPath?: string;
  /**
   * Provider/model identifier passed via `-m`. REQUIRED — unlike the
   * claude-code adapter's `model`, there is no safe engine-wide default:
   * without an explicit flag, `opencode run` picks a default that depends
   * on local state (`docs/engines/opencode.md`).
   */
  readonly model: string;
  /**
   * Injectable process runner — the sole binary-mocking seam.
   * Defaults to an `execa`-backed runner bound to the resolved
   * `binaryPath`.
   */
  readonly runProcess?: OpenCodeProcessRunner;
}

/**
 * Create a `ReviewEngine` backed by the `opencode` CLI. Factory function,
 * no class — mirrors `createClaudeCodeAdapter`'s pattern.
 *
 * Defaults (`binaryPath`, `runProcess`) and the required `model` are
 * resolved once here, into local `const`s closed over by `review()` —
 * never re-read per call.
 */
export function createOpenCodeAdapter(
  options: OpenCodeAdapterOptions,
): ReviewEngine {
  const binaryPath = options.binaryPath ?? DEFAULT_BINARY_PATH;
  const model = options.model;
  const runProcess: OpenCodeProcessRunner =
    options.runProcess ?? createDefaultRunProcess(binaryPath);

  return {
    /**
     * Run one review. Every `opencode` invocation — pre-flight and real —
     * runs with `OPENCODE_CONFIG` set to a fresh, per-call deny-permission
     * temp file: `opencode run` writes files by default, so this adapter
     * must never spawn it without the deny config.
     *
     * 1. Create the deny-permission config file.
     * 2. Pre-flight (`opencode --version`): confirms the binary is
     *    present and runnable, bounded by `PREFLIGHT_TIMEOUT_MS` (not
     *    `request.timeoutMs`). A rejection or non-zero exit here means the
     *    real review is NEVER issued — `review()` rejects with
     *    `OpenCodeUnavailableError`.
     * 3. Real invocation (`run -m <model> --format json`): prompt on
     *    stdin, never argv; bounded by `request.timeoutMs`, with
     *    SIGTERM-then-SIGKILL escalation owned by the `runProcess`
     *    implementation.
     * 4. Parse stdout as NDJSON (`parseNdjsonLines`) and extract the
     *    outcome (`extractOutcome`) — yields a `ReviewResult` or throws
     *    `OpenCodeInvocationError`/`OpenCodeReviewError` (AC-15/16/17).
     * 5. Gate on process status (`assertCleanExit`, AC-25): a run that
     *    timed out, was signal-terminated, or exited non-zero rejects even
     *    when step 4 produced usable-looking output. Deliberately ordered
     *    after step 4 so its specific diagnostics win.
     * 6. The deny-config temp file is always removed (`finally`),
     *    regardless of outcome.
     *
     * Every failure path is a `throw` directly inside this `async
     * function` — a synchronous throw inside an `async function` always
     * becomes a Promise rejection, so the function never throws
     * synchronously to its caller.
     */
    async review(request: ReviewRequest): Promise<ReviewResult> {
      const config = await createDenyConfigFile();
      try {
        const env = { OPENCODE_CONFIG: config.path };

        let preflight: Awaited<ReturnType<OpenCodeProcessRunner>>;
        try {
          preflight = await runProcess(["--version"], {
            cwd: request.worktree.path,
            timeoutMs: PREFLIGHT_TIMEOUT_MS,
            env,
          });
        } catch (raw) {
          const cause = raw instanceof Error ? raw : new Error(String(raw));
          throw new OpenCodeUnavailableError(
            `opencode: pre-flight check failed to run: ${cause.message}`,
          );
        }
        if (preflight.exitCode !== 0) {
          throw new OpenCodeUnavailableError(
            `opencode: pre-flight check exited with code ${preflight.exitCode}`,
          );
        }

        const result = await runProcess(
          ["run", "-m", model, "--format", "json"],
          {
            cwd: request.worktree.path,
            input: request.prompt,
            timeoutMs: request.timeoutMs,
            env,
          },
        );

        const events = parseNdjsonLines(result.stdout);
        const outcome = extractOutcome(events);
        assertCleanExit(result);
        return outcome;
      } finally {
        await config.cleanup();
      }
    },
  };
}
