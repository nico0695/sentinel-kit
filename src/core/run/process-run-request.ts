/**
 * Core module: run — pre-flight for `ProcessRunRequest` (spec.md AC-13).
 *
 * Mirrors `runReview`'s own request pre-flight style (`run-review.ts`,
 * "request" stage): one guard clause per rule, throwing immediately.
 *
 * Deliberately does NOT check `cwd` absoluteness (design.md D-2): that check
 * needs `node:path`, which the `core-no-io-libs` guard forbids in core, so it
 * is the adapter's job — the same split `run-review.ts` already documents for
 * `RunReviewRequest.repoPath` ("Absoluteness is validated by
 * `createReviewWorktree`, deliberately not re-validated here").
 */

import type { ProcessRunRequest } from "./ports/process-runner.js";
import { InvalidProcessRequestError } from "./run-errors.js";

/**
 * Throws `InvalidProcessRequestError` when `request` is malformed. Never
 * spawns anything and never inspects `cwd` beyond emptiness — see the module
 * doc for why absoluteness is out of scope here.
 */
export function validateProcessRunRequest(request: ProcessRunRequest): void {
  if (request.command.trim() === "") {
    throw new InvalidProcessRequestError("command must not be empty");
  }
  if (request.cwd === "") {
    throw new InvalidProcessRequestError("cwd must not be empty");
  }
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
    throw new InvalidProcessRequestError(
      "timeoutMs must be a finite number greater than 0",
    );
  }
  if (
    request.maxOutputChars !== undefined &&
    (!Number.isFinite(request.maxOutputChars) || request.maxOutputChars <= 0)
  ) {
    throw new InvalidProcessRequestError(
      "maxOutputChars must be a finite number greater than 0 when present",
    );
  }
  if (request.inheritEnv === false && request.env === undefined) {
    throw new InvalidProcessRequestError(
      "env must be provided when inheritEnv is false (execa's extendEnv:false alone still inherits the full parent environment when no env is given)",
    );
  }
}
