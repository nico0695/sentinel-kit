/**
 * Driving adapter: tui — minimal rendering (`[E6.F2.H1]`, #38; AC-7, AC-9).
 *
 * Deliberately minimal, per the H1/H2 boundary: the result step shows the
 * terminal state, the verdict when one exists, and the persisted run
 * directory — no markdown rendering, no severity highlighting. Rich
 * rendering is `[E6.F2.H2]`'s entire scope and will rewrite this surface.
 */

import { join } from "node:path";
import type { RunFailureRecord } from "../../../core/history/index.js";
import type { TerminalState, Verdict } from "../../../core/run/index.js";
import type { TuiPalette } from "./colors.js";
import {
  extractFindings,
  type FindingSeverity,
  matchFindingLine,
  type TuiFinding,
} from "./findings.js";

/** Rendered in place of a run directory that does not exist (D13 path). */
const ABSENT = "-";

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
  const collapsed = raw.replace(/\s*\n\s*/g, " ").trim();

  if (collapsed !== "") {
    return collapsed;
  }

  return error instanceof Error && error.name !== ""
    ? error.name
    : "Unknown error";
}

/**
 * The minimal result block (AC-7): state, verdict when present, run
 * directory. `runDir` renders as `-` when persistence failed — nothing was
 * written, so no directory is fabricated (mirrors the CLI's D13 semantics).
 */
export function formatTuiResult(
  state: TerminalState,
  verdict: Verdict | undefined,
  runDir?: string,
): readonly string[] {
  return [
    `State: ${state}`,
    ...(verdict !== undefined ? [`Verdict: ${verdict}`] : []),
    `Run directory: ${runDir ?? ABSENT}`,
  ];
}

/* ------------------------------------------------------------------ */
/*  `[E6.F2.H2]` (#39) — the result digest and the full view           */
/* ------------------------------------------------------------------ */

/**
 * Everything the result step renders, and nothing else (`[E6.F2.H2]`, #39).
 *
 * Deliberately carries no branch on `state`: the markdown-dependent parts of
 * the digest are keyed on `engineOutput` alone (AC-5), because
 * `src/core/run/run-review.ts` documents a parse-stage fault as
 * `engine-error` carrying `engineOutput` AND `failure` together. Both
 * optional shapes are the public core types the flow already holds, so the
 * persisted path passes `record.failure` straight through.
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
 */
function formatFindingsSection(
  markdown: string,
  palette: TuiPalette,
): readonly string[] {
  const findings = extractFindings(markdown);

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
    lines.push(
      `Failure: ${palette.bad(
        `${digest.failure.stage} — ${digest.failure.message}`,
      )}`,
    );
  }

  if (digest.engineOutput !== undefined) {
    lines.push(...formatFindingsSection(digest.engineOutput, palette));
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
 * The engine's own markdown, **verbatim** (AC-12): one emitted line per source
 * line, recognized findings tinted by severity and nothing else — no heading,
 * no separator, no footer, no truncation marker, no line numbers, no markdown
 * rendering (D2: this is raw text, not rendered markdown).
 *
 * That is what makes the identity `stripAnsi(emitted) === markdown.split("\n")`
 * hold, and it is why the split is on `"\n"` and never `/\r?\n/`: a `\r?\n`
 * split would silently drop the carriage returns and break the identity on
 * CRLF output.
 */
export function formatFullView(
  markdown: string,
  palette: TuiPalette,
): readonly string[] {
  return markdown.split("\n").map((line) => {
    const finding = matchFindingLine(line);

    return finding === undefined
      ? line
      : severityRole(finding.severity, palette)(line);
  });
}
