# Design

## Routing Digest

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- digest_summary: Internal decomposition of `extractBuiltInVerdict` into three file-private helpers (tail-window computation, narrow SGR stripping, distinct-verdict collection) wired in the exact pipeline order spec.md fixed (raw → window → strip → split/trim/match → collect → decide). One new co-located test file, `builtin-verdict-extraction.test.ts`, plus one test-only fixture-reconstruction/loader helper, `verdict-fixture-loader.ts`, both under `src/core/run/__test__/`. All 16 spec ACs have a proving test or inspection step. Two low-impact policy calls are flagged to the orchestrator rather than settled silently (tail-window tie-break on equal-length windows; defensive non-string-input coercion).
- scope_digest: This document fixes internals only — no change to spec.md's rules, no new files outside `builtin-verdict-extraction.ts`'s body, `fixtures/synthetic/**`, and `src/core/run/__test__/**`. Everything spec.md already fixed (the six rules, the window size, the fixture inventory, the 16 ACs) is treated as given, not re-derived.

## Summary

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- design_status: complete

This design fixes exactly what spec.md left to the design stage (Approval Notes, last bullet): the internal function decomposition of the parser, the exact test-file layout, and how the 12 real fixtures get their reconstructed text into tests. Everything else — the six parsing rules, the tail-window size and union rule, the inherited contradiction rule, the three synthetic fixtures' structure and mandatory size bounds, and the 16 acceptance criteria — is restated from spec.md as binding input, not reopened.

## Internal Decomposition

`src/core/run/builtin-verdict-extraction.ts` keeps its single export (`extractBuiltInVerdict`, same signature, same file — spec.md "File and naming decision") and gains three **file-private** (not exported, no `export` keyword) helper functions. None is exported from the file and none needs to be: every helper's behavior is fully observable through `extractBuiltInVerdict`'s return value for every planned test input (real fixtures, synthetic fixtures, and the inline AC-6..AC-10 strings), so there is no test that needs direct helper access. This is stated explicitly per the instruction to flag it if a test does need one — none does.

