# Design

## Routing Digest

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- digest_summary: Three pure modules inside `src/adapters/driving/tui/` — `findings.ts` (the `[SEV: …]` matcher), `colors.ts` (the ONLY `picocolors` importer, exporting a four-role palette plus an identity `PLAIN_PALETTE`), and a rewritten `render.ts` (`formatResultDigest` + `formatFullView`, both taking the palette as an explicit argument) — driven by two edited call sites and one shared post-persist `offerFullView` helper in `tui-flow.ts`. Colour determinism is dual: pure tests inject `PLAIN_PALETTE`; flow tests strip ANSI with a new test-double helper. Zero `src/core/**`, zero `src/main/**`, zero `tui-deps.ts` changes.
- affected_areas_digest: NEW `tui/findings.ts`, `tui/colors.ts`, `tui/__test__/{findings,full-view}.test.ts` (+ **Amendment 1**: NEW `tui/engine-text.ts`, `tui/__test__/engine-text.test.ts`) · MODIFIED `tui/render.ts`, `tui/tui-flow.ts`, `tui/__test__/{result.test.ts,tui-test-doubles.ts}`, `package.json`, `CLAUDE.md` · UNTOUCHED `tui/{index,tui-deps,clack-prompter}.ts`, `src/main/**`, `src/core/**`, `cli/**`, `.dependency-cruiser.cjs`.
- interfaces_digest: `matchFindingLine(line) → {severity,text} | undefined`; `extractFindings(lines) → readonly TuiFinding[]` (**Amendment 1**: takes already-neutralised lines, was `markdown: string`); `splitEngineLines(markdown) → readonly string[]`, `neutralizeControls(text) → string`, `toSafeLines(markdown) → readonly string[]` (**Amendment 1**, `engine-text.ts`); `TuiPalette` (`good`/`warn`/`bad`/`muted`); `formatResultDigest(digest, palette) → readonly string[]`; `formatFullView(markdown, palette) → readonly string[]`; `formatTuiErrorLine` unchanged.
- design_status: complete, **amended twice** — see §Amendment 1 (control-sequence neutralisation, fix round 1 of 2, `e6f2h2-D12`): the byte-verbatim full view is superseded by printable-text fidelity, engine text is neutralised before it renders or is matched, and R1-003's silent finding loss is closed at two layers. One conditional level-B escalation recorded earlier (tsconfig interop) has since been resolved at S1. No level-C item in either pass. See also §Amendment 2 (the repo owner's review of PR #76, `e6f2h2-D19`): the neutralised set widened to the nine bidi controls, and the optional post-run prompt guarded so it cannot change an already-decided exit code. Two files, both inside the TUI adapter; no level-B or level-C item.

## Summary

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- design_status: designed; **amended twice** (Amendment 1; Amendment 2) — Amendment 2 approved at `cp-pr76-owner-review` (`e6f2h2-D19`)

Turns spec.md's ACs (17, plus Amendment 1's AC-18..AC-21) into a file layout, four function signatures, the digest's literal copy, and the exact matching rule for the severity heuristic. D1–D5 are ratified as mechanisms, not reopened. Every AC is mapped to a mechanism and a file in §Acceptance Criteria Coverage.

## Design Overview

**One split, three reasons.** `render.ts` today is 52 lines holding `formatTuiErrorLine` + `formatTuiResult`. The story adds a line-matching heuristic, count/section composition, ANSI decoration and a full-view emitter. Growing one file would put the regex, the copy and the only `picocolors` import in the same place — precisely the thing AC-14 asks to be able to point at. The layout is therefore:

| Module | Owns | Imports |
|---|---|---|
| `findings.ts` (new) | the `[SEV: …]` matcher and the extractor. Pure, no colour, no core types. | none |
| `colors.ts` (new) | `TuiPalette`, `TUI_PALETTE` (real), `PLAIN_PALETTE` (identity). **The only file in `src/` that imports `picocolors`** — the `clack-prompter.ts` precedent, restated in its header comment. | `picocolors` |
| `render.ts` (rewritten) | `formatTuiErrorLine` (unchanged), `formatResultDigest`, `formatFullView`. Pure; receives the palette as an **explicit required argument**, never a module-level default. | `findings.js`, `colors.js` (type only), core `run`/`history` types, `node:path` |
| `tui-flow.ts` (edited) | picks `TUI_PALETTE`, adapts the two failure shapes, owns `offerFullView`. | `render.js`, `colors.js` |

Everything the tests need is a pure function over data. Nothing new touches `process`, stdin, or terminal state — the direct answer to `[E6.F2.H1]`'s CRITICAL R1-001 (a library owning the terminal). The full view is `io.stdout(line)` per line, exactly like every other TUI output.

**Colour determinism (AC-14), decided from picocolors' actual source.** The hoisted copy of `picocolors@1.1.1` (present in `node_modules` as a transitive dependency — read, not installed) computes `isColorSupported` **once at module load** from `NO_COLOR` / `--no-color` (force off) else `FORCE_COLOR` / `--color` / `win32` / `process.stdout.isTTY && TERM !== "dumb"` / **`!!env.CI`**. Two consequences: colour is already off under `NO_COLOR=1` for free, and it is ON under `FORCE_COLOR=1` *and in any CI run that sets `CI`*. Ambient detection can therefore never be trusted by an assertion, so determinism is engineered on both sides:

1. **Pure-function tests inject `PLAIN_PALETTE`** (four identity functions). `formatResultDigest`/`formatFullView` take the palette as a required parameter, so a test cannot silently inherit the ambient one.
2. **Flow tests strip ANSI.** `tui-flow.ts` uses the real `TUI_PALETTE`, so `result.test.ts` / `full-view.test.ts` compare `stripAnsi(line)`, using a new test-only helper in `tui-test-doubles.ts` (`replace(/\x1b\[[0-9;]*m/g, "")`). Under `NO_COLOR=1` it is a no-op; under `FORCE_COLOR=1` it removes the SGR codes. Both runs assert the same strings — which is exactly the AC-14 verification.

Colour stays decoration: the palette carries four *roles* (`good`, `warn`, `bad`, `muted`), `render.ts` chooses a role per fact, and every fact it colours (state, verdict, severity) is also present as plain text in the same line.

**Post-run prompt (AC-8/9/10/11, spec A6/A7) — verified against the code.** `TuiPrompter.confirm({message})` already exists (`tui-deps.ts:95`) and `createTuiDeps` (`src/main/container.ts:281`) needs no edit: **A7 confirmed, no contract change**. `tui-flow.ts` gains one helper called at the *end* of both branches:

