/**
 * Driven adapter: exec — `createExecProcessRunner()`, the impure shell that
 * wires the pinned `execa` option bag (spec.md revision 2's In Scope table)
 * to `classifyExecaResult` (design.md D-3). Everything non-trivial about
 * turning execa's single resolved value into a `ProcessRunResult` lives in
 * that pure classifier — this file only validates, spawns, times, and hands
 * off.
 */
import { isAbsolute } from "node:path";
import { execa } from "execa";
import {
  InvalidProcessRequestError,
  type ProcessRunner,
  type ProcessRunRequest,
  type ProcessRunResult,
  validateProcessRunRequest,
} from "../../../core/run/index.js";
import { classifyExecaResult } from "./classify-execa-result.js";

/**
 * Adapter-owned default for `maxOutputChars` when the request omits it
 * (spec.md Interface Notes — the port declares the knob, the adapter picks
 * the number, mirroring `PREFLIGHT_TIMEOUT_MS`). execa counts in UTF-16
 * characters, not bytes; 1M chars comfortably covers a verbose validation's
 * output while still bounding what reaches a token-budgeted prompt.
 */
const DEFAULT_MAX_OUTPUT_CHARS = 1_000_000;

/**
 * Grace window between the graceful `SIGTERM` and the hard `SIGKILL` that
 * reaps a `SIGTERM`-trapping child (AC-1). Matches the value the
 * `claude-code` engine seam already uses
 * (`engines/claude-code/process-runner.ts`) for consistency across the two
 * execa call sites that set a timeout.
 */
const FORCE_KILL_AFTER_DELAY_MS = 2000;

/**
 * Factory: returns a fresh `ProcessRunner` backed by the local `execa`
 * dependency. Mirrors `createGitCliAdapter`'s naming convention
 * (`create<Thing>`).
 */
export function createExecProcessRunner(): ProcessRunner {
  return {
    async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
      validateProcessRunRequest(request);

      // Absoluteness needs `node:path`, which core-no-io-libs forbids in
      // core (design.md D-2) — the adapter checks it here, throwing the
      // core-owned error so the type stays uniform regardless of which
      // half caught it. Matches `git-cli.ts`'s `isAbsolute` precedent.
      if (!isAbsolute(request.cwd)) {
        throw new InvalidProcessRequestError(
          `cwd must be absolute (received: ${request.cwd})`,
        );
      }

      const budget = request.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

      const startedAt = Date.now();
      const result = await execa(request.command, request.args, {
        cwd: request.cwd,
        reject: false,
        shell: false,
        timeout: request.timeoutMs,
        killSignal: "SIGTERM",
        forceKillAfterDelay: FORCE_KILL_AFTER_DELAY_MS,
        maxBuffer: { stdout: budget, stderr: budget },
        stripFinalNewline: false,
        ...(request.env !== undefined ? { env: request.env } : {}),
      });
      const elapsedMs = Date.now() - startedAt;

      return classifyExecaResult(
        {
          stdout: result.stdout,
          stderr: result.stderr,
          ...(result.exitCode !== undefined
            ? { exitCode: result.exitCode }
            : {}),
          ...(result.signal !== undefined ? { signal: result.signal } : {}),
          isMaxBuffer: result.isMaxBuffer,
          ...(result.code !== undefined ? { code: result.code } : {}),
          command: request.command,
          args: request.args,
          cwd: request.cwd,
        },
        budget,
        request.timeoutMs,
        elapsedMs,
      );
    },
  };
}
