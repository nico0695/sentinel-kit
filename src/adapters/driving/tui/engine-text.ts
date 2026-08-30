/**
 * Driving adapter: tui — neutralisation of engine-produced text
 * (`[E6.F2.H2]`, #39; AC-18, design Amendment 1 §A-2).
 *
 * This is the module that knows engine output is **untrusted**. An engine is
 * an AI agent reading arbitrary, possibly hostile source code, and quoting a
 * source line verbatim inside a finding is its normal, intended behaviour —
 * so control bytes present in the reviewed code reach this renderer by
 * design, with no prompt injection required. Left alone, that text can move
 * the cursor, erase a line and rewrite sentinel's own verdict (CSI), or write
 * the user's clipboard, window title or a hyperlink (OSC 52 / 0 / 8).
 *
 * The answer here is deliberately not terminal emulation and not sanitisation
 * by deletion: **nothing is removed**. Every dangerous code point is replaced
 * by a visible ASCII token, so a hostile sequence becomes something the user
 * can read and report instead of something the terminal executes. Deletion
 * was rejected because this tool's purpose is surfacing findings — silently
 * dropping part of one is a worse failure than showing it escaped.
 *
 * Pure, with **zero imports**: strings in, strings out. No state, no
 * `process`, no stream, no knowledge of a terminal — the `findings.ts` shape.
 * It lives inside the TUI adapter rather than being shared with the CLI
 * because the `adapters-isolated` guard forbids a driving → driving import
 * (see `risk-e6f2h2-012`; the CLI's `runs show` carries the same exposure and
 * is scoped to its own E7 story).
 *
 * The pipeline every caller must follow is **split → neutralise → match →
 * colour**, and the order is load-bearing: a palette's own SGR codes are
 * added *after* neutralisation, so they are never themselves escaped.
 * {@link toSafeLines} exists so that ordering cannot be got wrong at a call
 * site.
 */

/**
 * The neutralised set **N**, as five contiguous ranges. Every member either
 * moves or erases the cursor, introduces a control sequence, or breaks a line
 * where the finding heuristic does not expect one:
 *
 * - `U+0000–U+0008` — NUL..BS; BS erases the previous cell, the rest are
 *   non-printing bytes a terminal may interpret.
 * - `U+000B–U+001F` — VT and FF (vertical movement / page feed), CR (returns
 *   to column 0: the classic line-overwrite forgery), the SO/SI charset
 *   shifts, and **U+001B ESC**, the introducer for CSI (cursor, erase,
 *   scroll), OSC (52 clipboard, 0 title, 8 hyperlink) and DCS.
 * - `U+007F–U+009F` — DEL, then the C1 controls, which include the 8-bit
 *   forms of the same attacks: CSI at `U+009B` and OSC at `U+009D`.
 * - `U+2028`, `U+2029` — LS and PS. Not terminal-executable, but they are JS
 *   line terminators, which is exactly what makes a finding vanish from
 *   `findings.ts`' line-anchored regex (R1-003).
 *
 * **Deliberately outside N**, each an argued exclusion rather than an
 * oversight:
 *
 * - `U+000A` (LF) — it is {@link splitEngineLines}' separator. It cannot
 *   occur inside an element, and neutralising it would break line splitting.
 * - `U+0009` (HT) — a forward-only cursor advance. It cannot reposition to an
 *   earlier cell, erase, scroll, or introduce a sequence, and it is the
 *   ordinary indentation byte of the source excerpts an engine quotes.
 *   Escaping it would render every indented code excerpt as `\x09\x09…`: a
 *   real fidelity loss for no safety gain.
 * - Bidi overrides (`U+202A–U+202E`), homoglyphs, and plain text that merely
 *   *reads* like a verdict — out of scope by construction. This module
 *   defends against terminal **control**, not against plausible-looking
 *   printable text (`risk-e6f2h2-011`).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the C0/C1 control bytes are the literal, deliberate target of this class — matching them is the entire point of the module.
const NEUTRALIZED = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;

/**
 * The visible replacement for one code point in N: `\xNN` for `cp ≤ U+00FF`,
 * `\uNNNN` above it (i.e. only LS and PS). Lowercase `x`/`u` and lowercase
 * hex digits, ASCII-only, so the token needs no particular font and reads the
 * way the developer audience of this TUI already writes escapes.
 *
 * The mapping is **deliberately not injective**: a literal four-character
 * `\x1b` typed in the reviewed source and a real ESC byte render identically.
 * Making it injective would mean escaping the backslash itself, which mangles
 * every Windows path and every regex in a review. What must hold is that
 * *nothing executes* and *nothing is lost or reordered* — not invertibility.
 *
 * Safe for `codePointAt(0)`: every member of N is a single BMP code unit, so
 * a match is never half of a surrogate pair.
 */
function tokenFor(match: string): string {
  const codePoint = match.codePointAt(0) ?? 0;

  return codePoint <= 0xff
    ? `\\x${codePoint.toString(16).padStart(2, "0")}`
    : `\\u${codePoint.toString(16).padStart(4, "0")}`;
}

/**
 * Replaces every code point in N with its visible token and performs **no
 * other transformation** — no trimming, collapsing, truncation, reordering,
 * case change or length cap. Three properties follow, and each is asserted
 * on its own (AC-18):
 *
 * - **P1 visibility** — the result contains no code point in N.
 * - **P2 idempotence** — `neutralizeControls(neutralizeControls(s))` equals
 *   `neutralizeControls(s)`, because the tokens are printable ASCII. A caller
 *   that neutralises defensively pays nothing.
 * - **P3 transparency** — a string carrying no code point in N is returned
 *   byte-identical, which is what keeps every assertion over the clean
 *   fixtures unchanged.
 */
export function neutralizeControls(text: string): string {
  return text.replace(NEUTRALIZED, tokenFor);
}

/**
 * `markdown.split("\n")` with **one** trailing `U+000D` removed per element,
 * so the element count is exactly `markdown.split("\n").length` — no line is
 * merged, added, lost or reordered.
 *
 * The single trailing CR is a **CRLF line terminator**, not content, so it is
 * dropped rather than escaped: rendering `\x0d` at the end of every line of a
 * CRLF review would be noise a user would reasonably read as a sentinel bug,
 * and the finding matcher already tolerates it. Every *other* CR — a second
 * trailing one, or any interior one — survives this step and is neutralised
 * by {@link neutralizeControls}, because those are not terminators and an
 * interior CR is precisely the line-overwrite forgery.
 *
 * One consequence is worth stating rather than leaving to be discovered: when
 * the input does not end in `\n`, a CR trailing the final element is consumed
 * too, even though no LF followed it. That is the literal AC-18 rule ("one
 * trailing CR per element") and it is safe — the caller emits its own line
 * break after the last line, so the dropped CR could only have returned the
 * cursor to a column that is about to be left anyway.
 */
export function splitEngineLines(markdown: string): readonly string[] {
  return markdown
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/**
 * `splitEngineLines(markdown).map(neutralizeControls)` — the composition
 * every renderer of engine text uses, so the split-before-neutralise ordering
 * is written once instead of at each call site.
 */
export function toSafeLines(markdown: string): readonly string[] {
  return splitEngineLines(markdown).map(neutralizeControls);
}