```
persistRun catch branch  → digest(runDir: undefined) → 2× io.stderr → offerFullView(...) → return 1
persistRun success branch→ digest(runDir: persisted.runDir)        → offerFullView(...) → return 0
```

`offerFullView` returns immediately when the markdown is `undefined` or blank (AC-9: no prompt at all — the four-entry scripts in the other four suites stay valid), otherwise asks exactly one `confirm` and prints the full view only on `{kind:"answer", value:true}`. It never touches the return value, so the exit code stays a function of (completed, persisted) alone (AC-10), and it is unreachable before `persistRun` settles because it is only called after the `try`/`catch` resolves (AC-11; `persistRun` is still invoked exactly once, in the same place H1 put it).

**The heuristic (AC-3), stated precisely enough to become test cases.** For each element of `markdown.split("\n")`:

1. `trimmed = line.trim()` (this also absorbs a trailing `\r`) — *§Amendment 1 §A-2 moves trailing-CR handling into `splitEngineLines` and inserts `neutralizeControls` before this step; the trim itself is unchanged*;
2. strip leading list/quote markers: `/^(?:(?:[-*+>]|\d{1,3}[.)])\s+)+/` (repeatable, so `> - [SEV: …]` matches);
3. match `/^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*(.*)$/i` — case-insensitive on both `SEV` and the level, tolerant of inner spacing;
4. no match, or a level outside the four (`[SEV: critical]`) → the line is **not** a finding and is ignored;
5. severity = `toLowerCase()` of group 1; text = group 2 `.trim()` and **nothing else** — no re-split on `—`, so `calc.js:6-8 — …`, a hyphen separator, or no separator at all all survive. "Verbatim" means the remainder is never re-parsed; only its outer whitespace is normalised.

`extractFindings` maps the lines and keeps the matches in source order. The digest lists **all blockers first, then all majors** (source order within each group) — grouping is what makes "blockers at a glance" true even when an engine ignores the harness's severity ordering. `minor`/`nit` are counted only.

**Digest copy — fixed here, it is what the tests assert.** Lines are emitted in this order, each one conditional as shown:

```
Review result: <state>                                              always
Verdict: <verdict>                                                  when verdict exists
Verdict: none — no verdict was parsed for this run.                 when it does not
Failure: <stage> — <message>                                        when failure exists
Findings: 1 blocker, 2 major, 1 minor                               when ≥1 line matched (non-zero severities only, fixed order)
  [blocker] <text>                                                  one per blocker, then one per major
  [major]   <text>
Findings: none in the [SEV: …] format — the engine may report them differently; see the full review.
                                                                    when engineOutput exists and nothing matched
Run directory: <absolute path | ->                                  always
Full review: <runDir>/result.md                                     iff runDir !== undefined && engineOutput !== undefined
```

The findings section (either form) is emitted **iff `engineOutput !== undefined`** — keyed on the data, never on `state` (AC-5). The severity labels are pre-padded to a common width **before** colouring (`"[blocker]"`, `"[major]  "`), because padding a string that already carries SGR codes would misalign the column. The `Full review` path is built with `node:path`'s `join`, not string concatenation.

**Full view.** *(This paragraph is SUPERSEDED by §Amendment 1 §A-2/§A-6 and kept for the record.)* `formatFullView(markdown, palette)` returns `markdown.split("\n")` with each line that `matchFindingLine` recognises wrapped in its severity role, and **nothing else** — no header, no separator, no footer, no truncation marker, no line numbers. That is what makes AC-12's identity (`stripAnsi(emitted) === markdown.split("\n")`) hold, and it is why the split is on `"\n"` and not `/\r?\n/`: a `\r?\n` split would silently drop `\r` and break the identity on CRLF output. → **Amended**: the byte-verbatim identity is the confirmed vulnerability R1-002 and is now restricted to inputs carrying no control code point (AC-12(b)); the split becomes `splitEngineLines` (one trailing CR consumed per line) and every line is neutralised before colouring. The no-header/footer/marker rule and the per-line mapping survive unchanged.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driving/tui/findings.ts` | **NEW** — `FindingSeverity`, `TuiFinding`, `matchFindingLine`, `extractFindings`. Pure, zero imports. | low |
| `src/adapters/driving/tui/colors.ts` | **NEW** — `TuiPalette`, `TUI_PALETTE` (from `picocolors`), `PLAIN_PALETTE`. Header states the single-importer rule. | low |
| `src/adapters/driving/tui/render.ts` | **MODIFIED** — H1 boundary doc comment replaced by an H2 one (AC-15); `formatTuiResult` replaced by `formatResultDigest` + `formatFullView`; `formatTuiErrorLine` kept byte-identical (Q9/D4). | medium — the story's core surface |
| `src/adapters/driving/tui/tui-flow.ts` | **MODIFIED** — both result call sites (~L208, ~L218) rebuilt around `formatResultDigest`; new `offerFullView` helper; module doc gains a fifth property (post-run prompt cannot change the exit code). `persistRun` call untouched. | medium — exit-code and once-only invariants live here |
| `src/adapters/driving/tui/__test__/result.test.ts` | **REWRITTEN** — the four literal-tail assertions (`slice(-3)` L174/L226, `slice(-2)` L197/L262) become digest-contract assertions over `stripAnsi`ed output; the three `formatTuiResult` unit cases become `formatResultDigest` cases with `PLAIN_PALETTE`; H1 AC-8 coverage (exactly-once ×2, request identity, no-history diagnostic + exit 1) preserved. | medium — AC-15 supersession is reviewed here |
| `src/adapters/driving/tui/__test__/findings.test.ts` | **NEW TEST** — the AC-3 matrix on the pure matcher. | low |
| `src/adapters/driving/tui/__test__/full-view.test.ts` | **NEW TEST** — AC-8/9/10/12/13: 5-prompt scripts, the 3×2 exit-code matrix, ANSI-stripped verbatim identity, the 500-line no-truncation case. | low |
| `src/adapters/driving/tui/__test__/tui-test-doubles.ts` | **MODIFIED** — add the exported `stripAnsi` helper. `createScriptedPrompter` itself unchanged; the extra scripted answer is per-test (a fifth `answer(true)` / `answer(false)` / `cancel()`). | low |
| `package.json` | **MODIFIED** — `picocolors` exact-pinned into `dependencies` (`npm i -E picocolors`), the `@clack/prompts: "1.7.0"` precedent. | low |
| `CLAUDE.md` | **MODIFIED, last stage** — "Current state" epic facts + runtime-dependency list (AC-17). | low |
| `src/core/**` | **UNTOUCHED** — AC-16 asserts `git diff --stat src/core` is empty. | guard |
| `src/main/**`, `tui/{index,tui-deps,clack-prompter}.ts`, `cli/**`, `.dependency-cruiser.cjs`, the other four TUI suites | **UNTOUCHED** — verified: `confirm` already exists in `tui-deps.ts`; no TUI test outside `result.test.ts` sets `engineOutput` (`grep` returns zero hits), so AC-9 guarantees they never reach a fifth prompt. | verified |

