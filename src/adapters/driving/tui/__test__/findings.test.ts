/**
 * The `[SEV: …]` heuristic (`[E6.F2.H2]`, #39; AC-3, and AC-2's extraction
 * half).
 *
 * Two things are under guard here:
 *
 * - **What counts as a finding**: a trimmed line whose text — after an
 *   optional list or quote marker — starts with `[SEV: <level>]`, matched
 *   case-insensitively over exactly `blocker | major | minor | nit`. A level
 *   outside those four is not a finding, and neither is prose.
 * - **What survives**: everything after the marker, verbatim. The matrix
 *   below deliberately varies the separator (em dash, hyphen, none) and the
 *   `file:line` shape (single line, range) because carrying the remainder
 *   unparsed is exactly what makes those variations irrelevant (spec A8).
 *
 * The two positive cases that matter most are not invented: they are read
 * from the real engine fixture `fixtures/claude-code/valid-verdict.json`,
 * the same file the verdict-extraction suites use.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toSafeLines } from "../engine-text.js";
import { extractFindings, matchFindingLine } from "../findings.js";

/** The `result` text of the real claude-code fixture: 1 major, 1 minor. */
function fixtureMarkdown(): string {
  const raw = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../fixtures/claude-code/valid-verdict.json",
        import.meta.url,
      ),
    ),
    "utf-8",
  );

  const parsed = JSON.parse(raw) as { readonly result: string };

  return parsed.result;
}

describe("matchFindingLine — real fixture lines (AC-2, AC-3)", () => {
  const lines = fixtureMarkdown().split("\n");

  it("classifies the fixture's major line and keeps its text verbatim", () => {
    const major = lines.find((line) => line.startsWith("[SEV: major]"));

    expect(major).toBeDefined();
    expect(matchFindingLine(major ?? "")).toEqual({
      severity: "major",
      text: (major ?? "").replace("[SEV: major] ", ""),
    });
  });

  it("keeps the `calc.js:6-8` line range intact — no re-splitting", () => {
    const major = lines.find((line) => line.startsWith("[SEV: major]"));
    const finding = matchFindingLine(major ?? "");

    expect(finding?.text.startsWith("calc.js:6-8 — ")).toBe(true);
    expect(finding?.text).toContain("divide-by-zero guard");
  });

  it("classifies the fixture's minor line", () => {
    const minor = lines.find((line) => line.startsWith("[SEV: minor]"));
    const finding = matchFindingLine(minor ?? "");

    expect(finding?.severity).toBe("minor");
    expect(finding?.text.startsWith("calc.js:9 — ")).toBe(true);
  });
});

describe("matchFindingLine — accepted shapes (AC-3)", () => {
  it("accepts a bare marker line", () => {
    expect(
      matchFindingLine("[SEV: blocker] auth.ts:12 — token never expires"),
    ).toEqual({
      severity: "blocker",
      text: "auth.ts:12 — token never expires",
    });
  });

  it("accepts a list-prefixed line", () => {
    expect(matchFindingLine("- [SEV: nit] naming")).toEqual({
      severity: "nit",
      text: "naming",
    });
  });

  it("accepts a quoted bullet (repeatable prefix)", () => {
    expect(matchFindingLine("> - [SEV: blocker] leaked worktree")).toEqual({
      severity: "blocker",
      text: "leaked worktree",
    });
  });

  it("accepts an ordered-list prefix in both forms", () => {
    expect(matchFindingLine("1. [SEV: major] a")?.severity).toBe("major");
    expect(matchFindingLine("12) [SEV: major] b")?.severity).toBe("major");
  });

  it("accepts an indented line", () => {
    expect(matchFindingLine("    [SEV: major] indented finding")).toEqual({
      severity: "major",
      text: "indented finding",
    });
  });

  it("accepts a hyphen separator", () => {
    expect(matchFindingLine("[SEV: major] calc.js:6 - dropped guard")).toEqual({
      severity: "major",
      text: "calc.js:6 - dropped guard",
    });
  });

  it("accepts no separator at all", () => {
    expect(matchFindingLine("[SEV: minor] calc.js:9 rename this")).toEqual({
      severity: "minor",
      text: "calc.js:9 rename this",
    });
  });

  it("matches case-insensitively and tolerates inner spacing", () => {
    expect(matchFindingLine("[sev: MAJOR] a")?.severity).toBe("major");
    expect(matchFindingLine("[ SEV : Minor ]  b")).toEqual({
      severity: "minor",
      text: "b",
    });
  });

  it("absorbs a trailing carriage return and outer whitespace", () => {
    expect(matchFindingLine("  [SEV: nit] trailing  \r")).toEqual({
      severity: "nit",
      text: "trailing",
    });
  });

  it("keeps an empty remainder as an empty string", () => {
    expect(matchFindingLine("[SEV: blocker]")).toEqual({
      severity: "blocker",
      text: "",
    });
  });
});

