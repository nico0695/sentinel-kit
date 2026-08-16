/**
 * Driven adapter: claude-code — the `ReviewEngine` factory that wires the
 * pre-flight check, the real review invocation, envelope parsing, and
 * error translation into one `review()` call (PRD §4.2, spec.md AC-1
 * through AC-7). Orchestration only: process spawning lives in
 * `process-runner.ts`, envelope parsing in `envelope.ts`, typed errors in
 * `errors.ts` — this file composes the three.
 */
import type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
} from "../../../../core/run/index.js";
import {
  buildReviewErrorMessage,
  extractSuccess,
  parseEnvelope,
} from "./envelope.js";
import { ClaudeCodeReviewError, ClaudeCodeUnavailableError } from "./errors.js";
import {
  type ClaudeCodeProcessRunner,
  createDefaultRunProcess,
} from "./process-runner.js";

const DEFAULT_BINARY_PATH = "claude";
const DEFAULT_MODEL = "sonnet";

/**
 * Short, fixed budget for the `claude --version` pre-flight check (AC-15).
 * Deliberately NOT derived from `request.timeoutMs` — a hung pre-check must
 * not be able to consume the review's own timeout budget, and 5s is ample
 * for a local, non-network version check even on a cold start.
 */
const PREFLIGHT_TIMEOUT_MS = 5_000;

/** Factory options for `createClaudeCodeAdapter`. */
export interface ClaudeCodeAdapterOptions {
  /** Path/name of the `claude` binary to invoke. Default `"claude"`. */
  readonly binaryPath?: string;
  /** Model identifier passed via `--model`. Default `"sonnet"`. */
  readonly model?: string;
  /**
   * Injectable process runner — the sole binary-mocking seam (AC-20).
   * Defaults to an `execa`-backed runner bound to the resolved
   * `binaryPath`.
   */
  readonly runProcess?: ClaudeCodeProcessRunner;
}

/**
 * Create a `ReviewEngine` backed by the `claude` CLI. Factory function, no
 * class (AC-1) — mirrors `git-cli.ts`'s `createGitCliAdapter` pattern.
 *
 * Defaults (`binaryPath`, `model`, `runProcess`) are resolved once here,
 * into local `const`s closed over by `review()` — never re-read per call
 * (mirrors `git-cli.ts`'s pattern of closing over adapter-scoped config).
 */
export function createClaudeCodeAdapter(
  options?: ClaudeCodeAdapterOptions,
): ReviewEngine {
  const binaryPath = options?.binaryPath ?? DEFAULT_BINARY_PATH;
  const model = options?.model ?? DEFAULT_MODEL;
  const runProcess: ClaudeCodeProcessRunner =
    options?.runProcess ?? createDefaultRunProcess(binaryPath);

  return {
    /**
     * Run one review. Two process invocations, in order, inside this one
     * async call:
     *
     * 1. Pre-flight (`claude --version`, AC-5/AC-6/AC-15): confirms the
     *    binary is present and runnable, bounded by `PREFLIGHT_TIMEOUT_MS`
     *    (not `request.timeoutMs`). A rejection or non-zero exit here means
     *    the real review is NEVER issued — `review()` rejects with
     *    `ClaudeCodeUnavailableError`. This check performs no auth
     *    handshake (AC-7): it catches "missing", not "unauthenticated" —
     *    an unauthenticated caller is only recognized once the real
     *    invocation's own response reveals it (`.is_error`, AC-13). A
     *    dummy-prompt auth pre-probe was deliberately rejected (adds cost
     *    and latency to every call, never validated by the spike).
     * 2. Real invocation (`-p --model <model> --output-format json`,
     *    AC-3/AC-4): prompt on stdin, never argv; bounded by
     *    `request.timeoutMs`, with SIGTERM-then-SIGKILL escalation owned by
     *    the `runProcess` implementation (AC-16/AC-17).
     *
     * Its stdout is then parsed (`parseEnvelope`, AC-8/AC-14) and branched
     * on `.is_error`: `true` rejects with `ClaudeCodeReviewError`
     * (AC-13/AC-18, message from `buildReviewErrorMessage`); `false`
     * resolves with `extractSuccess`'s `ReviewResult` (AC-9 through AC-12).
     *
     * Every failure path is a `throw` directly inside this `async
     * function` (AC-23) — a synchronous throw inside an `async function`
     * always becomes a Promise rejection, so the function never throws
     * synchronously to its caller.
     */
    async review(request: ReviewRequest): Promise<ReviewResult> {
      let preflight: Awaited<ReturnType<ClaudeCodeProcessRunner>>;
      try {
        preflight = await runProcess(["--version"], {
          cwd: request.worktree.path,
          timeoutMs: PREFLIGHT_TIMEOUT_MS,
        });
      } catch (raw) {
        const cause = raw instanceof Error ? raw : new Error(String(raw));
        throw new ClaudeCodeUnavailableError(
          `claude-code: pre-flight check failed to run: ${cause.message}`,
        );
      }
      if (preflight.exitCode !== 0) {
        throw new ClaudeCodeUnavailableError(
          `claude-code: pre-flight check exited with code ${preflight.exitCode}`,
        );
      }

      const result = await runProcess(
        ["-p", "--model", model, "--output-format", "json"],
        {
          cwd: request.worktree.path,
          input: request.prompt,
          timeoutMs: request.timeoutMs,
        },
      );

      const envelope = parseEnvelope(result.stdout);

      if (envelope.is_error) {
        throw new ClaudeCodeReviewError(
          buildReviewErrorMessage(envelope, result),
        );
      }

      return extractSuccess(envelope);
    },
  };
}