## Interfaces, Data, And State

```ts
// findings.ts
export type FindingSeverity = "blocker" | "major" | "minor" | "nit";
export interface TuiFinding { readonly severity: FindingSeverity; readonly text: string; }
export function matchFindingLine(line: string): TuiFinding | undefined;
export function extractFindings(markdown: string): readonly TuiFinding[];

// colors.ts  — the only `import pc from "picocolors"` in src/
export interface TuiPalette {
  readonly good: (text: string) => string;   // ok state, approve
  readonly warn: (text: string) => string;   // ambiguous, request-changes, major
  readonly bad: (text: string) => string;    // failed states, blocker, failure line
  readonly muted: (text: string) => string;  // paths, counts, degradation notice, minor/nit
}
export const TUI_PALETTE: TuiPalette;    // green / yellow / red / dim
export const PLAIN_PALETTE: TuiPalette;  // four identity functions

// render.ts
export interface TuiResultDigest {
  readonly state: TerminalState;
  readonly verdict?: Verdict;
  readonly failure?: RunFailureRecord;   // { stage, message } — core/history public type
  readonly engineOutput?: string;
  readonly runDir?: string;
}
export function formatResultDigest(digest: TuiResultDigest, palette: TuiPalette): readonly string[];
export function formatFullView(markdown: string, palette: TuiPalette): readonly string[];
export function formatTuiErrorLine(error: unknown): string;   // unchanged
```

- **Why `RunFailureRecord`**: it is exactly `{ stage, message }` and is already the shape `persisted.record.failure` carries, so the persisted path passes it through untouched. The persist-failure path builds the same shape from the richer `RunReviewResult.failure` with `formatTuiErrorLine(result.failure.error)` — literally AC-6's wording, and the second intra-TUI consumer that spec A5 predicted. Both come from public core barrels (`core/run/index.js`, `core/history/index.js`); no guard is involved.
- **`exactOptionalPropertyTypes: true`** is on: `tui-flow.ts` must build `TuiResultDigest` with conditional spreads (`...(x !== undefined ? { verdict: x } : {})`), never `verdict: undefined`. Same for `runDir`.
- **State**: none added. No module-level mutable state anywhere; `picocolors`' own load-time `isColorSupported` snapshot is the only ambient value in play, and it is quarantined inside `colors.ts`.
- **Prompt gate source**: the persisted branch reads `persisted.record.engineOutput` (the same value `run-store-fs.ts:223` writes `result.md` from), the failure branch reads `result.engineOutput`. Verified: `persist-run.ts:126` copies it through unchanged.

## Acceptance Criteria Coverage

