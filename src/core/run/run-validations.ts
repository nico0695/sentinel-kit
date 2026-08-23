/**
 * Core module: run — use case `runValidations` (spec.md `[E5.F1.H2]`, #32).
 *
 * Turns each declared validation string into a `(command, args)` pair by
 * whitespace splitting, refuses any entry containing a POSIX
 * shell-expansion character (`shell: false` cannot honor them — see
 * `isRejectedChar`), and runs the entries sequentially through
 * `ProcessRunner` against a caller-supplied `cwd`. Every genuine runtime
 * outcome — non-zero exit, an unspawnable binary, a timeout — is recorded
 * as evidence; only a malformed *declaration* (or an invalid computed
 * request) rejects (design.md D-1/D-2, spec.md dec-004).
 *
 * All of the interpretive logic — the tokenizer, the pinned rejection set,
 * the line window, and the byte-exact element format — is pure and
 * module-private, so none of it needs a child process to test (AC-18).
 */

import type {
  ProcessRunner,
  ProcessRunRequest,
  ProcessRunResult,
} from "./ports/process-runner.js";
import { validateProcessRunRequest } from "./process-run-request.js";
import {
  InvalidValidationDeclarationError,
  ProcessSpawnError,
} from "./run-errors.js";

/* ------------------------------------------------------------------ */
/*  Public request / dependency / result shapes                        */
/* ------------------------------------------------------------------ */

export interface RunValidationsRequest {
  /** Declared validation strings, in declaration order. */
  readonly declarations: readonly string[];
  /** Working directory every spawned process runs in (AC-3: the review worktree). */
  readonly cwd: string;
  /** Per-script wall-clock budget, in milliseconds. `DEFAULT_VALIDATION_TIMEOUT_MS` when absent. */
  readonly timeoutMs?: number;
}

export interface RunValidationsDeps {
  readonly processRunner: ProcessRunner;
}

/** One evidence element per declared entry, always the same length as `declarations`. */
export type RunValidationsResult = readonly string[];

/* ------------------------------------------------------------------ */
/*  Module-private constants                                           */
/* ------------------------------------------------------------------ */

/** Fallback per-script timeout when the caller supplies none (spec.md AC-4). */
const DEFAULT_VALIDATION_TIMEOUT_MS = 120_000;

/** Lines retained from the start of an over-long stream (design.md D-6/dec-006). */
const VALIDATION_HEAD_LINES = 100;

/** Lines retained from the end of an over-long stream (design.md D-6/dec-006). */
const VALIDATION_TAIL_LINES = 100;

/** Per-line character backstop applied to every retained line (design.md D-6/dec-006). */
const VALIDATION_MAX_LINE_CHARS = 2_000;

/** Literal marker inserted between the retained head and tail (spec.md AC-15). */
function elisionMarker(elidedCount: number): string {
  return `... [${elidedCount} lines elided by sentinel] ...`;
}

/** Literal suffix appended to a retained line cut at `VALIDATION_MAX_LINE_CHARS` (spec.md D6). */
const LINE_TRUNCATED_SUFFIX = " ... [line truncated]";

/**
 * The pinned rejection set: every character with a meaning in POSIX shell
 * word expansion that `shell: false` cannot honor (spec.md AC-7, design.md
 * D-3). A literal `Set`, never a regex — AC-7 names the mutation
 * (a regex that also rejects `=`) that must fail against this.
 */
const REJECTED_SHELL_CHARS = new Set([
  "|",
  "&",
  ";",
  "<",
  ">",
  "$",
  "`",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "*",
  "?",
  "!",
  "~",
  "#",
  "\\",
  "'",
  '"',
]);

/**
 * `true` for every character in `REJECTED_SHELL_CHARS`, plus every ASCII
 * control character in `U+0000`-`U+001F` and `U+007F` other than tab
 * (`U+0009`, a separator, not a rejection — spec.md R2-8).
 */
