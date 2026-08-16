/**
 * Driven adapter: opencode — pure NDJSON event-stream parsing/outcome
 * extraction helpers (PRD §4.2). No I/O, no execa dependency — a
 * self-contained, independently-testable transformation from the
 * `opencode` CLI's `--format json` event stream to the port's
 * `ReviewResult` shape.
 */
import type { ReviewResult, ReviewUsage } from "../../../../core/run/index.js";
import { OpenCodeInvocationError, OpenCodeReviewError } from "./errors.js";

/** `type: "text"` event's `part` shape — the only fields this adapter reads. */
export interface OpenCodeTextPart {
  readonly type: "text";
  readonly text: string;
}

/** `type: "step_finish"` event's `part` shape — the only fields this adapter reads. */
export interface OpenCodeFinishPart {
  readonly type: "step-finish";
  readonly tokens?: {
    readonly input?: number;
    readonly output?: number;
  };
}

/** One line of the `opencode run --format json` NDJSON stream, minimally typed. */
export interface OpenCodeEvent {
  readonly type: string;
  readonly part?:
    | OpenCodeTextPart
    | OpenCodeFinishPart
    | Record<string, unknown>;
  readonly error?: {
    readonly name: string;
    readonly data?: {
      readonly message?: string;
    };
  };
}

/**
 * Splits stdout on `\n`; JSON.parse's each non-empty line; silently drops
 * any line that fails to parse (AC-10) — covers both a genuinely truncated
 * final line and stray non-JSON noise. Never throws.
 */
export function parseNdjsonLines(stdout: string): readonly OpenCodeEvent[] {
  const events: OpenCodeEvent[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      events.push(JSON.parse(line) as OpenCodeEvent);
    } catch {
      // Silently dropped per AC-10 — no single exception worth preserving.
    }
  }
  return events;
}

function isTextEvent(event: OpenCodeEvent): boolean {
  return event.type === "text";
}

function isFinishEvent(event: OpenCodeEvent): boolean {
  return event.type === "step_finish" || event.type === "step-finish";
}

function textOf(event: OpenCodeEvent): string {
  const part = event.part;
  if (part !== undefined && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function tokensOf(
  event: OpenCodeEvent,
): { readonly input?: number; readonly output?: number } | undefined {
  const part = event.part;
  if (part !== undefined && "tokens" in part) {
    const tokens = (part as OpenCodeFinishPart).tokens;
    if (tokens !== undefined) return tokens;
  }
  return undefined;
}

/**
 * Implements AC-15..AC-18's outcome rules over an already-parsed event
 * list. Exactly three `throw` statements, no others:
 * - `events.length === 0`        -> `OpenCodeInvocationError` (AC-15)
 * - any `event.type === "error"` -> `OpenCodeReviewError` (AC-16)
 * - concatenated output `""`     -> `OpenCodeReviewError`, fallback (AC-17)
 */
export function extractOutcome(events: readonly OpenCodeEvent[]): ReviewResult {
  if (events.length === 0) {
    throw new OpenCodeInvocationError(
      "opencode: review output did not parse as NDJSON (unknown model or missing credentials both produce this — run `opencode models` to check)",
    );
  }

  const errorEvent = events.find((event) => event.type === "error");
  if (errorEvent?.error !== undefined) {
    const name = errorEvent.error.name;
    const message = errorEvent.error.data?.message;
    throw new OpenCodeReviewError(
      message !== undefined ? `${name}: ${message}` : name,
    );
  }

  const output = events.filter(isTextEvent).map(textOf).join("");
  if (output.length === 0) {
    throw new OpenCodeReviewError(
      "opencode: review produced no output (stream ended with no text event)",
    );
  }

  const finishEvents = events.filter(isFinishEvent);
  const lastFinish = finishEvents.at(-1);
  const tokens = lastFinish !== undefined ? tokensOf(lastFinish) : undefined;
  const inputTokens = tokens?.input;
  const outputTokens = tokens?.output;

  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return { output };
  }

  const usage: ReviewUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
  return { output, usage };
}