| AC | Mechanism | File(s) |
|---|---|---|
| AC-1 | `Review result:` always; `Verdict: <v>` or the explicit `Verdict: none — no verdict was parsed for this run.` line | `render.ts` · `__test__/result.test.ts` |
| AC-2 | `extractFindings` → blockers grouped first, then majors, each as `  [sev] <text>`; minor/nit only in the counts line | `findings.ts`, `render.ts` · `result.test.ts` |
| AC-3 | `matchFindingLine`: `trim` → strip `/^(?:(?:[-*+>]\|\d{1,3}[.)])\s+)+/` → `/^\[\s*sev\s*:\s*(blocker\|major\|minor\|nit)\s*\]\s*(.*)$/i`; remainder `.trim()`ed only. **§Amendment 1 §A-3/§A-4**: input is already neutralised, and the remainder group widens to `([^\n]*)` | `findings.ts`, `engine-text.ts` · `__test__/findings.test.ts` |
| AC-4 | zero matches + `engineOutput !== undefined` → the single `Findings: none in the [SEV: …] format …` line; no counts emitted | `render.ts` · `result.test.ts` |
| AC-5 | findings section / `Full review` line / prompt all keyed on `engineOutput`, never on `state`; `TuiResultDigest` carries no branch on `state` at all | `render.ts`, `tui-flow.ts` · `result.test.ts` (5 states × present/absent) |
| AC-6 | `Failure: <stage> — <message>`; message = `record.failure.message` (persisted) or `formatTuiErrorLine(result.failure.error)` (persist-failure) | `render.ts`, `tui-flow.ts` · `result.test.ts` |
| AC-7 | `Run directory:` always (`-` via the retained `ABSENT`); `Full review: join(runDir,"result.md")` iff `runDir !== undefined && engineOutput !== undefined` | `render.ts` · `result.test.ts` (3 cases) |
| AC-8 | `offerFullView`: blank-guard, one `confirm`, print only on `answer(true)` | `tui-flow.ts` · `__test__/full-view.test.ts` |
| AC-9 | the same blank-guard returns before prompting; four-entry scripts prove absence structurally (script exhaustion throws) | `tui-flow.ts` · `full-view.test.ts` |
| AC-10 | `offerFullView` returns `void`; the two `return 0` / `return 1` statements are unchanged and sit after it | `tui-flow.ts` · `full-view.test.ts` (3×2) |
| AC-11 | helper invoked only after the `persistRun` `try`/`catch` resolves, on both branches; the `persistRun` call itself untouched | `tui-flow.ts` · `result.test.ts` (`prompts.length === 4` at persist time) |
| AC-12 | ~~`formatFullView` = `markdown.split("\n")` + per-line colour only; split on `"\n"` (not `/\r?\n/`)~~ **SUPERSEDED, §Amendment 1 §A-6**: `toSafeLines(markdown)` + per-line colour only; no header/footer/marker (unchanged); completeness + restricted identity + non-executability | `render.ts`, `engine-text.ts` · `full-view.test.ts` + `stripAnsi` |
| AC-13 | no slicing, no pager, no second prompt anywhere in `offerFullView` | `tui-flow.ts` · `full-view.test.ts` (500 lines) |
| AC-14 | `picocolors` exact-pinned; imported only in `colors.ts` (grep-verifiable, header-documented); role palette + `PLAIN_PALETTE` + `stripAnsi` make assertions env-independent | `package.json`, `colors.ts`, `tui-test-doubles.ts` · adapters project under `NO_COLOR=1` and `FORCE_COLOR=1` |
| AC-15 | the four literal-tail assertions rewritten; the three `formatTuiResult` cases replaced; AC-8 block preserved; `render.ts` doc comment rewritten to the H2 boundary | `render.ts`, `result.test.ts` · diff review + PR description |
| AC-16 | no cross-adapter import (nothing under `cli/` is touched, `formatTuiErrorLine` stays duplicated); no core file opened | whole diff · `npm run check` + `npm test` + `git diff --stat src/core` |
| AC-17 | closeout edit scheduled as the plan's last stage (H1 D0 precedent) | `CLAUDE.md` |
| AC-18 | `engine-text.ts`: `splitEngineLines` + `neutralizeControls` + `toSafeLines`; the neutralised set N and the `\xNN`/`\uNNNN` token, P1/P2/P3 | `engine-text.ts` · `__test__/engine-text.test.ts` (§A-2) |
| AC-19 | ordering (`toSafeLines` before `extractFindings`) **and** `([^\n]*)`; asserted at both layers | `render.ts`, `findings.ts` · `findings.test.ts` + `result.test.ts` (§A-3, §A-4) |
| AC-20 | decoration asserted against a deterministic palette (`MARKED` / `createColors(true)`); the flow's palette choice made observable (recommended: a scoped `vi.mock` of `colors.js`) | `full-view.test.ts`, `result.test.ts` (§A-7) |
| AC-21 | four comment citations qualified as `[E6.F2.H2]` | `tui-flow.ts` (§A-8) |

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| One grown `render.ts` vs the `findings` / `colors` / `render` split | **split** | Keeps the only `picocolors` import in a 20-line file AC-14 can point at, and makes the heuristic unit-testable without any rendering copy in the assertions. |
| Palette as an explicit parameter vs a module-level default in `render.ts` | **explicit parameter** | A default would let a test silently inherit the ambient, `CI`-dependent palette. A required argument makes `PLAIN_PALETTE` impossible to forget. |
| Palette injected through `TuiDeps` / `createTui(deps, palette)` | **rejected** | Would change the `tui-deps.ts` contract and `src/main/container.ts` for zero test benefit — `stripAnsi` already makes flow assertions deterministic. Keeps A7's "no contract change" true. |
| ANSI-stripping in assertions vs a colour seam | **both, at different layers** | Pure functions get the seam (exact strings, no regex in the assertion); the flow gets stripping (it legitimately uses the real palette). Either alone leaves one layer env-dependent. |
| A `picocolors`-confinement rule in `.dependency-cruiser.cjs` | **not added** | There is no such rule for `@clack/prompts` either; confinement is a documented + reviewed convention here. Adding a sixth guard edits the PRD §4.5 enforcement file — out of this spec's scope, and a B-level change if ever wanted. |
| Re-splitting the finding on `—` into `file:line` + summary | **rejected (spec A8)** | Carrying the remainder verbatim removes em-dash / line-range / separator fragility at no cost: only the severity is needed for grouping and colour. |
| Listing blocker/major in source order vs grouped | **grouped (blockers first)** | The harness asks engines to order by severity, but nothing enforces it; grouping is what makes the backlog's "blockers at a glance" true regardless. |
| Header/footer around the full view | **rejected** | Would break AC-12's `stripAnsi(emitted) === markdown.split("\n")` identity, the story's honesty guarantee. |
| Everything in `result.test.ts` vs three files | **three files** | ~20 new cases across three concerns; splitting mirrors the module layout and keeps the AC-15 supersession legible in the diff. `result.test.ts` remains the file the spec names. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| `picocolors` resolved version and import form | The design is written against `1.1.1` **read from the hoisted transitive copy in `node_modules`**, not from an install: CJS, `main: ./picocolors.js`, `types: ./picocolors.d.ts` with `export = picocolors`, no `exports` map. `npm i -E picocolors` may resolve a different version. | plan stage S1 | **assumption to confirm at install time** — S1 must (a) pin the exact resolved version, (b) confirm the colour functions are on the default export, (c) confirm `import pc from "picocolors"` typechecks. Do not assume; H1's design guessed a clack version and the executor had to stop. |
| Default-import interop under this tsconfig | `tsconfig.json` has `module/moduleResolution: NodeNext` + `verbatimModuleSyntax: true` and **no `esModuleInterop`**. `import pc from "picocolors"` is the runtime-correct form (default === `module.exports` === the colours object). `import * as pc` is runtime-**wrong** here: cjs-module-lexer sees `module.exports = createColors()` (a call) and would expose only `default` + `createColors`, so `pc.red` would be `undefined`. | plan stage S1 | open — if `tsc --noEmit` rejects the default import, the minimal fix is `"allowSyntheticDefaultImports": true` (type-only, no emit change). That edits repo-wide config → **level B, stop and ask**; do not silently change `tsconfig.json`. |
| Digest copy wording | Tests assert literal strings; QA validates copy against this file. | implementation | **closed here** — the block in §Design Overview is the contract. Deviating from it is a design deviation, not an implementation detail. |
| Colour determinism mechanism | AC-14 runs the suite under both env settings. | implementation | **closed here** — `PLAIN_PALETTE` for pure tests, `stripAnsi` for flow tests. |
| Module layout / `picocolors` confinement point | AC-14 + the `@clack/prompts` precedent. | implementation | **closed here** — `colors.ts`, documented in its header. |
| `formatTuiResult` signature and the two call sites | The two branches carry different failure shapes. | implementation | **closed here** — `formatResultDigest(TuiResultDigest, TuiPalette)`; the raw branch normalises with `formatTuiErrorLine`. |

## Approval Notes

- D1–D5 ratified as mechanisms; none reopened. Spec A7 **verified against the code** (`tui-deps.ts:95` already declares `confirm`; `container.ts:281` needs no edit) — confirmed, not assumed.
- New A-level decisions recorded here, authorship `claude`: the three-module split; palette as a required argument; the four-role palette; the dual colour-determinism mechanism; grouping blockers before majors; splitting on `"\n"`; padding severity labels before colouring; `node:path.join` for the `Full review` path; reusing `RunFailureRecord` as the digest's failure shape; three test files instead of one.
- **No level-C item arose**: nothing in this design requires `src/core/**`. No second runtime dependency is introduced, so no new level-B question — except the *conditional* one above (tsconfig interop), which fires only if S1's typecheck rejects the default import.
- One risk appended to state: `risk-e6f2h2-007` (picocolors version/interop assumption, mitigated by making S1 an explicit verification stage).
- Next stage: `sddl-plan` — S1 must be "install + pin + confirm the API/typecheck" before any rendering code is written, and CLAUDE.md must be the last stage (AC-17).

## Budget Notes

- Above the lite word target, like the spec and like `[E6.F2.H1]`'s design: 17 ACs each need a named mechanism and file, and the digest copy plus the matching rule are literal contracts the tests assert. The tables are the parts `sddl-plan` and QA read.

## Amendment 1 — control-sequence neutralisation (fix round 1 of 2; `cp-review-gate-round-1` / `e6f2h2-D12`)

