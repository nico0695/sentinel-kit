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
 *
 * **Precondition (Amendment 1, §A-3/§A-4; AC-18, AC-19):** every line handed
 * to this module has already been through `engine-text.ts` — split, then
 * neutralised. The zero-import property is kept by making that the caller's
 * job (`render.ts` owns the split → neutralise → match → colour order) rather
 * than importing the neutraliser here. "Verbatim" therefore still means
 * *never re-parsed, re-split, summarised or truncated*; it no longer means
 * byte-identical, because a control byte arrives as its visible `\xNN` token.
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
 *
 * The remainder group is `([^\n]*)` rather than `(.*)` — **the second layer
 * of AC-19's defence, and the reason R1-003 cannot recur silently.** JS `.`
 * excludes every line terminator, so with `(.*)` a finding whose text carried
 * an interior `\r`, U+2028 or U+2029 failed to match *entirely* and vanished
 * from both the counts and the listed blockers, with no degradation notice —
 * a single byte deleting a blocker from a tool whose purpose is surfacing
 * blockers. With the neutralisation ordering in place (layer 1) this group is
 * unreachable-by-design; it exists so that a future caller which forgets to
 * neutralise degrades to a **visible** finding instead of a **deleted** one.
 * The two failure modes are not symmetric, so both layers are asserted
 * separately and neither may be dropped for the other.
 */
const FINDING_LINE =
  /^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*([^\n]*)$/i;

/**
 * Classifies one line. Returns `undefined` when the line is not a finding —
 * prose, a heading, or a marker carrying a level outside the four.
 *
 * Precondition: `line` is one already-neutralised line (§A-3). Nothing breaks
 * if a caller neutralises again first — `neutralizeControls` is idempotent —
 * so defending at a call site costs nothing.
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
 * Every finding in `lines`, in source order.
 *
 * Takes the **already-split, already-neutralised lines** rather than the raw
 * markdown (§A-3): splitting is `engine-text.ts`' job and neutralising is the
 * caller's, which is what keeps this module at zero imports while making the
 * split → neutralise → match order explicit and single-sourced in
 * `render.ts`. Taking the markdown and neutralising internally would hide
 * that order behind two call sites instead of stating it once.
 */
export function extractFindings(
  lines: readonly string[],
): readonly TuiFinding[] {
  const findings: TuiFinding[] = [];

  for (const line of lines) {
    const finding = matchFindingLine(line);

    if (finding !== undefined) {
      findings.push(finding);
    }
  }

  return findings;
}
