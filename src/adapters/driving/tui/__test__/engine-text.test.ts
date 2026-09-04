/**
 * Neutralisation of engine-produced text (`[E6.F2.H2]`, #39; AC-18, design
 * Amendment 1 §A-2 and Amendment 2 §B-1).
 *
 * **Amendment 2** (`e6f2h2-D19`) widened the neutralised set to the nine bidi
 * formatting controls, which the owner's review of PR #76 showed passing
 * through raw. They are covered twice here: as twelve new rows of the
 * boundary table (the nine, plus the three printable neighbours that pin the
 * two new edges), and as a describe of their own, because their failure mode
 * is not the terminal executing something — it is the reader being shown a
 * different order of characters than the engine reported.
 *
 * What is under guard here is a contract, not an implementation: engine
 * output is untrusted text, and after this module has seen it, **nothing in
 * it can drive the terminal and nothing in it has been lost**. The three
 * confirmed CRITICALs of fix round 1 (R1-001, R1-002, R1-003) all reduce to
 * that one sentence, and this suite is where it is proved — before any call
 * site is rewired, so the primitive is covered on its own terms.
 *
 * Three shapes of assertion, in decreasing strength:
 *
 * - **The boundary table** — one row per interesting code point, embedded
 *   between two printable sentinels, asserting the *exact* resulting string.
 *   Exact equality is what makes "and performs no other transformation"
 *   checkable: a row cannot pass because something extra was trimmed,
 *   collapsed or dropped. It is also the only place the two deliberate
 *   exclusions (HT and LF) are pinned, so widening the set silently is not
 *   possible.
 * - **P1 / P2 / P3** — visibility, idempotence and transparency, each as its
 *   own case over a hostile fixture that carries every attack class the
 *   ledger named.
 * - **Structural cases** for `splitEngineLines`' CRLF rule and for
 *   `toSafeLines`' ordering.
 *
 * Two house rules this file obeys deliberately:
 *
 * - **Negative assertions are always paired.** "The output contains no code
 *   point in N" is *also* satisfied by the content having been deleted —
 *   which is R1-003's own failure mode, so an unpaired negative would pass on
 *   the very bug it was written to prove fixed. Every such assertion here
 *   names, in the same case, the text that must be **present**.
 * - **{@link IN_N} restates the neutralised set independently** of the module
 *   under test. That duplication is the point: an edit that widens or narrows
 *   the module's own character class does not move this one, so the boundary
 *   table fails instead of agreeing with itself.
 */

import { describe, expect, it } from "vitest";
import {
  neutralizeControls,
  splitEngineLines,
  toSafeLines,
} from "../engine-text.js";