Fix round for the three CRITICALs the full-4r review returned over `59b806e..d8ad970`. This amendment does **not** reopen D1–D5 or any of the ten A-level decisions above: the module split, the required-argument palette, the four roles, blocker-before-major grouping, label padding before colouring and `node:path.join` all stand unchanged. It adds **one new pure module**, one composition rule inside `render.ts`, one signature change and one widened capture group in `findings.ts`, four comment edits in `tui-flow.ts`, and a set of test repairs. Zero `src/core/**`, zero `src/main/**`, zero `tui-deps.ts`, zero new dependency.

### A-1 — Empirical findings (probed against the target's own modules, not documentation)

Run before writing this amendment, against the shipped `FINDING_LINE` / `LIST_OR_QUOTE_PREFIX` and the hoisted `picocolors`:

1. **R1-003 reproduced.** With the shipped `/^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*(.*)$/i`, the inputs `[SEV: blocker] a.ts:2` + interior U+000D / U+2028 / U+2029 + `real` each return **`NO MATCH`**. JS `.` excludes all four line terminators and `$` without `m` matches only end-of-input, so the whole match fails and the finding disappears from the counts *and* the list. The trailing-CR case the suite does test (`findings.test.ts:131`) still matches, which is why the defect survived review.
2. **`([^\n]*)` alone is insufficient.** It restores the match for all three, but carries the **raw** U+000D / U+2028 / U+2029 into `finding.text`, which the digest then prints. It fixes the disappearance and leaves the injection.
3. **Neutralise-then-match fixes both** with the regex untouched: after `splitEngineLines` + `neutralizeControls`, the same inputs match and yield `a.ts:2\x0dreal`, `a.ts:2\u2028real`, `a.ts:2\u2029real`; the `ESC [1A ESC [2K` case yields `real\x1b[1A\x1b[2K`. Both layers are therefore specified (AC-19): ordering is the fix, the widened group is the fallback for a future caller that forgets it.
4. **`neutralizeControls` is idempotent and transparent.** `neutralizeControls(neutralizeControls(s)) === neutralizeControls(s)` (its tokens are printable ASCII), and a string with no code point in N is returned byte-identical — which is what preserves every existing assertion over the clean fixtures.
5. **CRLF splitting is line-count-safe.** `"a\r\nb\nc".split("\n")` is 3 elements; dropping one trailing CR per element gives `["a","b","c"]` — no line merged, added or lost.
6. **R3-002 confirmed at source.** `node_modules/picocolors/picocolors.js:22` is `let f = enabled ? formatter : () => String`; with `CI`/`FORCE_COLOR` unset, `TUI_PALETTE.good === String` is **true**, so `stripAnsi(TUI_PALETTE[role]("sentinel")) === "sentinel"` is literally `String("sentinel") === "sentinel"`. `pc.createColors(true).green("x")` returns real SGR, so a deterministic forced palette is available without a new dependency.
7. **A third engine-derived channel found, not in the ledger.** `engines/claude-code/envelope.ts:63-65` (`buildReviewErrorMessage`) returns `envelope.result` — the engine's own text — **verbatim** as the error message on the `is_error` path. That value becomes `failure.error.message`, then `record.failure.message` / `formatTuiErrorLine(...)`, then the digest's `Failure:` line, which `[E6.F2.H1]`'s block did not have. `collapseToOneLine`'s `/\s*\n\s*/g` removes neither ESC nor a lone CR (the CLI's `field()` uses `/[\t\r\n]+/g`, which at least removes CR — the two surfaces diverge here too).

### A-2 — New module: `src/adapters/driving/tui/engine-text.ts`

Pure, zero imports, no state, no `process` — the `findings.ts` shape. It is the single place that knows engine text is untrusted.

```ts
/** `markdown.split("\n")`, with one trailing U+000D removed per element. */
export function splitEngineLines(markdown: string): readonly string[];

/** Every code point in the neutralised set replaced by a visible ASCII token. */
export function neutralizeControls(text: string): string;

/** `splitEngineLines(markdown).map(neutralizeControls)` — the composition
 *  both renderers use, so the ordering cannot be got wrong at a call site. */
export function toSafeLines(markdown: string): readonly string[];
```

**The neutralised set N** (AC-18), and why each member is in it:

| Code points | Why neutralised |
|---|---|
| U+0000–U+0008 | NUL..BS — BS erases the previous cell; the rest are non-printing bytes a terminal may interpret |
| U+000B–U+000C | VT, FF — vertical movement / page feed |
| U+000D | CR — returns to column 0, the classic line-overwrite forgery. Only CRs that survive `splitEngineLines` reach here |
| U+000E–U+001F | SO/SI charset shifts … and **U+001B ESC**, the introducer for CSI (cursor, erase, scroll), OSC (52 clipboard, 0 title, 8 hyperlink) and DCS |
| U+007F | DEL |
| U+0080–U+009F | C1, including 8-bit **CSI U+009B** and **OSC U+009D** |
| U+2028, U+2029 | LS / PS — not terminal-executable, but they are JS line terminators and are exactly what breaks `FINDING_LINE` (R1-003); some copy/render paths treat them as breaks |

**Deliberately not in N**, each an A-level call recorded here:

- **U+000A (LF)** — it is the splitter's separator; it cannot occur inside an element of `splitEngineLines`, and neutralising it would break line splitting.
- **U+0009 (HT)** — forward-only cursor advance. It cannot reposition to an earlier cell, erase, scroll, or introduce a sequence, and it is the ordinary indentation byte of the source excerpts an engine quotes. Escaping it would render every indented code excerpt as `\x09\x09…` — a fidelity loss with no safety gain.
- **Bidi overrides / homoglyphs / plausible-looking plain text** — out of scope by construction; see `risk-e6f2h2-011`.

**Token shape**: `\xNN` (lowercase `\x`, two lowercase hex digits) for cp ≤ U+00FF; `\uNNNN` for U+2028/U+2029. ASCII-only, no font dependency, and immediately legible to the developer audience this TUI has.

*The mapping is deliberately not injective*: a literal four-character `\x1b` in the source and a real ESC byte render identically. Making it injective would require escaping the backslash itself, which mangles every Windows path and regex in a review. Accepted, because the properties that matter are **nothing executes** and **nothing is lost or reordered** — not invertibility.

**CRLF rule, and why it is a drop rather than an escape.** A CRLF terminator is a line ending, not content: rendering `\x0d` at the end of every line of a CRLF review would be noise a user would read as a sentinel bug. The matcher already tolerates it (`trim()` absorbs it, asserted at `findings.test.ts:131`), so consuming it keeps a tested, sane behaviour rather than regressing it. A **lone** CR — interior, i.e. not immediately before an LF — is not a terminator and is neutralised. **CORRECTION (orchestrator, S8, decision e6f2h2-D14):** this sentence originally read "interior, or trailing with no LF", which contradicted AC-18 and this section's own signature comment, `plan.md`'s S8 gotcha and the S8 handoff — all four say one trailing CR is consumed per element. The four prevail because AC-18 is the acceptance criterion. The divergence is a single input (`"a\r"`, a final element ending in CR with no LF after it) and it is a fidelity nit, not a safety hole: the caller writes its own line break after the last line, so a surviving CR could only return the cursor to a column that is immediately left, with nothing rendered after it to overwrite. It is also spec-consistent — AC-12(b)'s restricted identity covers only inputs carrying no code point in N, and CR is in N, so byte-identity was never claimed for this input. This supersedes the original design's "split on `"\n"` and never `/\r?\n/`" rationale: that rule existed only to protect the byte-verbatim identity AC-12 no longer asserts. Named consequence: `result.test.ts:900` changes from `["a\r", "b"]` to `["a", "b"]`.

### A-3 — Where it is applied: composition inside `render.ts`

The order is **split → neutralise → match → colour**, and it is load-bearing: the palette's own SGR codes are added *after* neutralisation, so they are never escaped, and everything the matcher and the renderers see is already safe.

```
formatFullView(md, palette)      = toSafeLines(md).map(line => colourIfFinding(line, palette))
formatFindingsSection(md, pal)   = extractFindings(toSafeLines(md)) → counts + listed lines
formatResultDigest(...)          = …, Failure: neutralizeControls(collapseToOneLine(message)), …
```

`toSafeLines(md)` is computed **once** per digest and shared by the findings section, so the pass is not duplicated.

**Signature change**: `extractFindings(lines: readonly string[])` instead of `extractFindings(markdown: string)`. Rationale: it keeps `findings.ts` at **zero imports** (its documented property) while making the ordering explicit and single-sourced in `render.ts`; a version that took the raw markdown and neutralised internally would have to import `engine-text.js` and would hide the ordering. *Alternative considered*: keep the string signature and neutralise inside — rejected for the two reasons above. Named consequence: `findings.test.ts:223` is rewritten to the array signature.

`matchFindingLine(line)` keeps its signature and gains a documented **precondition**: it takes one already-neutralised line. Because `neutralizeControls` is idempotent (A-1.4), a caller may neutralise defensively at no cost.

### A-4 — `findings.ts`: the second layer for R1-003

`FINDING_LINE`'s remainder group widens from `(.*)` to `([^\n]*)`. With A-3's ordering in place this is unreachable-by-design; it exists so that a future caller that forgets to neutralise gets a **visible, degraded** finding instead of a **silently deleted** one. The two failure modes are not symmetric: this tool's entire purpose is surfacing blockers, so a vanished blocker is the worse outcome. Both layers are asserted separately (AC-19), so neither can be dropped unnoticed.

`extractFindings`'s doc-comment loses its "a trailing `\r` is absorbed by the per-line `trim()`" note (now `splitEngineLines`' job) and gains the precondition.