```ts
/** Rule 1: union of the last 30 lines and the last 2000 characters of `raw`, whichever span is longer by character count. At most the full input; a no-op (returns `raw` unchanged) when `raw` is shorter than both thresholds. */
function computeTailWindow(raw: string): string

/** Rule 5: strips narrow ANSI SGR sequences (`\x1b[<params>m`) from `window`. No other CSI sequences are recognized. Global replace — a window may contain more than one SGR code (the ANSI synthetic fixture has three). */
function stripAnsiSgr(window: string): string

/** Rules 2, 3, 6: splits `stripped` on `\n`, trims each line, matches the unchanged H1 marker regex against each trimmed line, and collects every distinct matched value. Fence tolerance and whole-window scanning require no special-case code here — they fall out of "check every trimmed line, don't special-case what surrounds it," which is exactly H1's original loop body, now run against the window instead of the full output. */
function collectDistinctVerdicts(stripped: string): Set<Verdict>
```

`extractBuiltInVerdict` becomes a five-line orchestrator over the three helpers plus the same contradiction decision H1 already had (unchanged: `Set` size 0 → `null`, size 1 → that value, size > 1 → `null`). The marker regex constant (`VERDICT_LINE`) stays module-level, unchanged from H1, and is used only inside `collectDistinctVerdicts`.

Why three helpers and not one inline block or four: `computeTailWindow` and `stripAnsiSgr` are independently testable-by-construction concerns with their own edge cases (window sizing math; SGR-only vs. general-CSI scope) that the spec discusses as separable rules (rule 1 and rule 5 each get their own paragraph and their own synthetic fixture). Splitting them keeps each function's edge cases legible without a test needing to reach inside — the synthetic fixtures exercise them from the outside, which is the point. `collectDistinctVerdicts` merges rules 2/3/6 into one function rather than three, because unlike 1 and 5 those three rules do not correspond to distinct code — they are properties of a single loop (no fence-stripping code, no anchoring code, no case-folding code exists to separate out; their "implementation" is the *absence* of special-casing). Naming a fourth function for "the decision at the end" (empty/single/multiple) was considered and rejected: it is two lines, has no edge case of its own beyond what the `Set` already encodes, and inlining it in `extractBuiltInVerdict` keeps the contradiction rule visible at the top level where H1 already had it, rather than hiding it one call deeper.

## Pipeline Order (fixed, not reorderable without a spec change)

Exactly as spec.md pins it — raw string first, stripping only after windowing:

1. **Normalize** — `const raw = typeof output === "string" ? output : String(output ?? "");` (see "Defensive input coercion" under Open Questions — flagged, not silently assumed).
2. **Compute tail window** — `const window = computeTailWindow(raw);` (rule 1, on the *raw*, unstripped string).
3. **Strip SGR within the window** — `const stripped = stripAnsiSgr(window);` (rule 5, applied only to the already-windowed slice, never to the full `raw`).
4. **Split into lines** — `stripped.split("\n")`.
5. **Trim each line** — `line.trim()`.
6. **Match** — `VERDICT_LINE.exec(trimmed)` per line (rules 2, 3, 6: fence-agnostic, position-agnostic within the window, case-sensitive exact).
7. **Collect distinct** — matched values accumulate into a `Set<Verdict>`.
8. **Decide** — size 0 → `null`; size 1 → that one value; size > 1 → `null` (contradiction rule, inherited, scope now the tail window per rule 1).

**The one consequence worth restating** (spec.md already fixes this; repeating it here because it is easy for an executor to "fix" as a bug): because windowing (step 2) runs on `raw` before stripping (step 3), ANSI escape bytes count toward the 2000-character budget of the tail-window computation. A hypothetical output with heavy SGR coloring in its last ~2000 raw characters would have a *smaller* effective plain-text tail than an unstyled output of the same visible length, since some of that budget is spent on escape bytes that step 3 later deletes. No fixture in this change is long enough to exercise that interaction (the ANSI synthetic fixture is a single short line), so it is documented behavior, not tested behavior. This design does not reorder steps 2 and 3 to "fix" that interaction — spec.md fixed the order deliberately (Approval Notes route this exact question to design, and the instruction above is explicit: pin the order, do not silently reorder it).

## Tail-Window Algorithm (rule 1, precise)

```ts
const TAIL_LINES = 30;
const TAIL_CHARS = 2000;

function computeTailWindow(raw: string): string {
  const tailByLines = raw.split("\n").slice(-TAIL_LINES).join("\n");
  const tailByChars = raw.slice(-TAIL_CHARS);
  return tailByChars.length > tailByLines.length ? tailByChars : tailByLines;
}
```

Concrete behavior on every edge case spec.md and the design brief call out:

- **Output shorter than both thresholds (the no-op case).** `raw.split("\n")` has fewer than 30 elements, so `.slice(-30)` returns *all* of them; `.join("\n")` is the exact inverse of `.split("\n")`, so `tailByLines === raw` byte-for-byte. Independently, `raw.slice(-2000)` on a string shorter than 2000 characters also returns the whole string, so `tailByChars === raw` too. Both branches equal `raw`; the ternary returns `raw` regardless of which "wins." This is the case spec.md verifies against `claude-code/valid-verdict.json` (402 chars / 4 lines) — confirmed by the arithmetic above, not just by inspection.
- **Fewer than 30 lines, but more than 2000 characters** (a handful of very long lines). `tailByLines` still equals the whole `raw` (same reasoning as above — slicing an array shorter than the slice count returns the whole array). `tailByChars` is a strict 2000-character suffix, shorter than `raw`. `tailByLines.length > tailByChars.length`, so the *whole output* wins — correct, since there is no earlier "line" to exclude; excluding characters only would arbitrarily cut mid-line for no provenance benefit.
- **Trailing newline.** `"a\nb\n".split("\n")` yields `["a", "b", ""]` — a trailing empty element. `slice` and `join` are exact inverses over the *whole* array (the no-op case above), so a trailing newline round-trips losslessly when the window is the full output. When the window is a strict suffix (more than 30 lines), the trailing empty element is simply one of the up-to-30 kept elements if it falls in range; it is never dropped or specially handled, and it can never itself match `VERDICT_LINE` (an empty trimmed line does not match `^VERDICT:...`), so it is inert with respect to rules 2/3/6.
- **"Whichever span is LARGER, concretely."** Both `tailByLines` and `tailByChars` are computed unconditionally (cheap: two string operations on at most `raw.length` characters each), then compared by `.length` — a plain JS string length (UTF-16 code unit count, matching how `.slice` and `.split` already index), and the longer one is returned. No line-counting or character-counting happens on the *result*; the comparison is a single numeric `>` on two already-materialized strings.
- **Tie (equal length).** See "Tail-window tie-break" under Open Questions — flagged, not silently decided, because it is the one branch where two different strings of the same length could theoretically disagree on content.

## Test File Layout

**One new test file**: `src/core/run/__test__/builtin-verdict-extraction.test.ts`. Not an extension of `run-review.test.ts` — that suite exercises `runReview`'s pipeline (worktree → diff → prompt → engine → parse → terminal state), of which parsing is one stage tested only through a couple of representative engine outputs (AC-1/AC-2/AC-3 headers already visible in that file's `describe` blocks target `runReview`'s state mapping, not the parser's internals). This story's 12 real + 3 synthetic + 5 inline-string ACs are a parser-only concern and belong beside the file they test, matching the existing `run-review.ts` ↔ `run-review.test.ts` co-location convention.

