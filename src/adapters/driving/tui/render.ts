/**
 * Driving adapter: tui — result rendering (`[E6.F2.H2]`, #39; AC-1..AC-7,
 * AC-12, AC-14, AC-18, AC-19).
 *
 * The whole module is pure: strings in, strings out. It holds no state,
 * touches no stream, reads no `process` and knows nothing about a terminal —
 * `tui-flow.ts` owns the writing, `colors.ts` owns the only terminal library
 * import, and every renderer here takes its palette as a required argument so
 * nothing can silently inherit `picocolors`' ambient, load-time colour
 * decision.
 *
 * Two surfaces: {@link formatResultDigest}, the compact block the result step
 * always shows, and {@link formatFullView}, the engine's own markdown emitted
 * verbatim behind the opt-in prompt. Findings are recognized by the
 * `[SEV: …]` heuristic in `findings.ts`, decoration is chosen per fact, and
 * every coloured fact is also plain text on the same line — stripping the
 * colour loses nothing.
 *
 * **Engine text is untrusted, and this module is where the order that makes
 * it safe is written down** (Amendment 1 §A-3; AC-18, AC-19). Every
 * engine-derived string — the finding text, the full view, and the failure
 * message, which `claude-code`'s `buildReviewErrorMessage` fills with the
 * engine's own `result` text — goes through `engine-text.ts` before anything
 * else touches it. The order is **split → neutralise → match → colour** and
 * it is load-bearing in both directions: matching sees text that can no
 * longer break a line, and the palette's own SGR codes are added *after*
 * neutralisation, so they are never themselves escaped. `toSafeLines` runs
 * **once** per digest, so the pass is never duplicated.
 *
 * `[E6.F2.H1]`'s minimal result block — state, verdict only when one
 * existed, run directory — is **superseded** by {@link formatResultDigest},
 * not wrapped: its renderer is deleted, not deprecated. H1 AC-7 pinned that
 * block to keep H2's surface from slipping in early, and this story is that
 * surface (AC-15).
 */

import { join } from "node:path";
import type { RunFailureRecord } from "../../../core/history/index.js";
import type { TerminalState, Verdict } from "../../../core/run/index.js";
import type { TuiPalette } from "./colors.js";
import { neutralizeControls, toSafeLines } from "./engine-text.js";
import {
  extractFindings,
  type FindingSeverity,
  matchFindingLine,
  type TuiFinding,
} from "./findings.js";

/** Rendered in place of a run directory that does not exist (D13 path). */
const ABSENT = "-";

/**
 * Collapses every newline — and the whitespace hugging it — into a single
 * space (`[E6.F2.H2]` D9, AC-6).
 *
 * Both consumers render one fact per physical line, so a message that broke a
 * line would break the block. And such messages are ordinary, not exotic:
 * `git-cli.ts` builds port errors as `` `${message}: ${asError.message}` ``
 * over an execa error, and a bad ref makes `git worktree add` reject with a
 * three-line message containing a blank line. `run-review.ts` returns that as
 * a *failure* rather than throwing, so it reaches the digest on a perfectly
 * normal path. The CLI's `render/format-review.ts` `field()` collapses the
 * same value for the same reason.
 */