### A-5 — The failure line (A-1.7)

`formatResultDigest` renders `Failure: ${palette.bad(`${stage} — ${neutralizeControls(collapseToOneLine(message))}`)}`. `stage` is a `RunStage` union member and is not neutralised. This composes with `risk-e6f2h2-010`'s already-planned collapse rather than replacing it: collapse handles line breaks (D9, one fact per physical line), neutralisation handles control bytes. Order matters only in that collapse runs first, so a real `\n` becomes a space rather than `\x0a`.

### A-6 — `formatFullView`'s replacement identity

The original AC-12 identity is deleted as a *universal* claim and restored as a *restricted* one:

| | Original | Amendment 1 |
|---|---|---|
| Identity | `stripAnsi(emitted) === md.split("\n")` for **all** inputs | the same equality for every input **containing no code point in N** (AC-12(b)) — guaranteed by A-1.4 transparency |
| Completeness | implied by the identity | stated separately: `emitted.length === md.split("\n").length`, element *i* from source line *i* (AC-12(a)) |
| Safety | none — the identity *mandated* replaying OSC 52 / OSC 0 / OSC 8 / CSI | no code point in N survives, after the palette's own SGR is stripped (AC-12(c)) |

The three together are strictly stronger than the original: they keep everything it guaranteed about content and add the guarantee it lacked about behaviour. Header/footer/marker remain rejected for the same reason as before — they would break (a) and (b).

### A-7 — Test-verification repairs (R3-002, R3-001)

**(a) R3-002.** The six assertions at `full-view.test.ts:429-434` (`it.each(ROLES)` over `TUI_PALETTE`) and the two at `:449-460` / `:462-469` that compare `TUI_PALETTE`-rendered output through `stripAnsi` are tautologies under the mandated local gate (A-1.6). Repair, in preference order:

1. **Recommended** — assert decoration against a deterministic palette: the `MARKED` double already in `result.test.ts:452-457` (in-repo precedent, no dependency surface), keeping one `TUI_PALETTE`-vs-`PLAIN_PALETTE` comparison as the *env-dependent* case and labelling it as such.
2. `pc.createColors(true)` in a test-only helper — real SGR, deterministic, but re-imports `picocolors` outside `colors.ts`, weakening AC-14's grep-verifiable single-importer rule (the test tree is not `src/`, so the rule survives in letter; it still reads worse).

Either way the block's doc-comment — which currently claims these are "invariants BETWEEN the palettes and `stripAnsi`, never an assertion about the ambient decision" — must be corrected to state what the rewritten block actually proves.

**(b) R3-001.** Nothing distinguishes the flow passing `TUI_PALETTE` from `PLAIN_PALETTE` at `tui-flow.ts:242`, `:272`, `:329`. Two admissible mechanisms:

1. **Recommended** — `vi.mock("../colors.js", …)` in one flow suite, replacing `TUI_PALETTE` with a marking palette so the flow's emitted lines carry `<good>`/`<bad>` markers. Deterministic, env-independent, and it distinguishes precisely. `vi.mock` is already house-style in this repo (`engines/claude-code/__test__/claude-code-adapter.test.ts:449`, `engines/opencode/__test__/opencode-adapter.test.ts:714`), so this introduces no new technique. It must be scoped to a dedicated file — `vi.mock` is hoisted file-wide, the exact hazard `opencode-adapter.test.ts:495-497` documents.
2. Assert `flowLines === formatResultDigest(expectedDigest, TUI_PALETTE)` — cheap, but non-vacuous only when colour is actually on (i.e. in CI, where `CI` is set), and vacuous under the local gate. Acceptable only if paired with a comment saying so.

