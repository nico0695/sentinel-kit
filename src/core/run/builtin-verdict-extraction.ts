/**
 * Core module: run — the built-in `VerdictParser` implementation.
 *
 * Defensive against real engine output: it scans only a bounded tail window
 * of the raw output (at most the full input — a no-op on outputs shorter
 * than the window, see `computeTailWindow`), strips narrow ANSI SGR color
 * codes before matching, and tolerates markdown-fence wrapping and prose
 * surrounding the marker line. It stays case-sensitive and exact — no fuzzy
 * or fold-cased matching. Hardened by `[E4.F1.H2]` (#27), which replaced the
 * H1 naive scan with this implementation through the `deps.parseVerdict`
 * seam, without touching `runReview`.
 *
 * Module-private in the sense that matters here: never re-exported from the
 * module's public `index.ts` (AC-16, restated by H2 as AC-13). The
 * file-level `export` exists only so `run-review.ts` can use it as the
 * default parser.
 */

import type { Verdict } from "./verdict.js";

/** Anchored, case-sensitive marker. Applied to an already trimmed line. */
const VERDICT_LINE = /^VERDICT:\s*(approve|request-changes|comment)$/;

/** Rule 1 window bounds: last 30 lines, last 2000 characters. */
const TAIL_LINES = 30;
const TAIL_CHARS = 2000;

/**
 * Rule 1 (provenance): the union of the last `TAIL_LINES` lines and the last
 * `TAIL_CHARS` characters of `raw`, whichever span is longer by character
 * count. At most the full input; a no-op (returns `raw` unchanged) when
 * `raw` is shorter than both thresholds.
 *
 * Tie-break: on exactly equal length, `tailByLines` wins (the `>` below is
 * strict). This is provably immaterial, not a conservative default: both
 * candidates are suffixes of the same raw string (`split`/`join` on `"\n"`
 * round-trips exactly, and `slice(-N)` is a suffix by construction), and two
 * suffixes of one string with equal length are necessarily identical in
 * content. There is no input for which the tie-break's direction changes the
 * result.
 */
function computeTailWindow(raw: string): string {
  const tailByLines = lastNLines(raw, TAIL_LINES);
  const tailByChars = raw.slice(-TAIL_CHARS);
  return tailByChars.length > tailByLines.length ? tailByChars : tailByLines;
}

/**
 * The last `n` lines of `raw`, equivalent to
 * `raw.split("\n").slice(-n).join("\n")` but without allocating an array or
 * a copy for every line in `raw` — it scans backward from the end for the
 * n-th newline and slices once. Large outputs (the case this optimization
 * targets) no longer pay an O(length) split just to keep a 30-line tail.
 */
function lastNLines(raw: string, n: number): string {
  let searchEnd = raw.length;
  for (let i = 0; i < n; i++) {
    // Guard BEFORE calling lastIndexOf: a negative fromIndex is clamped to 0
    // by the spec rather than reported as "not found", so searchEnd === 0
    // must be treated as exhausted here, not fed to lastIndexOf again.
    if (searchEnd <= 0) {
      return raw;
    }
    const found = raw.lastIndexOf("\n", searchEnd - 1);
    if (found === -1) {
      return raw; // fewer than n newlines total: the whole input is <= n lines
    }
    searchEnd = found;
  }
  return raw.slice(searchEnd + 1);
}

/**
 * Rule 5: strips narrow ANSI SGR (Select Graphic Rendition) escape sequences
 * (`\x1b[<params>m`) from `window`. No other CSI sequences (cursor movement,
 * erase, etc.) are recognized or removed, and no general terminal emulation
 * is attempted. Global replace — a window may contain more than one SGR
 * code.
 */
function stripAnsiSgr(window: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the ESC (0x1b) control byte is the literal, deliberate target of rule 5 — SGR escape sequences begin with it by definition.
  return window.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Rules 2, 3, 6: splits `stripped` on `\n`, trims each line, matches the
 * unchanged marker regex against each trimmed line, and collects every
 * distinct matched value. Fence tolerance and whole-window scanning require
 * no special-case code here — they fall out of "check every trimmed line,
 * don't special-case what surrounds it."
 */
function collectDistinctVerdicts(stripped: string): Set<Verdict> {
  const found = new Set<Verdict>();
  for (const line of stripped.split("\n")) {
    const match = VERDICT_LINE.exec(line.trim());
    if (match !== null) {
      found.add(match[1] as Verdict);
    }
  }
  return found;
}

/**
 * Extracts the single distinct verdict from raw engine output.
 *
 * Pipeline: normalize the input defensively, compute the tail window on the
 * raw (unstripped) string, strip ANSI SGR codes within that window, then
 * scan every trimmed line of the stripped window for the marker.
 *
 * Returns the verdict when exactly one DISTINCT value is found in the
 * scanned window — repeated identical markers collapse to that one value.
 * Returns `null` when zero markers match or when two conflicting values are
 * present (fail-closed contradiction rule, inherited from H1, now scoped to
 * the tail window instead of the whole output); `runReview` turns `null`
 * into the `ambiguous` terminal state. Never throws.
 */
export function extractBuiltInVerdict(output: string): Verdict | null {
  const raw = typeof output === "string" ? output : String(output ?? "");
  const window = computeTailWindow(raw);
  const stripped = stripAnsiSgr(window);
  const found = collectDistinctVerdicts(stripped);
  const [only] = [...found];
  return found.size === 1 && only !== undefined ? only : null;
}