/** One code point as a string — keeps the inputs typo-proof and readable. */
function cp(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

/**
 * The neutralised set N, restated here on purpose (see the header). Used only
 * for the P1-style negative half of an assertion, never on its own.
 */
const IN_N =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: this class is the independent restatement of the contract's control-byte set — matching those bytes is what the assertion is for.
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/**
 * Every attack class the review named, in one multi-line CRLF fixture: CSI
 * cursor-up + erase-line (the verdict forgery), OSC 52 (clipboard write),
 * OSC 0 (window title), 8-bit CSI (U+009B) and 8-bit OSC (U+009D), BEL, DEL,
 * and the two Unicode line separators that break the finding regex.
 */
const HOSTILE = [
  `[SEV: blocker] auth.ts:12${cp(0x1b)}[1A${cp(0x1b)}[2KVerdict: approve`,
  `${cp(0x1b)}]52;c;cm9ndWU=${cp(0x07)}clipboard`,
  `${cp(0x1b)}]0;pwned${cp(0x07)}title`,
  `${cp(0x9b)}2Keight-bit CSI`,
  `${cp(0x9d)}0;pwned${cp(0x07)}eight-bit OSC`,
  `del${cp(0x7f)}gone${cp(0x2028)}ls${cp(0x2029)}ps`,
].join("\r\n");

/**
 * Realistic engine markdown carrying no code point in N: headings, a real
 * finding line with an em dash and a `file:line` range, tab-indented code and
 * non-ASCII prose. P3's subject, and the reason every existing assertion over
 * the clean fixtures survives this change untouched.
 */
const CLEAN =
  "# Review\n\n[SEV: major] calc.js:6-8 — no divide-by-zero guard\n\n```js\n\tif (b === 0) {\n\t\treturn NaN;\n\t}\n```\n\nSummary: revisión completa.\n";

interface BoundaryRow {
  /** How the row reads in the test name. */
  readonly label: string;
  /** `escaped` or `survives` — the row's verdict, also in the test name. */
  readonly outcome: string;
  /** The code point embedded between the two sentinels. */
  readonly codePoint: number;
  /** The exact expected result, written independently of the input. */
  readonly expected: string;
  /** Why this code point is, or is not, in N. */
  readonly why: string;
}

/**
 * One row per boundary of the five ranges, plus the two deliberate
 * exclusions and the nearest printable neighbours on either side of each
 * edge. `A` and `B` bracket the code point so that a row also proves the
 * surrounding text is untouched.
 */
const BOUNDARY: readonly BoundaryRow[] = [
  {
    label: "U+0000 NUL",
    outcome: "escaped",
    codePoint: 0x00,
    expected: "A\\x00B",
    why: "lower edge of the first range",
  },
  {
    label: "U+0008 BS",
    outcome: "escaped",
    codePoint: 0x08,
    expected: "A\\x08B",
    why: "upper edge of the first range; BS erases the previous cell",
  },
  {
    label: "U+0009 HT",
    outcome: "survives",
    codePoint: 0x09,
    expected: "A\tB",
    why: "deliberate exclusion — forward-only, and the indentation byte of every quoted excerpt",
  },
  {
    label: "U+000A LF",
    outcome: "survives",
    codePoint: 0x0a,
    expected: "A\nB",
    why: "deliberate exclusion — it is the line separator itself",
  },
  {
    label: "U+000B VT",
    outcome: "escaped",
    codePoint: 0x0b,
    expected: "A\\x0bB",
    why: "lower edge of the second range",
  },
  {
    label: "U+000C FF",
    outcome: "escaped",
    codePoint: 0x0c,
    expected: "A\\x0cB",
    why: "page feed",
  },
  {
    label: "U+000D CR",
    outcome: "escaped",
    codePoint: 0x0d,
    expected: "A\\x0dB",
    why: "an interior CR returns to column 0 — the line-overwrite forgery",
  },
  {
    label: "U+001B ESC",
    outcome: "escaped",
    codePoint: 0x1b,
    expected: "A\\x1bB",
    why: "the introducer for CSI, OSC and DCS — the single most important member",
  },
  {
    label: "U+001F US",
    outcome: "escaped",
    codePoint: 0x1f,
    expected: "A\\x1fB",
    why: "upper edge of the second range",
  },
  {
    label: "U+0020 SPACE",
    outcome: "survives",
    codePoint: 0x20,
    expected: "A B",
    why: "first printable code point above the second range",
  },
  {
    label: "U+007E TILDE",
    outcome: "survives",
    codePoint: 0x7e,
    expected: "A~B",
    why: "last printable code point below DEL",
  },
  {
    label: "U+007F DEL",
    outcome: "escaped",
    codePoint: 0x7f,
    expected: "A\\x7fB",
    why: "lower edge of the third range",
  },
  {
    label: "U+0080 PAD",
    outcome: "escaped",
    codePoint: 0x80,
    expected: "A\\x80B",
    why: "first C1 control",
  },
  {
    label: "U+009B CSI",
    outcome: "escaped",
    codePoint: 0x9b,
    expected: "A\\x9bB",
    why: "the 8-bit CSI — the same cursor and erase attacks without an ESC",
  },
  {
    label: "U+009F APC",
    outcome: "escaped",
    codePoint: 0x9f,
    expected: "A\\x9fB",
    why: "upper edge of the third range",
  },
  {
    label: "U+00A0 NBSP",
    outcome: "survives",
    codePoint: 0xa0,
    expected: "A\u00a0B",
    why: "first code point above the C1 block — printable, not a control",
  },
  {
    label: "U+2027 HYPHENATION POINT",
    outcome: "survives",
    codePoint: 0x2027,
    expected: "A\u2027B",
    why: "the neighbour immediately below LS",
  },
  {
    label: "U+2028 LS",
    outcome: "escaped",
    codePoint: 0x2028,
    expected: "A\\u2028B",
    why: "a JS line terminator — the code point that makes a finding vanish",
  },
  {
    label: "U+2029 PS",
    outcome: "escaped",
    codePoint: 0x2029,
    expected: "A\\u2029B",
    why: "the other JS line terminator",
  },
  {
    // NAMED ASSERTION CHANGE (Amendment 2, `e6f2h2-D19`). This row read
    // `outcome: "survives"` with `expected: "A\u202aB"` and the
    // rationale "the neighbour immediately above PS — bidi spoofing is a
    // named non-goal". That grouping was too coarse: a homoglyph is
    // genuinely unpreventable here, these nine are not, and the owner's
    // review of PR #76 separated them.
    label: "U+202A LRE",
    outcome: "escaped",
    codePoint: 0x202a,
    expected: "A\\u202aB",
    why: "lower edge of the bidi embedding/override block, in N since Amendment 2",
  },
  {
    label: "U+202B RLE",
    outcome: "escaped",
    codePoint: 0x202b,
    expected: "A\\u202bB",
    why: "right-to-left embedding",
  },
  {
    label: "U+202C PDF",
    outcome: "escaped",
    codePoint: 0x202c,
    expected: "A\\u202cB",
    why: "pop directional formatting — the terminator half of a reordering attack",
  },
  {
    label: "U+202D LRO",
    outcome: "escaped",
    codePoint: 0x202d,
    expected: "A\\u202dB",
    why: "left-to-right override",
  },
  {
    label: "U+202E RLO",
    outcome: "escaped",
    codePoint: 0x202e,
    expected: "A\\u202eB",
    why: "right-to-left override — upper edge of the block, and the classic filename reversal",
  },
  {
    label: "U+202F NARROW NO-BREAK SPACE",
    outcome: "survives",
    codePoint: 0x202f,
    expected: "A\u202fB",
    why: "the neighbour immediately above RLO — a printable space, not a reordering control",
  },
  {
    label: "U+2065 (unassigned)",
    outcome: "survives",
    codePoint: 0x2065,
    expected: "A\u2065B",
    why: "the neighbour immediately below LRI — outside the isolates",
  },
  {
    label: "U+2066 LRI",
    outcome: "escaped",
    codePoint: 0x2066,
    expected: "A\\u2066B",
    why: "lower edge of the bidi isolates, in N since Amendment 2",
  },
  {
    label: "U+2067 RLI",
    outcome: "escaped",
    codePoint: 0x2067,
    expected: "A\\u2067B",
    why: "right-to-left isolate",
  },
  {
    label: "U+2068 FSI",
    outcome: "escaped",
    codePoint: 0x2068,
    expected: "A\\u2068B",
    why: "first strong isolate",
  },
  {
    label: "U+2069 PDI",
    outcome: "escaped",
    codePoint: 0x2069,
    expected: "A\\u2069B",
    why: "pop directional isolate — upper edge of the isolates",
  },
  {
    label: "U+206A INHIBIT SYMMETRIC SWAPPING",
    outcome: "survives",
    codePoint: 0x206a,
    expected: "A\u206aB",
    why: "the neighbour immediately above PDI — a deprecated format control that reorders nothing",
  },
];

describe("neutralizeControls — the boundary table (AC-18)", () => {
  it.each(BOUNDARY)(
    "$label $outcome, because $why",
    ({ codePoint, expected }) => {
      const input = `A${cp(codePoint)}B`;
      const actual = neutralizeControls(input);

      // Exact equality is the point: it pins the escaped rows AND proves the
      // sentinels are untouched, so no row can pass because something else
      // was trimmed, collapsed or dropped.
      expect(actual).toBe(expected);

      // Paired negative: whatever the row's verdict, nothing in N survives.
      expect(IN_N.test(actual)).toBe(false);
    },
  );

  it("escapes with lowercase hex and a fixed width per class", () => {
    // \xNN for cp <= U+00FF, \uNNNN above it — asserted on the two members
    // whose hex actually contains letters, where a case slip would show.
    expect(neutralizeControls(cp(0x1b))).toBe("\\x1b");
    expect(neutralizeControls(cp(0x0b))).toBe("\\x0b");
    expect(neutralizeControls(cp(0x2028))).toBe("\\u2028");
    // Amendment 2's nine all sit above U+00FF, so they reuse the existing
    // four-hex-digit form: the widening introduced no new token shape.
    expect(neutralizeControls(cp(0x202e))).toBe("\\u202e");
    expect(neutralizeControls(cp(0x2069))).toBe("\\u2069");
  });
});

describe("neutralizeControls — no other transformation (AC-18)", () => {
  it("does not trim, on either side", () => {
    expect(neutralizeControls(`   a${cp(0x1b)}b   `)).toBe("   a\\x1bb   ");
  });

  it("does not collapse repeated whitespace or repeated controls", () => {
    expect(neutralizeControls(`a  ${cp(0x0d)}${cp(0x0d)}  b`)).toBe(
      "a  \\x0d\\x0d  b",
    );
  });

  it("does not change case or order", () => {
    expect(neutralizeControls(`MiXeD${cp(0x1b)}CaSe`)).toBe("MiXeD\\x1bCaSe");
  });

  it("does not truncate: a long line keeps both of its halves", () => {
    const head = "x".repeat(5000);
    const tail = "y".repeat(5000);
    const actual = neutralizeControls(`${head}${cp(0x1b)}${tail}`);

    // 5000 + the four characters of `\x1b` + 5000 — no cap, no elision.
    expect(actual).toHaveLength(10_004);
    expect(actual.startsWith(head)).toBe(true);
    expect(actual.endsWith(tail)).toBe(true);
  });

  it("returns the empty string unchanged", () => {
    expect(neutralizeControls("")).toBe("");
  });
});

describe("neutralizeControls — P1 visibility (AC-18)", () => {
  it("leaves no code point in N, and keeps every payload readable", () => {
    // Standing guard: the fixture must actually be hostile, otherwise the
    // negative below would pass against harmless text.
    expect(IN_N.test(HOSTILE)).toBe(true);

    const actual = neutralizeControls(HOSTILE);

    expect(IN_N.test(actual)).toBe(false);

    // Paired positive: each attack is still visible, as a readable token,
    // together with the text that travelled with it. Nothing was deleted.
    expect(actual).toContain("\\x1b[1A\\x1b[2KVerdict: approve");
    expect(actual).toContain("\\x1b]52;c;cm9ndWU=\\x07clipboard");
    expect(actual).toContain("\\x1b]0;pwned\\x07title");
    expect(actual).toContain("\\x9b2Keight-bit CSI");
    expect(actual).toContain("\\x9d0;pwned\\x07eight-bit OSC");
    expect(actual).toContain("del\\x7fgone\\u2028ls\\u2029ps");
    expect(actual).toContain("[SEV: blocker] auth.ts:12");
  });

  it("cannot be re-formed into a sequence by the escaping itself", () => {
    // The token is four printable characters; there is no path back to a
    // real ESC, so a payload that tries to reassemble one stays inert.
    const actual = neutralizeControls(`${cp(0x1b)}${cp(0x1b)}[2J`);

    expect(actual).toBe("\\x1b\\x1b[2J");
    expect(actual).not.toContain(cp(0x1b));
  });
});

describe("neutralizeControls — P2 idempotence (AC-18)", () => {
  it("is stable on a second pass over the hostile fixture", () => {
    const once = neutralizeControls(HOSTILE);
    const twice = neutralizeControls(once);

    expect(twice).toBe(once);

    // Paired positive: stability is not stability at the empty string.
    expect(once).toContain("Verdict: approve");
    expect(once.length).toBeGreaterThan(HOSTILE.length);
  });

  it("is stable on every boundary row", () => {
    for (const { codePoint } of BOUNDARY) {
      const once = neutralizeControls(`A${cp(codePoint)}B`);

      expect(neutralizeControls(once)).toBe(once);
      expect(once.startsWith("A")).toBe(true);
      expect(once.endsWith("B")).toBe(true);
    }
  });
});

describe("neutralizeControls — P3 transparency (AC-18)", () => {
  it("returns control-free markdown byte-identical", () => {
    // Not `toEqual`: this must be the same string, character for character,
    // because it is what keeps every existing assertion over the clean
    // engine fixtures true after the rewiring.
    expect(neutralizeControls(CLEAN)).toBe(CLEAN);
  });

  it("keeps tabs, newlines and non-ASCII prose exactly as they were", () => {
    expect(neutralizeControls(CLEAN)).toContain("\n\tif (b === 0) {\n");
    expect(neutralizeControls(CLEAN)).toContain("revisión completa.");
    expect(neutralizeControls(CLEAN)).toContain(
      "[SEV: major] calc.js:6-8 — no divide-by-zero guard",
    );
  });
});

/**
 * The nine bidi formatting controls, enumerated **independently of the
 * module under test** (Amendment 2, `e6f2h2-D19`; the owner's review of
 * PR #76). Five embeddings/overrides and four isolates: the complete set
 * of code points that can make a terminal show the reader a different
 * order of characters than the engine reported. Enumerable and closed —
 * which is exactly what separates them from the homoglyph problem
 * `risk-e6f2h2-011` still names as a non-goal.
 */
const BIDI: ReadonlyArray<{
  readonly label: string;
  readonly codePoint: number;
  readonly token: string;
  readonly role: string;
}> = [
  {
    label: "U+202A LRE",
    codePoint: 0x202a,
    token: "\\u202a",
    role: "left-to-right embedding",
  },
  {
    label: "U+202B RLE",
    codePoint: 0x202b,
    token: "\\u202b",
    role: "right-to-left embedding",
  },
  {
    label: "U+202C PDF",
    codePoint: 0x202c,
    token: "\\u202c",
    role: "pop directional formatting",
  },
  {
    label: "U+202D LRO",
    codePoint: 0x202d,
    token: "\\u202d",
    role: "left-to-right override",
  },
  {
    label: "U+202E RLO",
    codePoint: 0x202e,
    token: "\\u202e",
    role: "right-to-left override",
  },
  {
    label: "U+2066 LRI",
    codePoint: 0x2066,
    token: "\\u2066",
    role: "left-to-right isolate",
  },
  {
    label: "U+2067 RLI",
    codePoint: 0x2067,
    token: "\\u2067",
    role: "right-to-left isolate",
  },
  {
    label: "U+2068 FSI",
    codePoint: 0x2068,
    token: "\\u2068",
    role: "first strong isolate",
  },
  {
    label: "U+2069 PDI",
    codePoint: 0x2069,
    token: "\\u2069",
    role: "pop directional isolate",
  },
];

describe("neutralizeControls — the nine bidi controls (AC-18, Amendment 2)", () => {
  it.each(BIDI)(
    "$label ($role) becomes $token, leaving the text around it alone",
    ({ codePoint, token }) => {
      // A file path is the realistic carrier: an engine quoting one from
      // reviewed source is doing its job, and a reordering control inside
      // it is what makes the reader see a different path.
      const raw = `src/auth${cp(codePoint)}.ts:12 — missing guard`;

      // Non-vacuity guard: the input really carries a member of N, so the
      // negative below cannot pass against already-harmless text.
      expect(IN_N.test(raw)).toBe(true);

      const actual = neutralizeControls(raw);

      expect(actual).toBe(`src/auth${token}.ts:12 — missing guard`);
      // Paired: nothing in N survives, AND the path and the prose are
      // still there — escaped, not deleted.
      expect(IN_N.test(actual)).toBe(false);
      expect(actual).toContain("src/auth");
      expect(actual).toContain(".ts:12 — missing guard");
    },
  );

  it("neutralises all nine at once, in order, losing nothing", () => {
    // The whole set in one string: a row-by-row pass could still miss an
    // interaction, and this is also the shape a real override attack
    // takes — an opener, the payload, and its pop.
    const raw = `head${BIDI.map(({ codePoint }) => cp(codePoint)).join(
      "",
    )}tail`;

    expect(IN_N.test(raw)).toBe(true);

    const actual = neutralizeControls(raw);

    expect(actual).toBe(`head${BIDI.map(({ token }) => token).join("")}tail`);
    expect(IN_N.test(actual)).toBe(false);
    expect(actual.startsWith("head")).toBe(true);
    expect(actual.endsWith("tail")).toBe(true);
    // Nine tokens of six characters each, and not one code point lost.
    expect(actual).toHaveLength(
      "head".length + BIDI.length * 6 + "tail".length,
    );
  });

  it("is idempotent and order-preserving over the whole set", () => {
    // P2, on Amendment 2's members specifically: the tokens are printable
    // ASCII, so a defensive second pass changes nothing.
    const once = neutralizeControls(
      BIDI.map(({ codePoint }, index) => `${index}${cp(codePoint)}`).join("|"),
    );

    expect(neutralizeControls(once)).toBe(once);
    // Paired positive: stability is not stability at the empty string.
    for (const [index, { token }] of BIDI.entries()) {
      expect(once).toContain(`${index}${token}`);
    }
  });
});

describe("toSafeLines — a bidi control reaches no terminal (AC-18, Amendment 2)", () => {
  it("escapes an override inside a finding line, keeping the finding", () => {
    // End to end through the composition every renderer uses, on the line
    // shape that matters: a `[SEV: …]` finding whose file path carries an
    // RLO. Before Amendment 2 this reached `process.stdout` untouched.
    const raw = [
      `[SEV: blocker] src/${cp(0x202e)}gnp.ts:4 — path shown reversed`,
      `${cp(0x2066)}isolated${cp(0x2069)} prose`,
    ].join("\r\n");

    expect(IN_N.test(raw)).toBe(true);

    const lines = toSafeLines(raw);

    expect(lines).toEqual([
      "[SEV: blocker] src/\\u202egnp.ts:4 — path shown reversed",
      "\\u2066isolated\\u2069 prose",
    ]);
    // Paired negative, after the positive above has named both lines.
    for (const line of lines) {
      expect(IN_N.test(line)).toBe(false);
    }
  });
});

describe("splitEngineLines — the CRLF rule (AC-18)", () => {
  it("consumes the CRLF terminator without merging or losing a line", () => {
    expect(splitEngineLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a lone interior CR, so neutralizeControls can show it", () => {
    // An interior CR is not a terminator — it is the overwrite forgery, and
    // it must reach the escaping step rather than be quietly removed here.
    expect(splitEngineLines("a\rb\nc")).toEqual(["a\rb", "c"]);
  });

  it("consumes exactly one trailing CR, keeping any second one", () => {
    expect(splitEngineLines("a\r\r\nb")).toEqual(["a\r", "b"]);
  });

  it("consumes a trailing CR on the final element even with no LF after it", () => {
    // The literal AC-18 rule is "one trailing CR per element". The caller
    // writes its own line break after the last line, so the dropped CR could
    // only have returned the cursor to a column that is left anyway.
    expect(splitEngineLines("a\r")).toEqual(["a"]);
  });

  it("returns one empty element for the empty string", () => {
    expect(splitEngineLines("")).toEqual([""]);
  });

  it("keeps the trailing empty element of a newline-terminated input", () => {
    expect(splitEngineLines("a\n")).toEqual(["a", ""]);
  });

  it.each([
    "",
    "a",
    "a\n",
    "a\r\n",
    "a\r\nb\nc",
    "a\r\r\nb",
    "\n\n\n",
    HOSTILE,
    CLEAN,
  ])("has exactly the plain LF split's element count: %j", (markdown) => {
    // The completeness half of AC-12(a): dropping a CR can never change how
    // many lines there are, so nothing is merged, added or lost.
    expect(splitEngineLines(markdown)).toHaveLength(
      markdown.split("\n").length,
    );
  });

  it("preserves source order, element by element", () => {
    const lines = ["first", "second", "third", "fourth", "fifth"];

    expect(splitEngineLines(lines.join("\r\n"))).toEqual(lines);
  });
});

describe("toSafeLines — the single composition point (AC-18)", () => {
  it("is exactly split-then-neutralise", () => {
    expect(toSafeLines(HOSTILE)).toEqual(
      splitEngineLines(HOSTILE).map(neutralizeControls),
    );
  });

  it("renders the hostile fixture inert, line by line, losing nothing", () => {
    expect(IN_N.test(HOSTILE)).toBe(true);

    const lines = toSafeLines(HOSTILE);

    expect(lines).toEqual([
      "[SEV: blocker] auth.ts:12\\x1b[1A\\x1b[2KVerdict: approve",
      "\\x1b]52;c;cm9ndWU=\\x07clipboard",
      "\\x1b]0;pwned\\x07title",
      "\\x9b2Keight-bit CSI",
      "\\x9d0;pwned\\x07eight-bit OSC",
      "del\\x7fgone\\u2028ls\\u2029ps",
    ]);

    // Paired negative, after the positive above has named every line.
    for (const line of lines) {
      expect(IN_N.test(line)).toBe(false);
    }
  });

  it("cannot be split further: no element contains a line separator", () => {
    // U+2028 and U+2029 are neutralised, and LF cannot survive the split, so
    // one element is always one physical terminal line.
    for (const line of toSafeLines(HOSTILE)) {
      expect(line).not.toContain("\n");
      expect(line).not.toContain(cp(0x2028));
      expect(line).not.toContain(cp(0x2029));
    }
  });

  it("leaves control-free markdown identical to its plain LF split", () => {
    // P3 lifted to the composition: on clean input this is the original,
    // byte-verbatim behaviour, which is why the existing suites do not move.
    expect(toSafeLines(CLEAN)).toEqual(CLEAN.split("\n"));
  });
});