Do **not** solve (b) by injecting the palette through `TuiDeps` — that reopens the design's explicit rejection and would edit `src/main/container.ts`.

### A-8 — Comment hygiene (R2-001)

`tui-flow.ts:220` `(AC-7)`, `:231` `AC-6:`, `:252` `(AC-10)`, `:259` `AC-5:` become qualified `[E6.F2.H2]` citations. The module header pins the file to `[E6.F2.H1]` and its other bare numbers still denote live H1 criteria; `:220`'s bare "AC-7" currently resolves against H1's AC-7 — the criterion AC-15 deletes. The header's Property 5 already uses the qualified form, so this is consistency, not a new convention. `:11`'s "Four properties" / five-item list (R2-002) may be corrected in the same pass at no cost, though it is not an AC.

### A-9 — Affected areas delta

| Path | Change | Risk |
|---|---|---|
| `tui/engine-text.ts` | **NEW** — `splitEngineLines`, `neutralizeControls`, `toSafeLines`. Pure, zero imports | low |
| `tui/__test__/engine-text.test.ts` | **NEW TEST** — the AC-18 boundary table plus P1/P2/P3 | low |
| `tui/render.ts` | **MODIFIED** — `toSafeLines` composition in `formatFullView` and `formatFindingsSection`; `neutralizeControls` on the failure message; doc comments restated (AC-12 is no longer byte-verbatim) | medium — the story's core surface |
| `tui/findings.ts` | **MODIFIED** — `extractFindings(lines)`; `FINDING_LINE` remainder `([^\n]*)`; precondition documented | medium — R1-003 lives here |
| `tui/tui-flow.ts` | **MODIFIED** — comments only (A-8). No behaviour change | low |
| `tui/__test__/{result,findings,full-view}.test.ts` | **MODIFIED** — two named assertion changes (`result.test.ts:900`, `findings.test.ts:223`), the AC-2/6/12/19 additions, and the A-7 repairs | medium |
| `src/core/**`, `src/main/**`, `tui/{colors,index,tui-deps,clack-prompter}.ts`, `cli/**`, `package.json`, `.dependency-cruiser.cjs` | **UNTOUCHED** | guard |

Note on placement: the neutraliser stays inside the TUI adapter. `cli/render/format-runs.ts:188` has the same exposure (`risk-e6f2h2-012`), but the `adapters-isolated` guard forbids driving → driving imports, so sharing would mean either a sixth guard exemption or a second copy — both out of this story's scope (D4). This is the same reasoning that keeps `formatTuiErrorLine` duplicated (Q9).

### Amendment approval notes

- No D-level decision reopened; no new B-level item (no dependency, no public API, no config format, no `tsconfig.json`); **no level-C item** — nothing here requires `src/core/**`, and `risk-e6f2h2-004`'s guard still stands.
- New A-level decisions recorded, authorship `claude`: the neutralised set N and its two deliberate exclusions; the `\xNN`/`\uNNNN` token shape and its accepted non-injectivity; the CRLF drop-vs-escape rule; `engine-text.ts` as a separate module; `toSafeLines` as the single composition point; `extractFindings(lines)`; the widened `([^\n]*)` as a second layer; neutralising the failure message; and the two recommended test mechanisms in A-7.
- Two risks appended: `risk-e6f2h2-011` (printable-text spoofing is a named non-goal), `risk-e6f2h2-012` (the CLI and the H1 catch-all carry the same exposure and stay out of scope).
- Next stage: `sddl-plan` — a fix stage seeded from `R1-001`, `R1-002`, `R1-003`, `R3-002`, `R3-001`, `R2-001`, ordered `engine-text.ts` + its suite first (nothing else can be validated before it exists), then `findings.ts`, then `render.ts`, then the test repairs, then the comment pass. Then `stage_approval`, then `sddl-executor`. No direct edits.

## Amendment 2 — bidi controls in N, and a guarded optional prompt (`cp-pr76-owner-review` / `e6f2h2-D19`)

Fix round for the two warnings the repo owner raised on PR #76, both reproduced against the shipped modules before this section was written. It reopens **no** decision above and none of Amendment 1's: the module split, the pipeline order (split → neutralise → match → colour), the token shape, the CRLF rule, `toSafeLines` as the single composition point, the required-argument palette and `findings.ts`' `SPACE` class all stand unchanged. It changes **one character class** and adds **one wrapper function**. Zero `src/core/**`, zero `src/main/**`, zero `tui-deps.ts`, zero new dependency, zero new import.

### B-0 — Empirical findings (probed against the shipped modules, not documentation)

