/**
 * Driven adapter: claude-code — pure JSON-envelope parsing/extraction
 * helpers (PRD §4.2). No I/O, no execa dependency — a self-contained,
 * independently-testable transformation from the `claude` CLI's
 * `--output-format json` envelope to the port's `ReviewResult` shape.
 */
import type { ReviewResult, ReviewUsage } from "../../../../core/run/index.js";
import { ClaudeCodeInvocationError } from "./errors.js";

/** Minimal shape of the `claude` CLI's JSON envelope this adapter reads. */
export interface ClaudeCodeEnvelope {
  readonly is_error: boolean;
  readonly result?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
  readonly errors?: readonly string[];
}

/** Parses stdout; throws ClaudeCodeInvocationError on malformed/empty JSON (AC-8). */
export function parseEnvelope(stdout: string): ClaudeCodeEnvelope {
  try {
    return JSON.parse(stdout) as ClaudeCodeEnvelope;
  } catch (raw) {
    throw new ClaudeCodeInvocationError(
      "claude-code: failed to parse review output as JSON",
      { cause: raw },
    );
  }
}

/** Extracts { output, usage? } for the is_error:false path (AC-9, AC-10, AC-11, AC-12); throws ClaudeCodeInvocationError if `.result` is missing/non-string. */
export function extractSuccess(envelope: ClaudeCodeEnvelope): ReviewResult {
  if (typeof envelope.result !== "string") {
    throw new ClaudeCodeInvocationError(
      "claude-code: review output is missing a string `.result`",
    );
  }

  const inputTokens = envelope.usage?.input_tokens;
  const outputTokens = envelope.usage?.output_tokens;
  const hasUsage =
    typeof inputTokens === "number" && typeof outputTokens === "number";

  if (!hasUsage) {
    return { output: envelope.result };
  }

  const usage: ReviewUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
  return { output: envelope.result, usage };
}

/** Builds the ClaudeCodeReviewError message for the is_error:true path (AC-13): `.result` when present, else a fallback citing exit code/signal from `processResult`. */
export function buildReviewErrorMessage(
  envelope: ClaudeCodeEnvelope,
  processResult: { readonly signal?: string; readonly exitCode?: number },
): string {
  if (typeof envelope.result === "string" && envelope.result.length > 0) {
    return envelope.result;
  }

  if (processResult.signal !== undefined) {
    return `claude-code: review failed with no result (terminated by signal ${processResult.signal})`;
  }
  if (processResult.exitCode !== undefined) {
    return `claude-code: review failed with no result (exit code ${processResult.exitCode})`;
  }
  return "claude-code: review failed with no result";
}