function collapseToOneLine(raw: string): string {
  return raw.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Reduces any throwable to a single human-readable line.
 *
 * DELIBERATE DUPLICATION of the CLI's `render/format-error.ts`
 * (design §Resolution 2): the `adapters-isolated` guard forbids every
 * cross-adapter import — driving → driving included — and editing a PRD §4.5
 * guard to save these ~10 lines is disproportionate. Revisit only if
 * `[E6.F2.H2]` materially grows the overlap.
 */
export function formatTuiErrorLine(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const collapsed = collapseToOneLine(raw);

  if (collapsed !== "") {
    return collapsed;
  }

  return error instanceof Error && error.name !== ""
    ? error.name
    : "Unknown error";
}

/**
 * Everything the result step renders, and nothing else (`[E6.F2.H2]`, #39).
 *
 * Deliberately carries no branch on `state`: the markdown-dependent parts of
 * the digest are keyed on `engineOutput` alone (AC-5), because
 * `src/core/run/run-review.ts` documents a parse-stage fault as
 * `engine-error` carrying `engineOutput` AND `failure` together. Both
 * optional shapes are the public core types the flow already holds, so the
 * persisted path hands `record.failure` over as it stands — its `message` is
 * the only value normalised, and only for line breaks (D9; see
 * {@link collapseToOneLine}).
 */
export interface TuiResultDigest {
  readonly state: TerminalState;
  readonly verdict?: Verdict;
  readonly failure?: RunFailureRecord;
  readonly engineOutput?: string;
  readonly runDir?: string;
}

/** Every level, in the fixed order the counts line uses. */
const SEVERITY_ORDER: readonly FindingSeverity[] = [
  "blocker",
  "major",
  "minor",
  "nit",
];

/**
 * The levels listed line by line. `minor`/`nit` are counted only — the digest
 * stays scannable, and the full view is one keystroke away.
 */
const LISTED_SEVERITIES: readonly FindingSeverity[] = ["blocker", "major"];

/** The longest label, so the listed findings form a column. */
const SEVERITY_LABEL_WIDTH = "[blocker]".length;

/**
 * AC-1: a completed run without a verdict says so. Silently omitting the line
 * would read as "not applicable" rather than "nothing could be parsed".
 */
const NO_VERDICT_LINE = "none — no verdict was parsed for this run.";

/**
 * AC-4: the honest degradation. The `[SEV: …]` convention is a harness
 * *prompt* instruction, never a contract, so zero matches means "this
 * adapter recognized nothing" — never "the review found nothing".
 */
const NO_CONVENTION_FINDINGS_LINE =
  "none in the [SEV: …] format — the engine may report them differently; see the full review.";

/** The role a terminal state is decorated with. */
function stateRole(
  state: TerminalState,
  palette: TuiPalette,
): (text: string) => string {
  switch (state) {
    case "ok":
      return palette.good;
    case "ambiguous":
      return palette.warn;
    default:
      return palette.bad;
  }
}

/** The role a verdict is decorated with. */
function verdictRole(
  verdict: Verdict,
  palette: TuiPalette,
): (text: string) => string {
  switch (verdict) {
    case "approve":
      return palette.good;
    case "request-changes":
      return palette.warn;
    default:
      return palette.muted;
  }
}

/** The role a severity is decorated with, in the digest and the full view. */
function severityRole(
  severity: FindingSeverity,
  palette: TuiPalette,
): (text: string) => string {
  switch (severity) {
    case "blocker":
      return palette.bad;
    case "major":
      return palette.warn;
    default:
      return palette.muted;
  }
}

/** `1 blocker, 2 major, 1 minor` — non-zero levels only, in fixed order. */
function formatFindingCounts(findings: readonly TuiFinding[]): string {
  const parts: string[] = [];

  for (const severity of SEVERITY_ORDER) {
    const count = findings.filter(
      (finding) => finding.severity === severity,
    ).length;

    if (count > 0) {
      parts.push(`${count} ${severity}`);
    }
  }

  return parts.join(", ");
}

/**
 * The findings block: the counts line plus every blocker and major on its own
 * line, or — when the heuristic recognized nothing — the single degradation
 * line (AC-2, AC-4).
 *
 * Blockers are listed before majors (source order within each group): the
 * harness *asks* engines to order by severity but nothing enforces it, and
 * grouping is what makes "blockers at a glance" true either way. Labels are
 * padded **before** colouring — padding a string that already carries SGR
 * codes would count the escapes and misalign the column.
 *
 * Takes the **safe lines**, not the markdown: the finding text is written to
 * `stdout` with no prompt of any kind before it (R1-001), which makes it the
 * digest's most exposed engine-derived channel, so the neutralisation must
 * already have happened by the time this function is reached.
 */
function formatFindingsSection(
  safeLines: readonly string[],
  palette: TuiPalette,
): readonly string[] {
  const findings = extractFindings(safeLines);

  if (findings.length === 0) {
    return [`Findings: ${palette.muted(NO_CONVENTION_FINDINGS_LINE)}`];
  }

  const lines = [`Findings: ${palette.muted(formatFindingCounts(findings))}`];

  for (const severity of LISTED_SEVERITIES) {
    const label = `[${severity}]`.padEnd(SEVERITY_LABEL_WIDTH);
    const decorate = severityRole(severity, palette);

    for (const finding of findings.filter(
      (candidate) => candidate.severity === severity,
    )) {
      lines.push(`  ${decorate(label)} ${finding.text}`);
    }
  }

  return lines;
}

/**
 * The compact result block (`[E6.F2.H2]` AC-1..AC-7): state, verdict, failure,
 * findings, run paths — in that fixed order, each part conditional on the data
 * it reports and on nothing else.
 *
 * `palette` is a **required argument**, never a module-level default: the real
 * palette's colour decision is an ambient, load-time snapshot (`NO_COLOR` /
 * `FORCE_COLOR` / TTY / `CI`), so a default would let a test silently inherit
 * it. Pure tests inject `PLAIN_PALETTE`; the flow injects `TUI_PALETTE`.
 * Colour stays decoration: every fact it carries is also plain text on the
 * same line.
 *
 * The `Full review` line is emitted **iff** the run was persisted and
 * `engineOutput !== undefined` — exactly the condition under which
 * `run-store-fs` writes `result.md`. Anything looser would point the user at
 * a file that does not exist.
 */
export function formatResultDigest(
  digest: TuiResultDigest,
  palette: TuiPalette,
): readonly string[] {
  const lines: string[] = [
    `Review result: ${stateRole(digest.state, palette)(digest.state)}`,
    digest.verdict !== undefined
      ? `Verdict: ${verdictRole(digest.verdict, palette)(digest.verdict)}`
      : `Verdict: ${palette.muted(NO_VERDICT_LINE)}`,
  ];

  if (digest.failure !== undefined) {
    // The third engine-derived channel (§A-5): `buildReviewErrorMessage`
    // returns the engine's own `result` text verbatim as the error message on
    // the `is_error` path, so this line carries engine bytes too. The two
    // passes compose rather than replace one another and the order is fixed:
    // `collapseToOneLine` first, so a real newline becomes a space rather
    // than a `\x0a` token, then neutralisation for everything a
    // whitespace-collapse cannot see — ESC and a lone CR among them.
    // `stage` is a `RunStage` union member, not engine text, and is left be.
    lines.push(
      `Failure: ${palette.bad(
        `${digest.failure.stage} — ${neutralizeControls(
          collapseToOneLine(digest.failure.message),
        )}`,
      )}`,
    );
  }

  if (digest.engineOutput !== undefined) {
    // Computed once, here, and handed down — the digest never neutralises the
    // same output twice.
    lines.push(
      ...formatFindingsSection(toSafeLines(digest.engineOutput), palette),
    );
  }

  lines.push(`Run directory: ${palette.muted(digest.runDir ?? ABSENT)}`);

  if (digest.runDir !== undefined && digest.engineOutput !== undefined) {
    lines.push(
      `Full review: ${palette.muted(join(digest.runDir, "result.md"))}`,
    );
  }

  return lines;
}

/**
 * The engine's own markdown (AC-12): one emitted line per source line,
 * recognized findings tinted by severity and nothing else — no heading, no
 * separator, no footer, no truncation marker, no line numbers, no markdown
 * rendering (D2: this is raw text, not rendered markdown).
 *
 * The original criterion — `stripAnsi(emitted) === markdown.split("\n")` for
 * every input — is **superseded**: it was the confirmed vulnerability R1-002,
 * because byte-verbatim emission *mandated* replaying OSC 52 (clipboard), OSC
 * 0 (window title), OSC 8 (hyperlink) and CSI cursor/erase straight into the
 * user's terminal. What it was protecting is printable-text fidelity, and
 * that survives intact, restated as three properties (§A-6):
 *
 * - **(a) completeness** — the emitted line count equals
 *   `markdown.split("\n").length` and emitted line *i* comes from source line
 *   *i*. Nothing is dropped, merged, elided, reordered or truncated, and no
 *   length cap exists, so neutralisation can never become truncation (AC-13).
 * - **(b) restricted identity** — for markdown carrying no code point in the
 *   neutralised set, `stripAnsi(formatFullView(m, PLAIN_PALETTE))` still
 *   equals `m.split("\n")` byte for byte. The old identity holds exactly, on
 *   the domain where it was safe; the amendment narrowed its domain rather
 *   than discarding it.
 * - **(c) non-executability** — for *any* input, once the palette's own SGR
 *   is stripped no emitted line contains a code point in that set.
 *
 * The split is `splitEngineLines`', which consumes one trailing CR per
 * element: a CRLF terminator is a line ending, not content, and rendering
 * `\x0d` at the end of every line of a CRLF review would be noise a user
 * would read as a sentinel bug. Every other CR survives the split and is
 * neutralised, because an interior CR is the line-overwrite forgery itself.
 */
export function formatFullView(
  markdown: string,
  palette: TuiPalette,
): readonly string[] {
  return toSafeLines(markdown).map((line) => {
    const finding = matchFindingLine(line);

    return finding === undefined
      ? line
      : severityRole(finding.severity, palette)(line);
  });
}