Matches vitest's `core` project include glob (`src/core/run/**/__test__/**/*.test.ts`, `vitest.config.ts`) automatically — no config change needed. Runnable in isolation via `npx vitest run --project core -t "extractBuiltInVerdict"` or by file.

**Structure** (mirrors `run-review.test.ts`'s `describe`/`it` nesting and naming style — AC ids in describe-block comments, one `it` per fixture or case):

```
describe("extractBuiltInVerdict", () => {
  describe("real fixtures — marker-bearing (AC-1)", () => { ... 4 its ... });
  describe("real fixtures — negative controls (AC-2)", () => { ... 8 its ... });
  describe("synthetic fixtures (AC-3, AC-4, AC-5)", () => { ... 3 its ... });
  describe("case sensitivity and fuzzy-match rejection (AC-6, AC-7)", () => { ... });
  describe("fence tolerance (AC-8)", () => { ... });
  describe("repeated-value collapse (AC-9)", () => { ... });
  describe("empty / absent input (AC-10)", () => { ... });
});
```

### Fixture reconstruction helper — test-only, new file

**`src/core/run/__test__/verdict-fixture-loader.ts`.** Sibling to `run-review-fixtures.ts`, same naming pattern (`<subject>-fixtures.ts` vs. this file's `<subject>-loader.ts` — named `-loader` rather than `-fixtures` because its job is reading bytes off disk and reconstructing text, not building in-memory request/deps shapes the way `run-review-fixtures.ts` does; keeping the two names distinct avoids a reader assuming they're interchangeable). **This file is test-only scaffolding, not production code**: it lives under `__test__/`, is therefore excluded from `depcruise src` (`.dependency-cruiser.cjs`'s `exclude: { path: "(^|/)__test__/" }`), and its file-reading/JSON-parsing logic must never be mistaken for the real envelope-parsing adapter work spec.md explicitly places out of scope for this story (E4.F2.x). A doc-comment at the top of the file states this plainly, following the precedent already set in `run-review-fixtures.ts`'s own top comment about `.dependency-cruiser.cjs`'s exclusion.

No existing test in the repo reads a fixture file from disk (`git-cli.test.ts` and the storage adapter tests use `node:fs` only to *write* hermetic tmp fixtures at test time, not to *read* checked-in files — confirmed by grep across `src/`), so there is no house convention to match; this design fixes one:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repo-root-relative path resolution: `__test__/` is 4 directories below repo root (__test__ → run → core → src → root). */
function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../../fixtures/${relativePath}`, import.meta.url));
}

/** Reads and JSON-parses a Claude Code fixture, returning `.result` — or `""` when the field is absent (`timeout-sigterm.json`), never throwing. */
export function reconstructClaudeCodeResult(relativePath: string): string {
  const doc = JSON.parse(readFileSync(fixturePath(relativePath), "utf-8")) as { result?: string };
  return doc.result ?? "";
}

/** Reads an OpenCode NDJSON fixture line by line, concatenating every `type: "text"` event's `part.text`, tolerating a truncated/non-JSON final line (`timeout-sigterm-partial.ndjson`). */
export function reconstructOpenCodeText(relativePath: string): string {
  const lines = readFileSync(fixturePath(relativePath), "utf-8").split("\n");
  let text = "";
  for (const line of lines) {
    if (line.trim() === "") continue;
    let event: { type?: string; part?: { text?: string } };
    try {
      event = JSON.parse(line);
    } catch {
      continue; // truncated / malformed final line — tolerated, not fed to the parser
    }
    if (event.type === "text" && typeof event.part?.text === "string") {
      text += event.part.text;
    }
  }
  return text;
}

/** Raw plain-text fixture (`unknown-model-stdout.txt`, and every `fixtures/synthetic/*.txt` file) — read verbatim, no reconstruction. */
export function readPlainTextFixture(relativePath: string): string {
  return readFileSync(fixturePath(relativePath), "utf-8");
}
```

Three exports, not one generic dispatcher keyed on file extension: the two reconstruction rules (`.result` extraction vs. NDJSON `text`-event concatenation) are exactly the two rules the fixture inventory table already names per engine, and keeping them as two named functions makes each test's `it` block state which reconstruction rule it is trusting, matching AC-1/AC-2's fixture-by-fixture phrasing. `readPlainTextFixture` covers `unknown-model-stdout.txt` (already plain text, not JSON) and all synthetic fixtures uniformly, including the ANSI one — `readFileSync(path, "utf-8")` reads the literal ESC (`0x1B`) byte correctly as a single UTF-8 code unit, no special decoding needed.

This helper module deliberately does **not** import anything from `src/adapters/` — the real `ReviewEngine` adapters' envelope-parsing logic is out of scope (spec.md, Out Of Scope) and does not exist yet for this shape anyway; the reconstruction here is a minimal, test-local reimplementation of just enough of the JSON/NDJSON shape to produce the plain string `extractBuiltInVerdict` receives, matching the fixture inventory table in proposal.md exactly (not a generic envelope parser).

## AC → Test Mapping (16/16 mapped)

| AC | Proving test / check | Location |
|---|---|---|
| AC-1 | 4 `it`s, one per marker-bearing real fixture, via `reconstructClaudeCodeResult`/`reconstructOpenCodeText`, asserting `"request-changes"` | `builtin-verdict-extraction.test.ts`, "real fixtures — marker-bearing" |
| AC-2 | 8 `it`s, one per negative-control real fixture, asserting `null` and that the call does not throw | `builtin-verdict-extraction.test.ts`, "real fixtures — negative controls" |
| AC-3 | 1 `it` against `fixtures/synthetic/decoy-then-genuine.txt` via `readPlainTextFixture`, asserting `"approve"` | `builtin-verdict-extraction.test.ts`, "synthetic fixtures" |
| AC-4 | 1 `it` against `fixtures/synthetic/contradiction.txt`, asserting `null` | `builtin-verdict-extraction.test.ts`, "synthetic fixtures" |
| AC-5 | 1 `it` against `fixtures/synthetic/ansi-wrapped-verdict.txt`: two assertions — `extractBuiltInVerdict(raw)` is `"approve"`, and a direct `VERDICT_LINE`-shaped regex check (inlined, not importing the private module regex) against the raw string shows no bare match | `builtin-verdict-extraction.test.ts`, "synthetic fixtures" |
| AC-6 | 2 inline-string `it`s: `"verdict: approve"`, `"Verdict: Approve"` → both `null` | `builtin-verdict-extraction.test.ts`, "case sensitivity" |
| AC-7 | 2 inline-string `it`s: `"VERDICT : approve"` (space before colon), `"VERDICT-approve"` → both `null` | `builtin-verdict-extraction.test.ts`, "fuzzy-match rejection" |
| AC-8 | 1 inline-string `it`: marker as the sole line inside a bare ` ``` ` fence (no engine noise) → `"approve"` | `builtin-verdict-extraction.test.ts`, "fence tolerance" |
| AC-9 | 1 inline-string `it`: two identical `VERDICT: approve` lines → `"approve"` (not `null`) | `builtin-verdict-extraction.test.ts`, "repeated-value collapse" |
| AC-10 | 2 inline `it`s: `extractBuiltInVerdict("")` → `null`; a long (>2000 char) non-JSON string with no marker-shaped line → `null`; neither throws | `builtin-verdict-extraction.test.ts`, "empty / absent input" |
| AC-11 | Not a unit test — manual: the persistence deferral paragraph (spec.md, "Persistence deferral") is copied verbatim onto issue #27's checklist before the PR is opened | executor/PR-open checklist step, verified at QA |
| AC-12 | Not a unit test — `git diff` inspection: `run-review.ts`, `index.ts`, `verdict.ts` show comment-only hunks | `git diff` review at QA / code review stage |
| AC-13 | Source inspection (`index.ts`'s export list unchanged, `extractBuiltInVerdict` absent from it) + `npm run check` (depcruise would not currently catch a missing export by itself, but nothing in this change re-adds it) | manual inspection + `npm run check` |
| AC-14 | `npm run check` (`depcruise src`) — no new import added anywhere in `builtin-verdict-extraction.ts`'s body (only `Verdict` from `./verdict.js`, already imported by H1); no cross-module import added | `npm run check` |
| AC-15 | `git diff --stat` — touches only `builtin-verdict-extraction.ts`, the four doc-comment files, `fixtures/synthetic/**`, `fixtures/README.md`, `src/core/run/__test__/**` | `git diff --stat` at PR-open |
| AC-16 | Full gate | `npm run check && npm test` |

No AC lacks a home. AC-11/12/13/14/15/16 are process/inspection checks rather than unit tests, which matches spec.md's own "Validation Hint" column for those rows (it names `git diff`, `npm run check`, and manual checks, not unit tests) — this design does not invent test coverage spec.md did not ask for.

## Synthetic Fixture Construction

All three are **static, checked-in files** under `fixtures/synthetic/` (new directory), generated once at executor time and committed as literal content — never generated at test-run time. Generating them dynamically inside the test file was considered and rejected: it would hide the exact bytes under test inside a generator function, making a future regression harder to eyeball-diff than a plain committed `.txt` file, and it re-introduces exactly the kind of "hint vs. actual bound" gap the spec-revalidation round already caught once (state.yaml, MAJOR finding 2) — a static file's size is checked once at authoring time with real `wc`, not re-derived by trusting a generator's math.

### `decoy-then-genuine.txt`

Structure per spec.md exactly: line 1 = `VERDICT: comment` (decoy), then filler, then a final line `VERDICT: approve` (genuine).

**Filler generation, chosen to clear both mandatory bounds (≥55 lines AND ≥2200 chars) with comfortable margin, not by a borderline construction:**

- Filler line text: a single fixed sentence ≥40 characters that does not match `VERDICT_LINE`, e.g. `This paragraph restates an unrelated implementation detail about the calculator's rounding mode and contains no verdict marker.` (131 characters including the line's own trailing newline).
- Repeat count: **60** filler lines (not 55 — deliberately above the minimum so a small future edit to the sentence text cannot accidentally regress the bound below the mandatory 2200-character floor).
- Resulting filler alone: 60 lines × 131 chars ≈ 7,860 characters — well over the 2200-character floor even before counting the decoy and genuine lines, and 60 lines clears the 55-line floor with 5 lines of margin.
- Full file: 1 (decoy) + 60 (filler) + 1 (genuine) = 62 lines; filler + decoy + genuine ≈ 7,900+ characters.

**Build procedure** (for the executor stage; not run by this design stage): generate with a short one-off script or shell loop (e.g. `for i in $(seq 60); do printf '%s\n' "<filler sentence>"; done`) piped between the decoy and genuine lines into the target file — not typed by hand 60 times.

**Mandatory post-build check** (spec.md requires this be *run*, not assumed): after writing the file,
```bash
wc -l fixtures/synthetic/decoy-then-genuine.txt   # must be > 56
wc -c fixtures/synthetic/decoy-then-genuine.txt   # must be > 2250
```
plus a decoy-offset check: the decoy line's distance from end-of-file must exceed 2000 characters — computable as `total-file-chars − chars-before-and-including-line-1`, or more simply by confirming `tail -c 2000` of the file does not contain the string `VERDICT: comment`. All three checks are expected to pass with large margin given the 60×131 construction above (filler alone is already ~4x the 2200-char floor), but the check is still run, not skipped, per spec.md's explicit instruction ("run it, do not assume").

Expected outcome: `"approve"`.

### `contradiction.txt`

Short, hand-written directly (no generation needed — well under both window thresholds by construction):

```
VERDICT: approve

Actually, reconsidering the edge case, I'll revise:

VERDICT: request-changes
```

5 lines, well under 30; well under 2000 characters. Both `VERDICT:` lines fall inside any tail window by construction. Expected outcome: `null`.

### `ansi-wrapped-verdict.txt`

Single content line, literal ESC (`0x1B`) bytes, no ordinary text editor risk: written via a shell command that emits the bytes directly rather than relying on a text-editing tool to preserve non-printing control characters faithfully —

```bash
printf '\033[1m\033[32mVERDICT: approve\033[0m' > fixtures/synthetic/ansi-wrapped-verdict.txt
```

`printf`'s `\033` octal escape is the standard, portable way to emit a literal ESC byte in a generated file (works identically under bash/zsh, no locale/encoding ambiguity, unlike attempting to paste a control character through an editor UI). No trailing newline — the single line is the entire file. Read back in the test via `readPlainTextFixture` (`readFileSync(path, "utf-8")`), which yields the exact same string content (`\x1b[1m\x1b[32mVERDICT: approve\x1b[0m`) a Node string literal using `\x1b` would produce, since ESC is a valid single-byte UTF-8 code point (`0x00`–`0x7F` range) — no multi-byte decoding pitfall.

Expected outcome: `"approve"` after stripping; the raw string does not match `VERDICT_LINE` directly (control bytes precede/follow the marker text on the same physical line, so even `.trim()` alone cannot recover a bare match — the SGR stripping step is what makes it match).

## Open Questions (flagged to the orchestrator, not silently settled)

1. **Tail-window tie-break on exactly equal lengths.** `computeTailWindow` returns `tailByChars` when strictly longer than `tailByLines`, else `tailByLines` — meaning `tailByLines` wins ties. This is a genuine (if narrow) behavioral choice: a constructed input where a 2000-character char-window and a 30-line line-window happen to have identical length but different starting content (the char cut lands off a line boundary the line-window respects) would resolve differently under the opposite tie-break. No real or currently-specified synthetic fixture reaches this branch — `decoy-then-genuine.txt` is built with several thousand characters of margin specifically so it does *not* land near this boundary. Recommendation: keep `tailByLines` winning ties (as written above) since it is the more "conservative" choice — a whole-line boundary is never a mid-token cut — but this is a design default, not a spec-derived rule, and is called out here rather than silently baked in.
2. **Defensive non-string-input coercion at the top of `extractBuiltInVerdict`.** The function's TypeScript signature is `(output: string) => Verdict | null` — a valid caller can never pass a non-string at compile time. Rule 4's phrase "non-string/undefined-ish input coerced to a string" most plausibly describes the *already-reconstructed* empty-string cases the real fixtures produce (e.g., `timeout-sigterm.json`'s absent `.result` reconstructs to `""`, not to `undefined`), not a runtime-coercion requirement inside the parser itself. This design adds one defensive line (`typeof output === "string" ? output : String(output ?? "")`) anyway, on the reasoning that it is free, strictly increases "never throws" robustness against a future caller that violates the type at a JS boundary (e.g., a misconfigured `deps.parseVerdict`), and changes no test's expected outcome (every planned input is already a real string). Flagged rather than assumed because it is technically beyond the letter of spec.md's six rules, all of which are typed against `output: string`.
3. **AC-13's "source inspection" step has no automated enforcement in this change.** `npm run check` does not independently verify that `extractBuiltInVerdict` stays out of `index.ts`'s export list — depcruise checks *import* direction, not *export* completeness, and no test imports `extractBuiltInVerdict` from `../index.js` expecting a compile failure (doing so would itself require a `// @ts-expect-error`-style negative test, which is unusual house style here). This design does not add one, since spec.md's own Validation Hint for AC-13 already names "source inspection + `npm run check`" as sufficient, not a dedicated negative test. Flagged so plan/executor does not assume a test enforces this beyond what spec.md already scoped.

## Approval Notes

- All three items above are low-impact policy defaults with a stated recommendation, consistent with A-level (technical, reversible) framing — none blocks routing to `sddl-plan`, but each is called out per the instruction to flag rather than silently decide anything observable.
- No deviation from spec.md's six rules, the tail-window size/union definition, the inherited contradiction rule, or the three synthetic fixtures' specified structure and mandatory size bounds. This design fixes *how* those rules are implemented and tested, not *what* they are.
- Recommended next stage: `sddl-plan`, to sequence the ~3 executor stages `d-lightweight-ceremony` targets — plausibly (1) implement the three helpers + orchestrator body in `builtin-verdict-extraction.ts` plus the four doc-comment updates, (2) build and post-build-check the three synthetic fixtures plus the `fixtures/README.md` provenance note, (3) write `verdict-fixture-loader.ts` and `builtin-verdict-extraction.test.ts` covering all 16 ACs, then run the full gate.

## Budget Notes

- Per `d-lightweight-ceremony`, this design stays proportionate to the ~3-executor-stage target: one file's internals, one new test file, one new test-only helper file, three new fixture files, no new production surface anywhere else. The AC-mapping table and the synthetic-fixture construction detail are kept full-length because they are exactly what an executor needs to build deterministically without re-deriving spec.md's mandatory size-bound arithmetic from scratch — the same class of gap the spec-revalidation round already found once and fixed.
