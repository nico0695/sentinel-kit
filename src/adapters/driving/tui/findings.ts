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
 *
 * **The invariant that precondition forces (RR1-001; plan decision F4):** an
 * AC-18 token standing for a code point that JS whitespace itself absorbed is
 * treated as that whitespace, at **every structural position** of this
 * matcher, and **nowhere else**. Without it, neutralising upstream of the
 * matcher silently deletes any finding whose marker is preceded or
 * interrupted by one of those five code points — the exact outcome AC-19
 * exists to forbid, since the finding leaves both the counts and the listed
 * blockers with no degradation notice. The coupling to `engine-text.ts` is
 * therefore real and deliberate: {@link SPACE} spells the tokens that
 * module's `tokenFor` produces, so a change to their casing or format must be
 * mirrored here. It is a coupling to a **contract** (AC-18's token shape),
 * not an import — the zero-import property is untouched.
 */

/** The four levels the factory harnesses declare. Nothing else is a finding. */
export type FindingSeverity = "blocker" | "major" | "minor" | "nit";

/** One line the heuristic recognized: its level and its own text. */
export interface TuiFinding {
  readonly severity: FindingSeverity;
  readonly text: string;
}

/**
 * Structural whitespace, as a regex **source fragment**: real JS whitespace,
 * plus the five AC-18 tokens standing for the members of the neutralised set
 * N that JS whitespace already absorbed.
 *
 * `N ∩ (WhiteSpace ∪ LineTerminator)` is exactly `{U+000B VT, U+000C FF,
 * U+000D CR, U+2028 LS, U+2029 PS}` — probed over all 65 members of N, not
 * assumed. Those five, and only those, were absorbed by this matcher before
 * neutralisation moved upstream of it, so admitting their tokens restores
 * pre-round recognition **exactly**. Widening the class to the rest of N
 * (ESC, NUL, DEL, the C1 controls) would newly recognize lines that never
 * matched, which is a change to the heuristic rather than a regression
 * repair, and is deliberately not done (decision F4).
 *
 * Composed once and shared by the three patterns below instead of spelled
 * inline five times: a 40-character alternation copied into a single literal
 * is unreadable and invites copy-paste divergence (decision F6). `\\` here
 * matches one literal backslash — the first character of every token.
 */
const SPACE = "(?:\\s|\\\\x0b|\\\\x0c|\\\\x0d|\\\\u2028|\\\\u2029)";

/**
 * Structural whitespace at the start of the line, stripped **after**
 * `String.prototype.trim` and **before** the list or quote prefix.
 *
 * `trim()` stays rather than being replaced: it still removes exactly the
 * real whitespace it always removed, and the two compose, so a line opening
 * with a space, a neutralised VT and another space still reaches its marker.
 * What `trim()` can no longer see is the token itself, which is printable
 * ASCII by the time this module runs — that blindness is RR1-001.
 */
const LEADING_SPACE = new RegExp(`^${SPACE}+`);

/**
 * Leading list or quote markers, repeatable so `> - [SEV: …]` (a quoted
 * bullet) is stripped in one pass. Ordered lists are accepted in both the
 * `1.` and `1)` forms.
 *
 * The separator after each marker is {@link SPACE} rather than `\s`, so a
 * neutralised control **between** the marker and the bracket — `- \x0d[SEV:
 * …]` — no longer strands the bracket behind it.
 */
const LIST_OR_QUOTE_PREFIX = new RegExp(
  `^(?:(?:[-*+>]|\\d{1,3}[.)])${SPACE}+)+`,
);

/**
 * The marker itself. Case-insensitive on both `SEV` and the level, tolerant
 * of inner spacing, and the alternation is the **only** gate on which levels
 * count: widen it and `[SEV: critical]` becomes a finding.
 *
 * All five inner spacing positions use {@link SPACE}: a neutralised control
 * after `[`, before `:`, after `:`, before `]` or before the remainder is
 * inner spacing exactly as the raw code point was before neutralisation moved
 * upstream (RR1-001). The remainder group is untouched by that widening — a
 * token *inside* or *at the end of* the finding text is text, and is
 * rendered, never absorbed.
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
const FINDING_LINE = new RegExp(
  `^\\[${SPACE}*sev${SPACE}*:${SPACE}*(blocker|major|minor|nit)${SPACE}*\\]${SPACE}*([^\\n]*)$`,
  "i",
);

/**
 * Classifies one line. Returns `undefined` when the line is not a finding —
 * prose, a heading, or a marker carrying a level outside the four.
 *
 * Precondition: `line` is one already-neutralised line (§A-3). Nothing breaks
 * if a caller neutralises again first — `neutralizeControls` is idempotent —
 * so defending at a call site costs nothing.
 */
export function matchFindingLine(line: string): TuiFinding | undefined {
  const marked = line
    .trim()
    .replace(LEADING_SPACE, "")
    .replace(LIST_OR_QUOTE_PREFIX, "");
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