describe("matchFindingLine — rejected shapes (AC-3)", () => {
  it("rejects a level outside the four", () => {
    expect(matchFindingLine("[SEV: critical] the build is on fire")).toBe(
      undefined,
    );
  });

  it("rejects prose", () => {
    expect(matchFindingLine("The review found a few problems.")).toBe(
      undefined,
    );
  });

  it("rejects a heading and a verdict line", () => {
    expect(matchFindingLine("## Findings")).toBe(undefined);
    expect(matchFindingLine("VERDICT: request-changes")).toBe(undefined);
  });

  it("rejects a marker that does not start the line", () => {
    expect(matchFindingLine("see [SEV: major] below")).toBe(undefined);
  });

  it("rejects a malformed marker", () => {
    expect(matchFindingLine("[SEVERITY: major] a")).toBe(undefined);
    expect(matchFindingLine("[SEV major] a")).toBe(undefined);
    expect(matchFindingLine("SEV: major — a")).toBe(undefined);
  });

  it("rejects an empty line", () => {
    expect(matchFindingLine("")).toBe(undefined);
    expect(matchFindingLine("   ")).toBe(undefined);
  });
});

describe("extractFindings (AC-2)", () => {
  it("returns the fixture's two findings in source order", () => {
    const findings = extractFindings(fixtureMarkdown().split("\n"));

    expect(findings.map((finding) => finding.severity)).toEqual([
      "major",
      "minor",
    ]);
    expect(findings[0]?.text.startsWith("calc.js:6-8 — ")).toBe(true);
    expect(findings[1]?.text.startsWith("calc.js:9 — ")).toBe(true);
  });

  it("keeps source order across a mixed markdown document", () => {
    const markdown = [
      "## Review",
      "",
      "Some prose about the diff.",
      "- [SEV: nit] naming",
      "[SEV: blocker] auth.ts:12 — token never expires",
      "[SEV: critical] ignored: unknown level",
      "  [SEV: major] calc.js:6-8 — dropped guard",
      "",
      "VERDICT: request-changes",
    ].join("\n");

    expect(extractFindings(markdown.split("\n"))).toEqual([
      { severity: "nit", text: "naming" },
      { severity: "blocker", text: "auth.ts:12 — token never expires" },
      { severity: "major", text: "calc.js:6-8 — dropped guard" },
    ]);
  });

  it("returns nothing for markdown that ignores the convention", () => {
    expect(
      extractFindings(
        "# Review\n\nLooks fine to me.\n\nVERDICT: approve\n".split("\n"),
      ),
    ).toEqual([]);
  });

  it("returns nothing for empty markdown", () => {
    expect(extractFindings("".split("\n"))).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    expect(
      extractFindings("[SEV: major] a\r\n[SEV: nit] b\r\n".split("\n")),
    ).toEqual([
      { severity: "major", text: "a" },
      { severity: "nit", text: "b" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  Amendment 1 (fix round 1) — AC-3's tolerance and AC-19's layer 2    */
/* ------------------------------------------------------------------ */

/** One code point as a string — keeps the hostile inputs typo-proof. */
function cp(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

/**
 * The separator and `file:line` shapes AC-3's tolerance exists for, and the
 * exact texts the extractor produced **before** Amendment 1. They are written
 * out by hand rather than derived from the input, so the assertion cannot
 * agree with a bug in whichever pipeline produced them.
 */
const SEPARATOR_CORPUS: readonly string[] = [
  "[SEV: major] calc.js:6-8 — dropped divide-by-zero guard",
  "[SEV: major] calc.js:6 - dropped guard",
  "[SEV: minor] calc.js:9 rename this",
  "  [SEV: nit] naming  ",
  "- [SEV: blocker] auth.ts:12 — token never expires",
];

const SEPARATOR_FINDINGS = [
  { severity: "major", text: "calc.js:6-8 — dropped divide-by-zero guard" },
  { severity: "major", text: "calc.js:6 - dropped guard" },
  { severity: "minor", text: "calc.js:9 rename this" },
  { severity: "nit", text: "naming" },
  { severity: "blocker", text: "auth.ts:12 — token never expires" },
];

describe("extractFindings — the parsing tolerance survives the fix (AC-3)", () => {
  it("carries ranges, em dashes, hyphens and no separator at all byte-identically, before and after neutralisation", () => {
    const markdown = SEPARATOR_CORPUS.join("\n");

    // "Before": the raw LF split the extractor was given pre-amendment.
    expect(extractFindings(markdown.split("\n"))).toEqual(SEPARATOR_FINDINGS);
    // "After": the same corpus through the real split-then-neutralise
    // pipeline. AC-18 P3 (a string with no code point in N is returned
    // unchanged) is what makes these two identical, and this is where that is
    // proved for the shapes AC-3 names — the rendering fix did not buy safety
    // by trading away the parsing tolerance.
    expect(extractFindings(toSafeLines(markdown))).toEqual(SEPARATOR_FINDINGS);
    expect(extractFindings(toSafeLines(markdown))).toEqual(
      extractFindings(markdown.split("\n")),
    );
  });
});

/**
 * AC-19's **second** layer, asserted on its own so it cannot rot behind the
 * first. These inputs are deliberately NOT neutralised: they are what reaches
 * `findings.ts` if some future caller forgets the ordering. The claim proved
 * here is exactly one thing — the finding is still *recognised* — and it is
 * not a safety claim: a raw ESC that survives extraction is still executable,
 * which is why layer 1 exists and why the end-to-end digest cases in
 * `result.test.ts` are asserted separately. What layer 2 buys is that a
 * forgotten neutralisation degrades to a **visible, ugly** finding instead of
 * a **silently deleted** one, and a deleted blocker is the worse outcome for
 * a tool whose whole purpose is surfacing blockers.
 */
describe("extractFindings — an interior control never deletes a finding (AC-19, layer 2)", () => {
  const INTERIOR: ReadonlyArray<{
    readonly label: string;
    readonly codePoint: number;
  }> = [
    { label: "an interior carriage return", codePoint: 0x0d },
    { label: "U+2028 LINE SEPARATOR", codePoint: 0x2028 },
    { label: "U+2029 PARAGRAPH SEPARATOR", codePoint: 0x2029 },
    { label: "an ESC introducer", codePoint: 0x1b },
  ];

  it.each(INTERIOR)(
    "keeps a blocker whose text carries $label",
    ({ codePoint }) => {
      const findings = extractFindings([
        `[SEV: blocker] auth.ts:12${cp(codePoint)}real`,
      ]);

      // Paired on purpose: "the finding did not vanish" asserted alone is
      // also satisfied by a matcher that returns an empty text, which is a
      // near neighbour of R1-003's own failure mode.
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocker");
      expect(findings[0]?.text.startsWith("auth.ts:12")).toBe(true);
      expect(findings[0]?.text.endsWith("real")).toBe(true);
    },
  );

  it("is not a safety layer on its own: the raw control reaches the text", () => {
    // The reason AC-19 needs both layers and neither alone satisfies it: this
    // text is recognised, and still carries an executable byte. Only the
    // neutralise-before-match ordering makes it inert.
    expect(
      extractFindings([`[SEV: blocker] auth.ts:12${cp(0x0d)}real`])[0]?.text,
    ).toBe(`auth.ts:12${cp(0x0d)}real`);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix round 2 — RR1-001: a control BEFORE the marker, not inside it   */
/*                                                                      */
/*  Round 1 moved neutralisation UPSTREAM of this matcher and then       */
/*  asserted only the interior position. Every `\s` in the matcher       */
/*  therefore stopped absorbing the five members of N that JS whitespace */
/*  absorbs — `trim()`, the list/quote separator and all five `\s*`      */
/*  inside the marker — so nine structural positions x five code points  */
/*  went from recognised to DELETED: gone from the counts AND from the   */
/*  listed blockers, with no degradation notice when another finding     */
/*  matched. No test in the round-1 delta placed a control before the    */
/*  marker, which is exactly why it shipped. This is that gap, closed.   */
/*                                                                      */
/*  Every input below is built THROUGH `toSafeLines` rather than from a  */
/*  hard-coded token literal: the repair rests on a coupling between     */
/*  this matcher and `engine-text.ts`' token shape, so the coupling is   */
/*  exercised, never assumed.                                            */
/* ------------------------------------------------------------------ */

/** The printable sentinels bracketing every structural-position finding. */
const TEXT_START = "START";
const TEXT_END = "END";

/**
 * The nine structural positions where the matcher used `\s`. Each builder
 * takes one control character and returns a whole line whose finding text is
 * `START auth.ts:12 END`, so a repair that recognizes the line but eats its
 * text still fails.
 */
const STRUCTURAL_POSITIONS: ReadonlyArray<{
  readonly label: string;
  readonly build: (control: string) => string;
}> = [
  {
    label: "leading",
    build: (c) => `${c}[SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "leading, mixed with spaces",
    build: (c) => ` ${c} [SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "before a list marker",
    build: (c) => `${c}- [SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "after a list marker",
    build: (c) => `- ${c}[SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "inside a quoted bullet",
    build: (c) => `> ${c}- [SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "after the opening bracket",
    build: (c) => `[${c}SEV: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "before the colon",
    build: (c) => `[SEV${c}: blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "after the colon",
    build: (c) => `[SEV:${c}blocker] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
  {
    label: "before the closing bracket",
    build: (c) => `[SEV: blocker${c}] ${TEXT_START} auth.ts:12 ${TEXT_END}`,
  },
];

/**
 * `N ∩ (WhiteSpace ∪ LineTerminator)` — the five members of the neutralised
 * set that JS whitespace itself absorbs, and therefore the five whose tokens
 * the matcher must absorb too. Probed over all 65 members of N, not assumed.
 */
const WHITESPACE_CLASS_OF_N: ReadonlyArray<{
  readonly label: string;
  readonly codePoint: number;
}> = [
  { label: "VT (U+000B)", codePoint: 0x0b },
  { label: "FF (U+000C)", codePoint: 0x0c },
  { label: "CR (U+000D)", codePoint: 0x0d },
  { label: "LS (U+2028)", codePoint: 0x2028 },
  { label: "PS (U+2029)", codePoint: 0x2029 },
];

const STRUCTURAL_CASES = STRUCTURAL_POSITIONS.flatMap((position) =>
  WHITESPACE_CLASS_OF_N.map((point) => ({
    point: point.label,
    position: position.label,
    line: position.build(cp(point.codePoint)),
  })),
);

/**
 * The matcher exactly as it stood at `ed3ba28`, before this round: plain `\s`
 * everywhere, fed the RAW line. Reimplemented here rather than imported on
 * purpose — the whole value of the differential is that it cannot agree with
 * whatever `findings.ts` happens to do today.
 */
const PRE_ROUND_LIST_OR_QUOTE_PREFIX = /^(?:(?:[-*+>]|\d{1,3}[.)])\s+)+/;
const PRE_ROUND_FINDING_LINE =
  /^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*([^\n]*)$/i;

function preRoundRecognises(rawLine: string): boolean {
  return PRE_ROUND_FINDING_LINE.test(
    rawLine.trim().replace(PRE_ROUND_LIST_OR_QUOTE_PREFIX, ""),
  );
}

describe("extractFindings — a structural control never deletes a finding (RR1-001)", () => {
  it("covers nine structural positions against five code points", () => {
    // The corpus guard: without it a later edit could shrink the table and
    // every case below would still pass, which is how this defect shipped.
    expect(STRUCTURAL_POSITIONS).toHaveLength(9);
    expect(WHITESPACE_CLASS_OF_N).toHaveLength(5);
    expect(STRUCTURAL_CASES).toHaveLength(45);
  });

  it.each(STRUCTURAL_CASES)(
    "keeps the blocker with $point $position",
    ({ line }) => {
      const findings = extractFindings(toSafeLines(line));

      // Paired on purpose (the house rule): "the finding did not vanish" on
      // its own is also satisfied by a matcher that returns an empty text —
      // a near neighbour of the very failure mode under repair.
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocker");
      expect(findings[0]?.text.startsWith(TEXT_START)).toBe(true);
      expect(findings[0]?.text.endsWith(TEXT_END)).toBe(true);
    },
  );

  it.each(STRUCTURAL_POSITIONS)(
    "keeps matching an ordinary tab $label — HT is outside N",
    ({ build }) => {
      const line = build(cp(0x09));

      // The other half of the boundary: HT is never tokenised, so it reaches
      // the matcher as a real tab and `\s` must still absorb it. A repair
      // that replaced `\s` with the tokens instead of widening it would fail
      // exactly here.
      expect(toSafeLines(line)[0]).toContain(cp(0x09));

      const findings = extractFindings(toSafeLines(line));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocker");
      expect(findings[0]?.text.endsWith(TEXT_END)).toBe(true);
    },
  );

  it.each([
    { label: "ESC (U+001B)", codePoint: 0x1b },
    { label: "NUL (U+0000)", codePoint: 0x00 },
  ])(
    "does NOT recognise a leading $label — a decided boundary, not an accident",
    ({ codePoint }) => {
      const leading = `${cp(codePoint)}[SEV: blocker] ${TEXT_START} ${TEXT_END}`;

      // The named residue (`risk-e6f2h2-013`): a leading member of N that is
      // NOT whitespace-class still prevents recognition. It is not a round-1
      // regression — the pre-round matcher dropped it identically — and it
      // sits outside AC-19's letter, which speaks about the remainder. Pinned
      // here so a later reader sees a boundary that was chosen; E7 owns it.
      expect(preRoundRecognises(leading)).toBe(false);
      expect(extractFindings(toSafeLines(leading))).toEqual([]);
      // Paired: the same code point one step to the right IS recognised, so
      // the negative above is about the leading position and not about a
      // malformed corpus line.
      const interior = `[SEV: blocker] ${TEXT_START}${cp(codePoint)} ${TEXT_END}`;

      expect(extractFindings(toSafeLines(interior))).toHaveLength(1);
    },
  );

  it("recognises exactly what the pre-round matcher recognised, over the whole corpus", () => {
    const probed = [
      ...WHITESPACE_CLASS_OF_N,
      { label: "HT (U+0009)", codePoint: 0x09 },
      { label: "ESC (U+001B)", codePoint: 0x1b },
      { label: "NUL (U+0000)", codePoint: 0x00 },
    ];
    const corpus = STRUCTURAL_POSITIONS.flatMap((position) =>
      probed.map((point) => position.build(cp(point.codePoint))),
    );

    expect(corpus).toHaveLength(72);
    // Non-vacuity: the corpus must contain real negatives on BOTH sides, or
    // the equality below would also hold for a matcher that recognized every
    // line handed to it.
    expect(corpus.filter((line) => !preRoundRecognises(line))).toHaveLength(18);

    const divergent = corpus.filter(
      (line) =>
        preRoundRecognises(line) !==
        (extractFindings(toSafeLines(line)).length === 1),
    );

    expect(divergent).toEqual([]);
  });

  it("keeps a token trailing the finding text, and absorbs one in the separator position", () => {
    // The one text divergence this repair introduces, asserted rather than
    // left to be discovered (decision F8): the pre-round matcher trimmed the
    // raw trailing byte away, and the token is printable ASCII, so `.trim()`
    // on the remainder keeps it. Keeping evidence is the safe direction for a
    // renderer whose whole stance is "escape, never delete".
    expect(extractFindings(toSafeLines(`[SEV: nit] x${cp(0x0b)}`))).toEqual([
      { severity: "nit", text: "x\\x0b" },
    ]);
    // Its mirror: in the SEPARATOR position — between `]` and the text — the
    // token is structural spacing exactly as the raw byte was, so it is
    // absorbed and pre-round text parity holds there.
    expect(extractFindings(toSafeLines(`[SEV: nit]${cp(0x0b)}x`))).toEqual([
      { severity: "nit", text: "x" },
    ]);
  });
});
