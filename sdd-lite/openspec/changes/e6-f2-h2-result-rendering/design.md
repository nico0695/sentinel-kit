# Design

## Routing Digest

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- digest_summary: Three pure modules inside `src/adapters/driving/tui/` — `findings.ts` (the `[SEV: …]` matcher), `colors.ts` (the ONLY `picocolors` importer, exporting a four-role palette plus an identity `PLAIN_PALETTE`), and a rewritten `render.ts` (`formatResultDigest` + `formatFullView`, both taking the palette as an explicit argument) — driven by two edited call sites and one shared post-persist `offerFullView` helper in `tui-flow.ts`. Colour determinism is dual: pure tests inject `PLAIN_PALETTE`; flow tests strip ANSI with a new test-double helper. Zero `src/core/**`, zero `src/main/**`, zero `tui-deps.ts` changes.
- affected_areas_digest: NEW `tui/findings.ts`, `tui/colors.ts`, `tui/__test__/{findings,full-view}.test.ts` · MODIFIED `tui/render.ts`, `tui/tui-flow.ts`, `tui/__test__/{result.test.ts,tui-test-doubles.ts}`, `package.json`, `CLAUDE.md` · UNTOUCHED `tui/{index,tui-deps,clack-prompter}.ts`, `src/main/**`, `src/core/**`, `cli/**`, `.dependency-cruiser.cjs`.
- interfaces_digest: `matchFindingLine(line) → {severity,text} | undefined`; `extractFindings(markdown) → readonly TuiFinding[]`; `TuiPalette` (`good`/`warn`/`bad`/`muted`); `formatResultDigest(digest, palette) → readonly string[]`; `formatFullView(markdown, palette) → readonly string[]`; `formatTuiErrorLine` unchanged.
- design_status: complete — one conditional level-B escalation recorded (tsconfig interop, fires only if S1's typecheck rejects the default import).

## Summary

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- design_status: designed, pending checkpoint

Turns spec.md's 17 ACs into a file layout, four function signatures, the digest's literal copy, and the exact matching rule for the severity heuristic. D1–D5 are ratified as mechanisms, not reopened. Every AC is mapped to a mechanism and a file in §Acceptance Criteria Coverage.

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

1. `trimmed = line.trim()` (this also absorbs a trailing `\r`);
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

**Full view.** `formatFullView(markdown, palette)` returns `markdown.split("\n")` with each line that `matchFindingLine` recognises wrapped in its severity role, and **nothing else** — no header, no separator, no footer, no truncation marker, no line numbers. That is what makes AC-12's identity (`stripAnsi(emitted) === markdown.split("\n")`) hold, and it is why the split is on `"\n"` and not `/\r?\n/`: a `\r?\n` split would silently drop `\r` and break the identity on CRLF output.

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
| AC-3 | `matchFindingLine`: `trim` → strip `/^(?:(?:[-*+>]\|\d{1,3}[.)])\s+)+/` → `/^\[\s*sev\s*:\s*(blocker\|major\|minor\|nit)\s*\]\s*(.*)$/i`; remainder `.trim()`ed only | `findings.ts` · `__test__/findings.test.ts` |
| AC-4 | zero matches + `engineOutput !== undefined` → the single `Findings: none in the [SEV: …] format …` line; no counts emitted | `render.ts` · `result.test.ts` |
| AC-5 | findings section / `Full review` line / prompt all keyed on `engineOutput`, never on `state`; `TuiResultDigest` carries no branch on `state` at all | `render.ts`, `tui-flow.ts` · `result.test.ts` (5 states × present/absent) |
| AC-6 | `Failure: <stage> — <message>`; message = `record.failure.message` (persisted) or `formatTuiErrorLine(result.failure.error)` (persist-failure) | `render.ts`, `tui-flow.ts` · `result.test.ts` |
| AC-7 | `Run directory:` always (`-` via the retained `ABSENT`); `Full review: join(runDir,"result.md")` iff `runDir !== undefined && engineOutput !== undefined` | `render.ts` · `result.test.ts` (3 cases) |
| AC-8 | `offerFullView`: blank-guard, one `confirm`, print only on `answer(true)` | `tui-flow.ts` · `__test__/full-view.test.ts` |
| AC-9 | the same blank-guard returns before prompting; four-entry scripts prove absence structurally (script exhaustion throws) | `tui-flow.ts` · `full-view.test.ts` |
| AC-10 | `offerFullView` returns `void`; the two `return 0` / `return 1` statements are unchanged and sit after it | `tui-flow.ts` · `full-view.test.ts` (3×2) |
| AC-11 | helper invoked only after the `persistRun` `try`/`catch` resolves, on both branches; the `persistRun` call itself untouched | `tui-flow.ts` · `result.test.ts` (`prompts.length === 4` at persist time) |
| AC-12 | `formatFullView` = `markdown.split("\n")` + per-line colour only; no header/footer/marker; split on `"\n"` (not `/\r?\n/`) | `render.ts` · `full-view.test.ts` + `stripAnsi` |
| AC-13 | no slicing, no pager, no second prompt anywhere in `offerFullView` | `tui-flow.ts` · `full-view.test.ts` (500 lines) |
| AC-14 | `picocolors` exact-pinned; imported only in `colors.ts` (grep-verifiable, header-documented); role palette + `PLAIN_PALETTE` + `stripAnsi` make assertions env-independent | `package.json`, `colors.ts`, `tui-test-doubles.ts` · adapters project under `NO_COLOR=1` and `FORCE_COLOR=1` |
| AC-15 | the four literal-tail assertions rewritten; the three `formatTuiResult` cases replaced; AC-8 block preserved; `render.ts` doc comment rewritten to the H2 boundary | `render.ts`, `result.test.ts` · diff review + PR description |
| AC-16 | no cross-adapter import (nothing under `cli/` is touched, `formatTuiErrorLine` stays duplicated); no core file opened | whole diff · `npm run check` + `npm test` + `git diff --stat src/core` |
| AC-17 | closeout edit scheduled as the plan's last stage (H1 D0 precedent) | `CLAUDE.md` |

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