function isRejectedChar(ch: string): boolean {
  if (REJECTED_SHELL_CHARS.has(ch)) {
    return true;
  }
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x09) {
    return false;
  }
  return code <= 0x1f || code === 0x7f;
}

/* ------------------------------------------------------------------ */
/*  Tokenizer / pre-flight (design.md D-2: the pre-flight IS the        */
/*  tokenizer, run twice, defined once)                                 */
/* ------------------------------------------------------------------ */

interface DeclarationTokens {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Splits an accepted declaration into `(command, args)` (spec.md AC-6), or
 * throws `InvalidValidationDeclarationError` when the entry contains a
 * rejected character (AC-7) or yields zero tokens after trimming (AC-8).
 *
 * Order (design.md D-3): scan characters first (codepoint-wise, so a
 * surrogate pair is never split into halves that could each look like a
 * control character), then split on runs of space/tab after trimming,
 * then reject a zero-token result.
 */
export function tokenizeDeclaration(entry: string): DeclarationTokens {
  for (const ch of entry) {
    if (isRejectedChar(ch)) {
      const code = ch.codePointAt(0) ?? 0;
      const codepoint = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
      throw new InvalidValidationDeclarationError(
        `Validation declaration "${entry}" contains the character "${ch}" (${codepoint}), which has a meaning in POSIX shell word expansion that sentinel cannot honor (shell: false)`,
      );
    }
  }

  const tokens = entry
    .trim()
    .split(/[ \t]+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new InvalidValidationDeclarationError(
      `Validation declaration "${entry}" is empty or contains no tokens`,
    );
  }

  const command = tokens[0] as string;
  return { command, args: tokens.slice(1) };
}

/**
 * Runs `tokenizeDeclaration` over the whole list before anything spawns
 * (spec.md AC-8/AC-10: a bad entry anywhere in the list — not only at
 * index 0 — rejects before any worktree or process exists). The result is
 * discarded; this function exists to name and reuse the pre-flight rule.
 */
export function validateValidationDeclarations(
  declarations: readonly string[],
): void {
  for (const entry of declarations) {
    tokenizeDeclaration(entry);
  }
}

/* ------------------------------------------------------------------ */
/*  Line window (design.md D-5/D-6)                                    */
/* ------------------------------------------------------------------ */

interface WindowedStream {
  readonly text: string;
  readonly elided: boolean;
}

/** Cuts one retained line to `VALIDATION_MAX_LINE_CHARS`, appending the literal suffix. */
function cutLine(line: string): string {
  if (line.length <= VALIDATION_MAX_LINE_CHARS) {
    return line;
  }
  return `${line.slice(0, VALIDATION_MAX_LINE_CHARS)}${LINE_TRUNCATED_SUFFIX}`;
}

/**
 * Applies D6's head+tail line window to one raw stream. Line semantics
 * pinned per spec.md R2-4: split on `\n` alone (never `\r`); when the
 * stream ends with `\n`, the trailing empty split segment is the
 * newline's own artifact, not a line, so a 200-line stream ending in `\n`
 * (201 split segments) is untouched. A stream within both limits is
 * emitted byte-for-byte unchanged, trailing newline included.
 */
function windowStream(raw: string): WindowedStream {
  const hasTrailingNewline = raw.endsWith("\n");
  const body = hasTrailingNewline ? raw.slice(0, -1) : raw;
  const lines = body.split("\n");

  let kept: readonly string[];
  let elided: boolean;
  if (lines.length > VALIDATION_HEAD_LINES + VALIDATION_TAIL_LINES) {
    const head = lines.slice(0, VALIDATION_HEAD_LINES).map(cutLine);
    const tail = lines.slice(lines.length - VALIDATION_TAIL_LINES).map(cutLine);
    const elidedCount =
      lines.length - VALIDATION_HEAD_LINES - VALIDATION_TAIL_LINES;
    kept = [...head, elisionMarker(elidedCount), ...tail];
    elided = true;
  } else {
    kept = lines.map(cutLine);
    elided = false;
  }

  return {
    text: kept.join("\n") + (hasTrailingNewline ? "\n" : ""),
    elided,
  };
}

/** Windows a stream, substituting the literal `(empty)` before the window ever runs. */
function windowStreamOrEmpty(raw: string): WindowedStream {
  if (raw === "") {
    return { text: "(empty)", elided: false };
  }
  return windowStream(raw);
}

/* ------------------------------------------------------------------ */
/*  Evidence formatting (design.md D-6: explicit concatenation, never   */
/*  `parts.join("\n")` — spec.md R2-5)                                  */
/* ------------------------------------------------------------------ */

/**
 * Appends exactly one trailing `\n` to `body`, unless it already ends with
 * one. `parts.join("\n")` cannot express this rule: joining a body that
 * already ends in `\n` with the next header inserts a spurious blank line.
 */
function terminated(body: string): string {
  return body.endsWith("\n") ? body : `${body}\n`;
}

/**
 * Formats the normal-path evidence element for one declared entry
 * (spec.md AC-14). `truncated` is `true` when either capture flag was set
 * by the adapter, or D6's window elided anything from either stream —
 * `windowStream` is the only producer of `elided`, and this is its only
 * consumer, so the flag composes with no double-processing.
 */
function formatOutcomeElement(entry: string, result: ProcessRunResult): string {
  const out = windowStreamOrEmpty(result.stdout);
  const err = windowStreamOrEmpty(result.stderr);
  const truncated =
    result.stdoutTruncated ||
    result.stderrTruncated ||
    out.elided ||
    err.elided;

  return (
    `$ ${entry}\n` +
    `exit=${result.exitCode ?? "-"} signal=${result.signal ?? "-"} timedOut=${result.timedOut} truncated=${truncated}\n` +
    `--- stdout ---\n${terminated(out.text)}` +
    `--- stderr ---\n${terminated(err.text)}`
  );
}

/**
 * Formats the spawn-failure evidence element for one declared entry
 * (spec.md AC-14, AC-12: `ProcessSpawnError` only). `message` is the
 * error's own `message`, built deterministically by the adapter from the
 * command and errno code.
 */
function formatSpawnFailureElement(entry: string, message: string): string {
  return `$ ${entry}\nspawn-failed\n--- error ---\n${terminated(message)}`;
}

/* ------------------------------------------------------------------ */
/*  Use case                                                           */
/* ------------------------------------------------------------------ */

/**
 * Runs every declared validation sequentially, in declaration order,
 * against `request.cwd`, and returns one evidence element per entry —
 * always the same length as `request.declarations`.
 *
 * Rejects for a malformed declaration (`InvalidValidationDeclarationError`,
 * checked over the whole list before anything spawns) and for an invalid
 * computed request (`InvalidProcessRequestError`, via
 * `validateProcessRunRequest`). A `ProcessSpawnError` is caught per entry
 * and recorded as evidence — it never aborts the run (AC-12). Any other
 * throwable from `deps.processRunner.run` propagates (spec.md R2-1).
 */
export async function runValidations(
  request: RunValidationsRequest,
  deps: RunValidationsDeps,
): Promise<RunValidationsResult> {
  validateValidationDeclarations(request.declarations);
  const timeoutMs = request.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS;

  const elements: string[] = [];
  for (const entry of request.declarations) {
    const { command, args } = tokenizeDeclaration(entry);
    const processRequest: ProcessRunRequest = {
      command,
      args,
      cwd: request.cwd,
      timeoutMs,
    };

    try {
      validateProcessRunRequest(processRequest);
      const result = await deps.processRunner.run(processRequest);
      elements.push(formatOutcomeElement(entry, result));
    } catch (error: unknown) {
      if (error instanceof ProcessSpawnError) {
        elements.push(formatSpawnFailureElement(entry, error.message));
        continue;
      }
      throw error;
    }
  }

  return elements;
}
