/**
 * Driving adapter: tui — the `[SEV: …]` finding heuristic (`[E6.F2.H2]`,
 * #39; AC-3).
 *
 * Adapter-local and deliberately opportunistic (spec D3): the factory
 * harnesses *ask* engines for `[SEV: level] file:line — summary` lines, but
 * nothing enforces it, so this module reads the convention where it happens
 * to hold and stays silent where it does not. It never becomes a domain
 * model — `src/core/**` has no findings concept and this story does not add
 * one.
 *
 * Pure, with **zero imports**: a line in, a classification out. Everything
 * after the severity marker is carried **verbatim** (only its outer
 * whitespace is normalized), which is what makes `file:line` ranges
 * (`calc.js:6-8`), em-dash separators, plain hyphens and no separator at all
 * survive identically — the remainder is never re-parsed (spec A8).
 */

/** The four levels the factory harnesses declare. Nothing else is a finding. */
export type FindingSeverity = "blocker" | "major" | "minor" | "nit";

/** One line the heuristic recognized: its level and its own text. */
export interface TuiFinding {
  readonly severity: FindingSeverity;
  readonly text: string;
}

/**
 * Leading list or quote markers, repeatable so `> - [SEV: …]` (a quoted
 * bullet) is stripped in one pass. Ordered lists are accepted in both the
 * `1.` and `1)` forms.
 */
const LIST_OR_QUOTE_PREFIX = /^(?:(?:[-*+>]|\d{1,3}[.)])\s+)+/;

/**
 * The marker itself. Case-insensitive on both `SEV` and the level, tolerant
 * of inner spacing, and the alternation is the **only** gate on which levels
 * count: widen it and `[SEV: critical]` becomes a finding.
 */
const FINDING_LINE = /^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*(.*)$/i;

/**
 * Classifies one line. Returns `undefined` when the line is not a finding —
 * prose, a heading, or a marker carrying a level outside the four.
 */
export function matchFindingLine(line: string): TuiFinding | undefined {
  const marked = line.trim().replace(LIST_OR_QUOTE_PREFIX, "");
  const match = FINDING_LINE.exec(marked);

  if (match === null) {
    return undefined;
  }

  const rawSeverity = match[1];

  if (rawSeverity === undefined) {
    return undefined;
  }

  return {
    // Safe by construction: the regex alternation above admits exactly the
    // four `FindingSeverity` members, in any casing.
    severity: rawSeverity.toLowerCase() as FindingSeverity,
    text: (match[2] ?? "").trim(),
  };
}

/**
 * Every finding in `markdown`, in source order. Splitting on `"\n"` (not
 * `/\r?\n/`) keeps this consistent with the full view's verbatim identity;
 * a trailing `\r` is absorbed by the per-line `trim()` in
 * {@link matchFindingLine}.
 */
export function extractFindings(markdown: string): readonly TuiFinding[] {
  const findings: TuiFinding[] = [];

  for (const line of markdown.split("\n")) {
    const finding = matchFindingLine(line);

    if (finding !== undefined) {
      findings.push(finding);
    }
  }

  return findings;
}