1. **All nine bidi controls pass through raw.** Feeding `'a' + ch + 'b'` through the shipped `NEUTRALIZED` class returns the input unchanged for U+202A LRE, U+202B RLE, U+202C PDF, U+202D LRO, U+202E RLO, U+2066 LRI, U+2067 RLI, U+2068 FSI and U+2069 PDI. They reach `process.stdout` exactly as the engine emitted them.
2. **`tui-flow.ts` awaited `offerFullView` unguarded at both call sites.** A throw propagates through `runTuiFlow` into `createTui`'s catch-all, which prints one line and returns **1** — for a run that completed and was persisted, where the module's Property 5 and AC-10 both promise 0.
3. **The failing path does not need a test double, but not the one first claimed.** `offerFullView`'s print loop calls `io.stdout`, wired in `src/main/container.ts` to `process.stdout.write` (re-review correction, S12: a piped `sentinel | head` never reaches this code — `createTui.run()` gates the whole flow on both streams being real TTYs — and Node does not throw synchronously on EPIPE for a pipe write in any case; the write completes and the error surfaces later as an unhandled `'error'` event. The actually-reachable failure is a TTY write failing mid-print — e.g. `EIO` on terminal hangup, which is synchronous on POSIX unlike a pipe write — or a prompter throwing/rejecting synchronously). R3's refutation of `R4-001` (that `@clack/core`'s promise has no reject parameter, so the *prompt* cannot reject) is correct and does not cover the print loop, and the print loop's own real failure mode is a TTY write error, not the pipe scenario originally named.
4. **Nothing else in the tree is whitespace- or order-sensitive to the widening.** The nine are not JS whitespace, so `findings.ts`' `SPACE` class, `trim()` and `LIST_OR_QUOTE_PREFIX` treat a raw bidi control and its token identically — both fail to match a structural whitespace position. Recognition parity is exact before and after, so no RR1-001-shaped regression is possible and `findings.ts` needs no edit.

### B-1 — The neutralised set widens by two ranges

`NEUTRALIZED` gains `\u202a-\u202e` and `\u2066-\u2069`. Nothing else in `engine-text.ts` changes:

| | before | after |
|---|---|---|
| Ranges in N | 5 | **7** |
| Token shape | `\xNN` for cp ≤ U+00FF, `\uNNNN` above | **unchanged** — all nine are above U+00FF, so they take the existing `\uNNNN` form |
| `tokenFor` | — | **unchanged**, not one line |
| P1 / P2 / P3 | hold | hold — the tokens are printable ASCII, so idempotence and transparency are unaffected |
| Deliberate exclusions | LF, HT, bidi, homoglyphs | LF, HT, **homoglyphs only** |

**Why these nine and not a wider Unicode "format character" class.** The nine are exactly the code points that instruct the bidi algorithm to reorder the surrounding run. `U+200E`/`U+200F` (LRM/RLM) mark direction for a single character without opening a scope, and `U+206A–U+206F` are deprecated format controls that reorder nothing; neither is a reordering scope, and pulling them in would widen the blast radius without closing anything the owner reported. The boundary table pins the two new edges with three printable neighbours — `U+202F`, `U+2065`, `U+206A` — so a future widening cannot happen silently.

**Why this is not the homoglyph problem.** A homoglyph is unpreventable by any byte transformation: the code point is a legitimate letter and no rule distinguishes it from prose. The bidi set is finite, enumerable and closed, and its members have no legitimate role inside a quoted source excerpt. `risk-e6f2h2-011`'s original rationale — that neutralising bidi "would mangle legitimate RTL review text" — does not survive contact: a terminal renders RTL script right-to-left from the script's own character properties, without an explicit override in the byte stream.

**Formatting note (level A, `claude`).** The widened class pushes the statement past the 80-column line width, so the `biome-ignore` suppression moved from above `const NEUTRALIZED =` to directly above the regex line — biome suppressions apply to the *next* line, and leaving it where it was made `noControlCharactersInRegex` fire. No behaviour change; verified by `biome check` on the file.

### B-2 — The optional prompt is guarded at the call site

One new private function in `tui-flow.ts`, and both call sites move to it:

```ts
async function offerFullViewSafely(io, prompter, engineOutput): Promise<void> {
  try {
    await offerFullView(io, prompter, engineOutput);
  } catch (error) {
    io.stderr(`${FULL_VIEW_FAILED} ${formatTuiErrorLine(error)}`);
  }
}
```

- **A wrapper, not a `try` inside `offerFullView`.** The guard is then a named, separately readable unit whose whole content is the invariant, and `offerFullView` keeps its single-purpose body. It also keeps the two call sites symmetric — the shape a reviewer checks by eye.
- **The exit codes themselves are untouched.** `persistRun` still runs exactly once, strictly before the prompt; the two `return 0` / `return 1` statements are unchanged, and the guard adds one `stderr` line and nothing else. On the persist-failure branch the exit code was already 1, so the fix is visible there only in the *reporting*: the branch's own two diagnostics stand and the new one is appended, rather than the raw throwable replacing everything at the catch-all.
- **One line, on `stderr`, stack-free.** The repo's split — user-facing output on `stdout`, diagnostics on `stderr`, never a raw stack — with `formatTuiErrorLine` reused, exactly as the persist-failure branch already does.
- **Not neutralised, deliberately.** The throwable comes from the io / prompter seam, not from the engine, and the only engine-derived text reachable at that point (`formatFullView`'s output) has already been neutralised on its way in. Adding a defensive pass would mean importing `engine-text.js` into `tui-flow.ts` to protect a string that cannot carry engine bytes.
- **Property 5 becomes unconditional.** The module doc-comment states the amendment inline, including why R3's refutation of `R4-001` did not close it: the invariant's only defence was a runtime accident of the current prompter library, and the print loop bypasses that accident entirely.

### B-3 — Declined, and why it is recorded rather than silently skipped

The owner's non-blocking suggestion to inject the palette through `TuiDeps` instead of importing `TUI_PALETTE` in `tui-flow.ts` is **declined**. It reopens the design's explicit rejection of a palette seam, would edit `src/main/container.ts` — forbidden by `risk-e6f2h2-004`'s standing guard and AC-16's empty-diff requirement — and AC-20(b)'s `palette-wiring.test.ts` already proves the flow passes the real palette at all three call sites without it. The orchestrator declined it on the thread with reasons.

### B-4 — Affected areas delta

| Path | Change | Risk |
|---|---|---|
| `tui/engine-text.ts` | **MODIFIED** — two ranges added to `NEUTRALIZED`; the set's doc-comment gains the bidi bullet and keeps the superseded exclusion visible; the suppression comment moves one line down | low — one character class, no control flow |
| `tui/tui-flow.ts` | **MODIFIED** — `offerFullViewSafely` added, both call sites moved to it, Property 5 restated | low — additive, no branch removed, no exit code changed |
| `tui/__test__/engine-text.test.ts` | **MODIFIED** — `IN_N` widened, 12 boundary rows added (9 bidi + 3 printable neighbours), two describes added. **NAMED ASSERTION CHANGE**: the `U+202A LRE` row flips `survives` → `escaped` | low |
| `tui/__test__/result.test.ts` | **MODIFIED** — `IN_N` widened; the nine asserted end to end through `formatResultDigest` and `formatFullView`, plus the failure-message channel | low |
| `tui/__test__/full-view.test.ts` | **MODIFIED** — `IN_N` widened; the harness gains a rejecting prompter and a throwing-`stdout` io; six flow cases over {prompt rejects, print loop throws} × {persisted, persist-failed} | low |
| `src/core/**`, `src/main/**`, `tui/{findings,render,colors,index,tui-deps,clack-prompter}.ts`, `cli/**`, `package.json`, `.dependency-cruiser.cjs` | **UNTOUCHED** | guard |

### Amendment 2 approval notes

- No D-level decision reopened, no Amendment 1 mechanism reopened; no new B-level item (no dependency, no public API, no config format, no `tsconfig.json`); **no level-C item** — nothing here requires `src/core/**` or `src/main/**`.
- New A-level decisions recorded, authorship `claude`: the two ranges and their three pinned neighbours; excluding LRM/RLM and the deprecated `U+206A–U+206F` block; the wrapper shape rather than an internal `try`; the single composed `stderr` line; not neutralising the diagnostic; and the suppression-comment move forced by line width.
- One risk narrowed: `risk-e6f2h2-011` loses its bidi half and keeps its homoglyph half.
- Mutation contract for the executor: **M19** (remove the bidi ranges from N — the new cases red, every pre-Amendment-2 AC-18 case green) and **M20** (remove the guard — the new cases red, with the persist-failure cells failing on the *reporting* rather than the exit code, which is 1 either way).
