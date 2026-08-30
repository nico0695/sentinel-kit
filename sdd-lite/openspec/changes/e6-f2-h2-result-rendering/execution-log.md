# Execution Log

- change_name: e6-f2-h2-result-rendering
- executor: sddl-executor (invocations so far: S1; the S2 + S3 batch; S4; S5; S6; S7; S8; S9; S10 — the seven original stages plus all three of fix round 1. No stage remains; the change now routes to the scoped re-review, then final QA)
- plan source: `plan.md` (Stage Plan table, authoritative)

## Stage Overview

| Stage Id | Goal (short) | Status |
|---|---|---|
| S1 | Dependency gate: install + exact-pin `picocolors`, confirm default-export shape, confirm inherited baseline | done — `1.1.1`, probe green, baseline **confirmed 754/45** |
| S2 | `findings.ts` (pure `[SEV: …]` matcher/extractor) + its AC-3 matrix | done — 24 tests, M1 verified red |
| S3 | `colors.ts` (sole `picocolors` importer) + test-side `stripAnsi` | done — M2 proved the palette really colours |
| S4 | `render.ts` additive: `formatResultDigest` / `formatFullView` + pure tests | done — +45 tests (823 / 46), `formatTuiResult` retained, H1 tails still green |
| S5 | Supersession: flow call sites → digest, delete the legacy renderer, rewrite the four H1 tails (AC-15) + the D9 amendment | done — 824 / 46 (823 − 3 + 4), the digest is now the product's output |
| S6 | `offerFullView` + `full-view.test.ts` (AC-8/9/10/12/13) | done — 856 / 47 (824 + 31 + 1), M3/M4/M5 all verified red then reverted |
| S7 | CLAUDE.md closeout + final evidence sweep (AC-14/16/17) | done — `CLAUDE.md` only, 4 insertions / 4 deletions; sweep green, count unchanged at **856 / 47** |
| S8 | Fix round 1 (`e6f2h2-D12`): the neutralisation primitive `engine-text.ts` + its AC-18 suite, imported by nothing yet | done — 2 NEW files, **908 / 48** (+52), M6/M7 verified red then reverted |
| S9 | Fix round 1: the rewiring — `toSafeLines` in `render.ts`, `extractFindings(lines)`, the widened remainder group, the neutralised `Failure:` line | done — 5 MOD files, **927 / 48** (+19), M8/M9/M10/M11 all observed and reverted; R1-001/002/003 closed |
| S10 | Fix round 1: verification repairs (AC-20 palette assertions, `palette-wiring.test.ts`, the AC-21 comment pass) | done — 4 MOD + 1 NEW, **931 / 49** (+4), M12 and all three M13 runs observed and reverted; R3-002/R3-001/R2-001/R2-002 closed |

## S1 — Dependency gate: `picocolors` install, pin, export-shape and baseline confirmation

- approval: `stage_approval` granted by the user — checkpoint `cp-stage-approval-s1-s3`, decision `e6f2h2-D7` ("Approved: S1, then S2+S3 batched. Stop after S3 for the stage summary."). This invocation is scoped to **S1 only** per the orchestrator handoff.
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty) on branch `claude/project-post-merge-analysis-a4tcbl`. `picocolors` was present in `node_modules` only as a hoisted **transitive dev** dependency (`"dev": true` in the lockfile, pulled by `tsup` → `postcss`), not declared. Toolchain: Node `v22.22.2`, npm `10.9.7`. No contradiction with `plan.md` / `design.md` / `spec.md`.

### Step 1 — install with exact pin

Command: `npm i -E picocolors` → succeeded through the configured proxy (`up to date, audited 172 packages`; no new tarball needed — the 1.1.1 copy was already hoisted, so the install was a manifest/lockfile promotion).

- **Resolved version: `1.1.1`** — exactly the version `design.md` and the orchestrator probe were written against. `risk-e6f2h2-007`'s "may resolve a different version" branch **did not fire**; no level-B escalation.
- Bare pin confirmed in `dependencies`: `"picocolors": "1.1.1"` — **no `^`, no range** (verified by reading the parsed manifest, not by eye).
- `npm ls picocolors` → `picocolors@1.1.1` at the top level, with `tsup` and `postcss` deduped onto the same copy (one physical copy, no duplicate tree).

### Step 2 — changed files (the complete list for this stage)

| File | Change |
|---|---|
| `package.json` | one added line: `"picocolors": "1.1.1"` in `dependencies` |
| `package-lock.json` | two lines: the same entry in the root package's `dependencies`, and removal of `"dev": true` from the existing `node_modules/picocolors` entry (promotion transitive-dev → declared runtime; `version`/`resolved`/`integrity` unchanged, `sha512-xceH2snhtb5…`) |

`git diff --stat` = `2 files changed, 2 insertions(+), 1 deletion(-)`. **No source file was written** — `git diff --stat src/` is empty and `grep -rn "picocolors" src/` returns **0** hits (the single-importer rule lands at S3). `tsconfig.json`, `.dependency-cruiser.cjs`, `biome.json`, `vitest.config.ts`, `tsup.config.ts` are all untouched (verified by an explicit `git diff --stat` over those five paths — empty).

### Step 3 — runtime export-shape probe (wrote no file)

The plan's exact command, run from the repo root:

```
node --input-type=module -e 'import pc from "picocolors"; console.log(typeof pc.red, typeof pc.green, typeof pc.yellow, typeof pc.dim)'
```

Output: `function function function function` — **four functions, as required**. No CJS fallback needed; the ESM default import resolved directly.

Extended probe over the roles the design's `TuiPalette` will need, same invocation style:

- `red=function green=function yellow=function dim=function bold=function cyan=function gray=function`
- `typeof pc.isColorSupported === "boolean"`

The design's colour-determinism analysis was re-confirmed in *this* environment (it matters for the S3/S6 AC-14 harness and for M2, which must be able to go **green**):

| Env | `pc.isColorSupported` | `pc.red("x")` |
|---|---|---|
| (ambient, non-TTY) | `false` | `"x"` |
| `FORCE_COLOR=1` | `true` | `"\x1b[31mx\x1b[39m"` |
| `NO_COLOR=1` | `false` | `"x"` |

So `FORCE_COLOR=1` really does produce SGR sequences here — M2 (S3) is executable as planned, and the ambient default is colour-**off**, which is why the palette must be injected rather than detected.

Not re-tested (settled by the orchestrator probe before this stage, recorded here so S3 does not re-litigate it): `import pc from "picocolors"` **typechecks clean** under this repo's `NodeNext` + `verbatimModuleSyntax` tsconfig with **no** `esModuleInterop`, so `allowSyntheticDefaultImports` is **not** needed and the design's conditional B-level question does not fire; and the namespace form `import * as pc` is runtime-**wrong** here (`pc.red === undefined`). **S3 must use the default import form.** No `tsconfig.json` change was needed or made.

### Step 4 — quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npm i -E picocolors` | yes | success; resolved `1.1.1`; bare pin in `dependencies` |
| export-shape probe (no file written) | yes | `function function function function` — pass |
| `npm run check` (biome + tsc + depcruise) | yes | **clean**, exit 0 — biome checked 156 files, no fixes applied; `tsc --noEmit` silent; depcruise: no dependency violations (103 modules, 247 dependencies cruised) |
| `npm test` (full suite) | yes — baseline gate | **45 files passed (45), 754 tests passed (754)**, 0 failed, exit 0 (20.8s) |

### Baseline confirmation

The inherited figure of **754 tests / 45 files** is **CONFIRMED exactly** against the current tree with the S1 changes applied. Unlike the `[E6.F2.H1]` precedent (707 → 708), **no correction is required**: every later stage compares against **754 tests / 45 files**.

Expected delta at the end of the change, for S7's sweep: `754` + (new tests from S2/S4/S6) − `3` (the superseded `formatTuiResult` unit cases deleted at S5, the only permitted reduction).

- deviations from the plan: **none**. Every S1 step ran as written and in order; no stop condition fired.
- blockers: none.
- scope / drift / blast-radius: none. Actual scope equals planned scope exactly (`package.json`, `package-lock.json`).
- risks: `risk-e6f2h2-007` is now **fully closed** — the interop half by the orchestrator probe, the version/shape half by this stage (resolved `1.1.1` = the design's assumption, four colour functions on the default export). No new risk discovered.
- git: **no commits, no stashes, no resets** — the orchestrator owns git. Working tree carries `package.json` + `package-lock.json` modified, plus this log and the `state.yaml` stage entry.
- QA handoff: **deferred**, not required for S1. The stage touches no source, its blast radius is a two-line manifest promotion, and the full suite is green at the confirmed baseline. Per the approved batching, the natural review point is after S3 (the user asked to stop there for the stage summary).
- next action: orchestrator commits S1, then `sddl-executor` on the **S2 + S3 batch** under the same `cp-stage-approval-s1-s3` approval — `findings.ts` + `__test__/findings.test.ts`, then `colors.ts` + `stripAnsi` in `tui-test-doubles.ts`, with mutation-verifies M1 and M2.

## S2 + S3 — the two pure modules: `findings.ts` (AC-3 matrix) and `colors.ts` (the colour seam)

- approval: the same `stage_approval` — checkpoint `cp-stage-approval-s1-s3`, decision `e6f2h2-D7`. Batched per `plan.md` §Dependencies And Sequencing: the two new modules are disjoint, nothing imports either of them yet, and no existing behaviour changes. This invocation is scoped to **S2 + S3 only**; S4 (`render.ts`) is a separate approval and was **not** started.
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty), S1 committed as `b0a3a04` on branch `claude/project-post-merge-analysis-a4tcbl`. `plan.md` / `design.md` / `spec.md` re-read at stage start; no contradiction with the tree. Inherited baseline in force: **754 tests / 45 files**.

### S2 — `findings.ts`: the pure `[SEV: …]` matcher and extractor

Files created (both NEW, nothing else touched by S2):

| File | Lines | Contents |
|---|---|---|
| `src/adapters/driving/tui/findings.ts` | 86 | `FindingSeverity`, `TuiFinding`, `matchFindingLine`, `extractFindings`. **Zero imports** — verified: the file has no `import` statement at all |
| `src/adapters/driving/tui/__test__/findings.test.ts` | 228 | the AC-3 matrix — **24 tests** in four describes |

The matching rule is `design.md`'s, implemented verbatim and in its stated order: `line.trim()` → strip `/^(?:(?:[-*+>]|\d{1,3}[.)])\s+)+/` (repeatable, so `> - [SEV: …]` is handled in one pass) → `/^\[\s*sev\s*:\s*(blocker|major|minor|nit)\s*\]\s*(.*)$/i` → severity `toLowerCase()`, remainder `.trim()` and **nothing else**. `extractFindings` splits on `"\n"` (not `/\r?\n/`, per the design's verbatim-identity reasoning) and keeps matches in source order.

Test cases — all of the plan's list, plus five A-level additions:

- **Fed from the real fixture** `fixtures/claude-code/valid-verdict.json`, read with `readFileSync(fileURLToPath(new URL("../../../../../fixtures/claude-code/valid-verdict.json", import.meta.url)))` — the `claude-code-adapter.test.ts` precedent; the `../` depth is **five** from `tui/__test__/` (confirmed by the passing run, not by counting alone). Its `result` field carries exactly 1 major + 1 minor: the major line's `calc.js:6-8` range survives verbatim (asserted both as a text prefix and by full equality against the fixture line minus its marker), and the minor is classified with its own text.
- Accepted shapes: bare marker, `- [SEV: nit] …`, `> - [SEV: blocker] …`, indented, hyphen separator, no separator at all, `[sev: MAJOR]`, `[ SEV : Minor ]` inner spacing, trailing carriage return.
- Rejected shapes: `[SEV: critical]` (unknown level), prose, `## Findings`, `VERDICT: …`, a marker that does not start the line, `[SEVERITY: major]` / `[SEV major]` / `SEV: major — a`, blank lines.
- `extractFindings`: fixture order; mixed-markdown source order (with a `[SEV: critical]` line in the middle proving the unknown level is dropped from the sequence); non-conforming markdown → `[]`; empty markdown → `[]`; CRLF input.
- **A-level additions** (authorship `claude`, all inside the AC-3 matrix, none widening scope): ordered-list prefixes in both `1.` and `12)` forms; the empty-remainder case (`[SEV: blocker]` → `text: ""`); the malformed-marker trio; the marker-not-at-line-start case; the CRLF case.
- **A-level decision (authorship `claude`)**: the regex alternation is the **sole** gate on which levels count — no second allow-list validation after the match. A defensive double gate would have made M1's mutation unobservable, converting a real non-vacuity proof into a vacuous one. The single gate is stated in the constant's doc comment, and the `as FindingSeverity` narrowing carries a comment explaining why it is safe by construction.

Narrowed run: `npx vitest run --project adapters src/adapters/driving/tui/__test__/findings.test.ts` → **24 passed (24)**, 1 file.

### Mutation-verify M1 — actual output

Mutation applied: the severity group widened from `(blocker|major|minor|nit)` to `([a-z]+)` in `FINDING_LINE` (the only edit; the file was backed up byte-for-byte first).

Result: **RED — 2 failed | 22 passed (24)**, one more failure than the plan predicted, and the extra one is the stronger of the two:

- `matchFindingLine — rejected shapes (AC-3) > rejects a level outside the four` — `expect(matchFindingLine("[SEV: critical] the build is on fire")).toBe(undefined)` failed at `findings.test.ts:147`.
- `extractFindings (AC-2) > keeps source order across a mixed markdown document` — `AssertionError: expected [ { severity: 'nit', …(1) }, …(3) ] to deeply equal [ { severity: 'nit', …(1) }, …(2) ]`, the diff adding `{ "severity": "critical", "text": "ignored: unknown level" }` between the blocker and the major.

So the negative cases are **not** vacuous: widening the gate produces a `critical` finding both at the unit level and inside the extractor's source-order sequence. The mutation was then reverted from the backup (`FINDING_LINE` confirmed back to the four-level alternation by grep) and the suite re-run → **24 passed (24)**.

### S3 — `colors.ts`: the colour seam

| File | Lines | Change |
|---|---|---|
| `src/adapters/driving/tui/colors.ts` | 76 | **NEW** — `TuiPalette` (`good`/`warn`/`bad`/`muted`), `TUI_PALETTE` (green/yellow/red/dim), `PLAIN_PALETTE` (four identities). The **only** module in `src/` that imports `picocolors`; its header states the rule, names the grep that verifies it, and records why the default import form is mandatory (S1's finding: the namespace form leaves `pc.red` undefined here) |
| `src/adapters/driving/tui/__test__/tui-test-doubles.ts` | +22, −0 | **MODIFIED** — added the exported `stripAnsi`. `createScriptedPrompter` and every other existing double are byte-unchanged: the diff is insertions only |

- Import form used: `import pc from "picocolors"` — typechecked in real code by `npm run check` (`tsc --noEmit` silent). **No `tsconfig.json` edit was needed or made**; the conditional level-B branch of `risk-e6f2h2-007` stayed closed.
- `stripAnsi` strips SGR sequences with the repo's existing `biome-ignore lint/suspicious/noControlCharactersInRegex` precedent (`src/core/run/builtin-verdict-extraction.ts:81`, whose private `stripAnsiSgr` this mirrors). That core function is not exported and the guards forbid reaching for it, so the two-line body is duplicated deliberately — stated in the helper's doc comment.
- **A-level decision (authorship `claude`)**: `TUI_PALETTE` references picocolors' formatters directly (`good: pc.green`) instead of wrapping each in an arrow. They are standalone closures that never read `this`, so unbinding is safe, and the `TuiPalette` annotation already narrows their `Formatter` type to `(text: string) => string`. Recorded in the file's doc comment.
- No permanent `colors.test.ts` was added: the design fixes three test files, and the env-independent palette invariants belong to `full-view.test.ts` at S6.

### Mutation-verify M2 — actual output

A throwaway `__test__/m2-palette-probe.test.ts` asserted that `TUI_PALETTE.bad("x")` contains an SGR escape, is **not** equal to `"x"`, that `stripAnsi` reverses it back to `"x"` for all four roles, and that `PLAIN_PALETTE.bad("x") === "x"`. It was run under **both** env settings, which is what makes the proof complete:

| Run | Result | What it proves |
|---|---|---|
| `FORCE_COLOR=1 npx vitest run --project adapters <probe>` | **1 passed (1)** | `TUI_PALETTE` really emits SGR sequences and `stripAnsi` reverses them exactly — the vacuity hole `risk-e6f2h2-009` describes (an all-identity palette satisfying AC-14 in letter) is **empirically closed**, not argued |
| `NO_COLOR=1 npx vitest run --project adapters <probe>` | **1 failed (1)** — `AssertionError: expected 'x' to contain` the escape prefix | the assertion is genuinely env-dependent, so it **cannot** be permanent; this is exactly why the plan required it be run once and deleted rather than committed |

The probe file was then **deleted**: `src/adapters/driving/tui/__test__/` is back to its seven pre-existing entries plus `findings.test.ts`, and `git status --porcelain` shows no trace of it.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npx vitest run --project adapters src/.../findings.test.ts` | yes (narrowed, S2) | **24 passed (24)**, 1 file |
| `npm run check` (biome + tsc + depcruise) | yes (S2 + S3) | **clean**, exit 0 — biome checked 159 files, no fixes applied; `tsc --noEmit` silent (the real typecheck of the `picocolors` default import); depcruise **no violations**, 106 modules / 248 dependencies cruised (103/247 at S1 — the two new modules plus the external package). The unimported new modules are legal: `.dependency-cruiser.cjs` has no orphan rule |
| `grep -rEn '^import .*"picocolors"' src/` | yes (S3, refined — see deviations) | **exactly 1 hit**: `src/adapters/driving/tui/colors.ts:34` |
| `NO_COLOR=1 npx vitest run --project adapters` | yes (S3, AC-14 harness) | **429 passed (429)**, 25 files |
| `FORCE_COLOR=1 npx vitest run --project adapters` | yes (S3, AC-14 harness) | **429 passed (429)**, 25 files — **identical** to the `NO_COLOR` run |
| `npm test` (full suite) | yes (batch close) | **46 files passed (46), 778 tests passed (778)**, 0 failed, exit 0 (24.7s) |
| `git diff --stat src/core` (AC-16) | standing guard | **empty**; `git diff --stat src/main` empty too |

Test-count arithmetic against the confirmed baseline: **754 + 24 = 778** tests, **45 + 1 = 46** files. No existing test was modified, deleted or re-counted — the batch is purely additive, exactly as the plan predicted for stages nothing imports yet.

### Deviations from the plan

**One, and it is an evidence-command refinement rather than a scope change — recorded rather than smoothed over.** `plan.md`'s S3 row asks for confinement evidence as `grep -rn "picocolors" src/` → *exactly one hit*. That literal command now returns **9 hits across 2 files**, and it cannot return 1: `design.md` requires `colors.ts`'s header to *state the single-importer rule*, and that header (plus one sentence in `stripAnsi`'s doc comment explaining why flow assertions strip ANSI) necessarily contains the word in prose. Both commands were run:

- `grep -rEn '^import .*"picocolors"' src/` → **1 hit** (`colors.ts:34`) — the real confinement evidence, and the command the header itself now names.
- `grep -rn "picocolors" src/` → **9 hits** in exactly **2 files**: 8 in `colors.ts` (its header plus the annotated import) and 1 in `__test__/tui-test-doubles.ts` (prose). **Zero** importers outside `colors.ts`.

S7's final sweep should use the statement-level form (or read the two-file hit list) instead of the literal one-hit expectation. Nothing else deviated: every other S2/S3 step ran as written.

- blockers: none.
- scope / drift / blast-radius: none. Actual scope equals planned scope exactly — 3 files created (one of them the M2 probe, deleted again) and 1 file modified with insertions only. **Untouched and verified via `git status --porcelain`**: `render.ts`, `tui-flow.ts`, `index.ts`, `tui-deps.ts`, `clack-prompter.ts`, `__test__/result.test.ts` (all S4/S5/S6), plus `src/core/**`, `src/main/**`, `tsconfig.json`, `.dependency-cruiser.cjs`, `biome.json`, `vitest.config.ts`, `tsup.config.ts`, `package.json`, `package-lock.json`, `CLAUDE.md`, `docs/`, `harnesses/`, `fixtures/`, `history/`.
- risks: no new risk. `risk-e6f2h2-009` (the AC-14 vacuity hole) is **substantially closed** by M2's `FORCE_COLOR=1` green; the permanent env-independent invariants still land in `full-view.test.ts` at S6, as planned. `risk-e6f2h2-008` (an intermediate state carrying a legacy export) is unaffected: nothing imports the new modules yet, so stopping here ships two tested-but-unwired modules and zero behaviour change.
- git: **no commits, no stashes, no resets** — the orchestrator owns git. The working tree carries the three new/modified source files plus this log and the `state.yaml` stage entry, uncommitted.
- QA handoff: **recommended, not run.** The batch touches code (two new modules + a test-double helper) and reaches the checkpoint the user asked to stop at. Runtime blast radius is still nil — nothing imports either module — so a stage-mode `sddl-qa-review` here is cheap and would validate the AC-3 matrix and the colour seam before `render.ts` starts consuming them. The orchestrator decides between that and going straight to the S4 approval.
- next action: orchestrator commits S2 + S3, then obtains a **new `stage_approval` for S4** (`render.ts`, additive: `formatResultDigest` + `formatFullView` plus the pure describes in `result.test.ts`, keeping `formatTuiResult` for exactly one more stage). S4 must not be started under `cp-stage-approval-s1-s3`.

## S4 — the pure result renderer, additive: `formatResultDigest` + `formatFullView`

- approval: `stage_approval` granted by the user — checkpoint `cp-stage-approval-s4`, decision `e6f2h2-D8`. This invocation is scoped to **S4 only**; S5 was **not** started (it is a separate approval, and it is the stage that changes observable behaviour).
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty), S2+S3 committed as `3f9d2ff` on branch `claude/project-post-merge-analysis-a4tcbl`. `plan.md`, `design.md` and `spec.md` re-read at stage start; `findings.ts`, `colors.ts` and `tui-test-doubles.ts` re-read as landed. No contradiction with the tree. Baseline in force: **778 tests / 46 files**.
- the invariant that defines this stage held: **S4 changes no observable behaviour.** Nothing imports `formatResultDigest` / `formatFullView` yet, `formatTuiResult` is untouched and still drives both `tui-flow.ts` call sites, and the four `[E6.F2.H1]` literal-tail assertions are still green **unmodified**.

### Changed files — the complete list

| File | Change | Diff |
|---|---|---|
| `src/adapters/driving/tui/render.ts` | **MODIFIED, purely additive** — five new imports plus the whole H2 surface appended after the retained `formatTuiResult` | `236` insertions, **`0` deletions** |
| `src/adapters/driving/tui/__test__/result.test.ts` | **MODIFIED** — the import block extended and eight new pure describes appended after the existing ones | `+491 / −1`; the single deleted line is `import { formatTuiResult } from "../render.js";`, replaced by the multi-line form that also imports `formatFullView`, `formatResultDigest` and `type TuiResultDigest`. **No existing test body, name, constant or helper was changed** |

Nothing else in the repository was written. `git status --porcelain` lists exactly those two files.

### What landed in `render.ts`

Public surface added, exactly the design's signatures:

- `TuiResultDigest` — `{ state, verdict?, failure?, engineOutput?, runDir? }`, with `RunFailureRecord` (public `core/history` barrel) as the failure shape. It carries **no branch on `state` at all**, which is the structural form of AC-5.
- `formatResultDigest(digest, palette): readonly string[]`
- `formatFullView(markdown, palette): readonly string[]`

Module-private: `SEVERITY_ORDER`, `LISTED_SEVERITIES`, `SEVERITY_LABEL_WIDTH`, the two copy constants, `stateRole` / `verdictRole` / `severityRole`, `formatFindingCounts`, `formatFindingsSection`.

The digest copy is **the literal block from `design.md` §Design Overview**, implemented without deviation:

```
Review result: <state>
Verdict: <verdict>  |  Verdict: none — no verdict was parsed for this run.
Failure: <stage> — <message>
Findings: 1 blocker, 2 major, 1 minor   |   Findings: none in the [SEV: …] format — the engine may report them differently; see the full review.
  [blocker] <text>
  [major]   <text>
Run directory: <absolute path | ->
Full review: <runDir>/result.md
```

Design constraints honoured, each verifiable in the diff:

- **The palette is a required argument** on both exported renderers — no module-level default anywhere in the file.
- **Severity labels are padded before colouring** (`` `[${severity}]`.padEnd(SEVERITY_LABEL_WIDTH) ``, width = `"[blocker]".length`), so the column survives SGR codes.
- **`node:path`'s `join`** builds the `Full review` path; no string concatenation.
- The `Full review` line is emitted **iff `runDir !== undefined && engineOutput !== undefined`** — the exact condition under which `src/adapters/driven/storage/run-store-fs.ts:223` writes `result.md` (re-read at stage start to confirm: `if (record.engineOutput !== undefined)`). A defined-but-empty `engineOutput` therefore still gets the pointer, matching spec A9.
- The findings section is keyed on `engineOutput !== undefined` and on nothing else; the failure line is keyed on `failure !== undefined`. Both can fire together, which is the parse-fault path `src/core/run/run-review.ts` documents.
- Zero matches with markdown present emits the **degradation line** — never a count, never "no findings" (AC-4).
- `formatFullView` is `markdown.split("\n")` with recognized lines wrapped in their severity role and **nothing else** — no header, footer, separator, marker or line numbers. The split is `"\n"`, never `/\r?\n/`.
- `formatTuiErrorLine` is **byte-identical** (proved by the `0` deletions in the file's diff), and so is `formatTuiResult`.

Role assignment (A-level, authorship `claude`, filling the one gap `colors.ts`'s role doc left open): state `ok` → `good`, `ambiguous` → `warn`, the three failure states → `bad`; verdict `approve` → `good`, `request-changes` → `warn`, **`comment` → `muted`** (the palette doc names the first two but not `comment`; `muted` is the "secondary detail" role and keeps the line's information entirely in its plain text); severity `blocker` → `bad`, `major` → `warn`, `minor`/`nit` → `muted`. In every case the *value* is decorated and the label stays plain, so stripping the decoration is lossless.

### What landed in `result.test.ts` — 45 new tests, all pure

Eight appended describes, all injecting `PLAIN_PALETTE` (or the marker palette below), none touching the flow:

| Describe | Tests | Covers |
|---|---|---|
| `formatResultDigest — state and verdict (AC-1)` | 10 | the three verdicts labelled; the explicit "no verdict was parsed" line; exactly one verdict line for each of the five states |
| `formatResultDigest — findings (AC-2)` | 4 | the **real fixture** `fixtures/claude-code/valid-verdict.json` (its major listed verbatim with the `calc.js:6-8` range and em dash intact, its minor counted only); blockers grouped before majors against interleaved source order; minor/nit counted and never listed; the padded column |
| `formatResultDigest — graceful degradation (AC-4)` | 3 | the exact degradation line; **no** `Findings: <digit>` line and no listed finding; blank markdown degrades identically |
| `formatResultDigest — keyed on engineOutput, never on state (AC-5)` | 11 | 5 states × markdown present → a findings section; 5 states × markdown absent → no findings section and no pointer; the parse fault carrying failure **and** markdown asserted as a full 7-line block |
| `formatResultDigest — failure honesty (AC-6)` | 3 | `Failure: <stage> — <message>`, exactly one such line; none when there is no failure; no embedded newline and no ` at ` frame anywhere |
| `formatResultDigest — run paths (AC-7)` | 4 | persisted + markdown → both tail lines; persisted without markdown → no pointer; persist failure → `-` and no pointer; defined-but-empty markdown → pointer emitted |
| `formatResultDigest — colour is decoration only (AC-14)` | 4 | role per state, per verdict, per severity label; and `strip(marked) === plain` over a full digest |
| `formatFullView (AC-12)` | 6 | verbatim identity on a composed document and on the real fixture; no header/footer/marker; CRLF preserved; `""` → `[""]` and `"a\n"` → `["a", ""]`; only recognized lines tinted, and stripping the tint restores the identity |

Test-count arithmetic: `result.test.ts` **13 → 58 tests**; suite **778 → 823 tests**, files unchanged at **46**. Purely additive, as the plan predicted for an additive stage.

**A-level decisions taken here (authorship `claude`)**, both recorded rather than assumed:

1. **A marker palette (`MARKED`) beside `PLAIN_PALETTE`.** `PLAIN_PALETTE` is four identity functions, so *every* plain assertion in this suite would pass unchanged against a renderer that ignored its `palette` argument entirely — the same vacuity hole `risk-e6f2h2-009` names one layer up. `MARKED` wraps each role in a readable `<role>…</role>` marker, which makes two things assertable: that the palette argument is really used, and that `stripMarks(marked) === plain` — "colour is decoration only" as an equality rather than a claim. It is deterministic and env-independent, so it does not weaken AC-14's dual-run property. This is the one describe outside S4's assigned AC list (AC-1/2/4/5/6/7/12); it guards them rather than widening scope.
2. **Both fixture-fed cases read the real fixture**, reusing S2's `readFileSync` + `new URL(…, import.meta.url)` precedent at the same five-level depth, rather than pasting the engine's text into the test.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npx vitest run --project adapters src/.../result.test.ts` | yes (narrowed, S4) | **58 passed (58)**, 1 file — the 45 new cases green **and the 13 pre-existing ones green unmodified** |
| `npm run check` (biome + tsc + depcruise) | yes | **clean**, exit 0 — biome 159 files, no fixes applied; `tsc --noEmit` silent; depcruise **no violations**, 106 modules / **252** dependencies (248 at S3 — the four new edges `render.ts` → `node:path`, `core/history`, `colors.ts`, `findings.ts`) |
| `npx vitest run --project adapters` | yes | **474 passed (474)**, 25 files |
| `npm test` (full suite) | not required at S4; run anyway | **46 files passed (46), 823 tests passed (823)**, 0 failed, exit 0 (24.6s) |
| `NO_COLOR=1` / `FORCE_COLOR=1` over the adapters project | not required until S6; run anyway | **474 / 474 identical under both** — the new pure suite is env-independent by construction |
| `git diff --stat src/core` / `src/main` | standing guard (AC-16) | **both empty** |
| `git diff --stat` over `tui-flow.ts`, `tui-deps.ts`, `index.ts`, `clack-prompter.ts`, `findings.ts`, `colors.ts` | handoff constraint | **empty — all six untouched** |
| `grep -rEn '^import .*"picocolors"' src/` | S3 evidence, re-confirmed | still exactly **1** hit (`colors.ts:34`) — `render.ts` imports the palette *type*, not the library |

Biome reformatted five spots in the appended test code on first run (`biome check --write` over the two changed files only); no lint rule was suppressed and no `biome-ignore` was added.

### The `[E6.F2.H1]` invariants — explicitly confirmed

- The four literal stdout-tail assertions are **present, unmodified and green**: `io.out.slice(-3)` at `result.test.ts:183` and `:235`, `io.out.slice(-2)` at `:206` and `:271` (formerly ~L174/L226 and ~L197/L262; the shift is the enlarged import block, nothing else). Verified by name in a verbose run: *renders the minimal block and exits 0 for a persisted ok run*, *persists once and still exits 0 for a completed {ambiguous, engine-error, timeout, validation-failed} run*, *still shows the outcome, with `-` for the run directory*, *shows a failed run's outcome too when its record could not be written*.
- The four H1 AC-8 cases S5 must preserve are all still present by name and green: *hands persistRun the run it just completed, exactly once*; *emits the no-history diagnostic and the failure, and exits non-zero*; *attempted persistence exactly once — no retry, no second run*; *shows a failed run's outcome too when its record could not be written*.
- `formatTuiResult` is **untouched** (`render.ts` diff has zero deletions) and still has three importers/callers: `tui-flow.ts:35` (import), `:208` and `:218` (both call sites), plus its three unit cases at `result.test.ts:144/152/159`. This is `risk-e6f2h2-008`'s deliberate one-stage transitional state, not an oversight.

### Non-vacuity probe (unplanned, recorded)

`plan.md` schedules no mutation-verify at S4 (M1/M2 at S2/S3, M3–M5 at S6). One was run anyway because the padded-column assertion is exactly the kind that can pass by accident: `` .padEnd(SEVERITY_LABEL_WIDTH) `` was removed from `formatFindingsSection` (file backed up byte-for-byte first).

Result: **RED — 5 failed | 53 passed (58)**: *pads the severity labels so the listed findings form a column*, *lists the real fixture's major verbatim and only counts its minor*, *groups every blocker before every major*, *renders the failure AND the markdown sections on a parse-stage fault*, and *decorates the severity label and leaves the finding's own text plain*. The padding is therefore load-bearing in five independent assertions, including the marker-palette one. The file was restored from the backup (`padEnd` confirmed back by grep, diff back to `236 / 0`) and the suite re-run → **58 passed (58)**.

### Deviations from the plan

Three, all recorded rather than smoothed over; none is a scope change.

1. **`render.ts`'s module doc comment still carries H1's boundary text** ("no markdown rendering, no severity highlighting"), which the file now contradicts. This is deliberate: `plan.md` assigns that rewrite to **S5** as part of the AC-15 supersession evidence, and rewriting it here would move a diff line out of the stage the reviewer reads it in. Same class as retaining `formatTuiResult` — a transitional inaccuracy that lives for exactly one stage. `result.test.ts`'s header doc is stale for the same reason and for the same one stage.
2. **One deleted line in `result.test.ts`.** "Additive" is precise for `render.ts` (0 deletions) but not literally for the test file: the single-line `import { formatTuiResult } from "../render.js";` became the four-name multi-line form. No test content was deleted.
3. **The AC-14 describe is outside S4's assigned AC list.** Recorded as A-level decision 1 above: it exists to stop the other 41 assertions from passing vacuously, not to pull AC-14's flow half forward. AC-14's dual-run verification still belongs to S6/S7.

Not a deviation, but worth stating so a reviewer does not read it as one: a finding whose text is empty (`[SEV: blocker]` with nothing after the marker) renders as `  [blocker] ` with one trailing space. That is the literal consequence of the design's `  [blocker] <text>` template; trimming it would be un-designed behaviour, so the template was implemented as written.

- blockers: none.
- scope / drift / blast-radius: none. Actual scope equals planned scope exactly — the two files `plan.md`'s S4 row names, and no others.
- risks: no new risk. `risk-e6f2h2-008` (an intermediate stage carrying a legacy export) is **live by design** and behaving as predicted: the tree is green with both surfaces present and only the legacy one wired. `risk-e6f2h2-009` is further narrowed by the `MARKED` palette assertions, which make the pure layer's "colour is decoration" claim an equality rather than an argument.
- git: **no commits, no stashes, no resets** — the orchestrator owns git. The working tree carries `render.ts` and `result.test.ts` modified, plus this log and the `state.yaml` stage entry, uncommitted.
- QA handoff: **recommended, not run.** The stage adds a ~236-line public surface with 45 tests, and it is the last point at which the digest's copy and role assignment can be reviewed *before* S5 wires them into the flow and deletes the H1 assertions that currently pin the old output. A stage-mode `sddl-qa-review` here is cheap (runtime blast radius is still nil) and reviews the copy contract against `design.md` while reverting is trivial. The orchestrator decides between that and going straight to the S5 approval.
- next action: orchestrator commits S4, then obtains a **new `stage_approval` for S5** — switch both `tui-flow.ts` result call sites to `formatResultDigest` (conditional spreads, `exactOptionalPropertyTypes`), delete `formatTuiResult` and its three unit cases, rewrite the four literal-tail assertions through `stripAnsi`, and replace `render.ts`'s H1 boundary doc comment with an H2 one. S5 is the only stage permitted to reduce the test count, and only by those three cases. It must not be started under `cp-stage-approval-s4`.

## S5 — the supersession: both call sites on the digest, H1 AC-7 superseded, D9 folded in

- approval: `stage_approval` granted by the user — checkpoint `cp-stage-approval-s5`, decisions `e6f2h2-D8` (S4) and **`e6f2h2-D9`** (the QA-S4-01 amendment, folded into this stage). This invocation is scoped to **S5 only**; **S6 was not started** — no `offerFullView`, no fifth prompt, no `TuiPrompter.confirm` beyond the pre-run gate.
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty) at `2531fe0` on branch `claude/project-post-merge-analysis-a4tcbl`, with S1–S4 committed. `plan.md`, `spec.md`, `design.md`, `qa-report.md` and the three target files re-read at stage start. Baseline in force: **823 tests / 46 files**. No contradiction with the tree.
- **This is the stage where behaviour changed.** After it, `formatResultDigest` — not H1's minimal block — is what a `sentinel` run prints. Both `return` statements and the exit-code contract (completed + persisted → 0, persist failure → 1) are untouched, byte for byte.

### Changed files — the complete list

| File | Change | Diff |
|---|---|---|
| `src/adapters/driving/tui/render.ts` | module doc rewritten to the H2 boundary; `collapseToOneLine` extracted; **the legacy `formatTuiResult` deleted**; the digest's failure message normalised (D9) | `+43 / −29` |
| `src/adapters/driving/tui/tui-flow.ts` | both result call sites build a `TuiResultDigest` and render it with `TUI_PALETTE`; import block widened | `+45 / −8` |
| `src/adapters/driving/tui/__test__/result.test.ts` | header rewritten; the three superseded unit cases deleted; the four literal tails rewritten through `stripAnsi`; one vacuous case repaired; four cases added | `+177 / −52` |

`git status --porcelain` lists exactly those three files — the ones `plan.md`'s S5 row names, and no others. `src/core`, `src/main`, `tui-deps.ts`, `index.ts`, `clack-prompter.ts`, `findings.ts`, `colors.ts`, `tui-test-doubles.ts`, `tsconfig.json`, `.dependency-cruiser.cjs`, `biome.json`, `vitest.config.ts`, `tsup.config.ts`, `package.json`, `CLAUDE.md`, `docs/`, `harnesses/`, `fixtures/`, `history/` — all verified untouched by an explicit `git diff --stat` over each path (all empty).

### The two call sites

Both build the digest with **conditional spreads** (`exactOptionalPropertyTypes: true` — `verdict: undefined` does not typecheck) and both render with `TUI_PALETTE`:

- **persist-failure branch** (the `catch`): built from the in-memory `result`. No `runDir` key at all, so the digest renders `-` and withholds the `Full review` pointer (AC-7). The raw `result.failure.error` is reduced with `formatTuiErrorLine` into AC-6's `{ stage, message }` shape — the second intra-TUI consumer spec A5 predicted. The two `io.stderr` lines and `return 1` are unchanged.
- **success branch**: built from `persisted.record` plus `persisted.runDir`. The record — what was actually written — is the source, so the findings section and the pointer follow `record.engineOutput` and nothing else (AC-5). `return 0` unchanged.

### `e6f2h2-D9` — the recorded amendment, applied

`design.md` says the persisted path passes `record.failure` "straight through untouched". **Spec AC-6 is authoritative over that sentence**, and this stage applies the amendment rather than the design's wording — recorded here as an amendment (D9), not a silent deviation. `design.md`'s sentence is now superseded on this one point; the `TuiResultDigest` doc comment in `render.ts` was updated to say so.

The fix is `render.ts`'s own established behaviour, promoted to a shared module-private helper: `collapseToOneLine(raw) = raw.replace(/\s*\n\s*/g, " ").trim()`, previously inline in `formatTuiErrorLine` ten lines above. `formatTuiErrorLine` is otherwise **behaviourally byte-identical** — the single changed line substitutes the helper for the inline expression. Nothing was imported across adapters; the `adapters-isolated` guard is untouched and green.

### AC-15 checklist

**The four preserved H1 AC-8 cases, present by name and green** (verified in a verbose run, not by eye):

1. `hands persistRun the run it just completed, exactly once`
2. `emits the no-history diagnostic and the failure, and exits non-zero`
3. `attempted persistence exactly once — no retry, no second run`
4. `shows a failed run's outcome too when its record could not be written`

Case 4 is also one of the four rewritten tails: its **title, its `expect(code).toBe(1)` and its persistence assertions are H1's, unchanged** — only the rendered tail is this story's.

**What each of the four rewritten assertions became** (all now `.map(stripAnsi)` over the captured stdout):

| Site (S4 line) | Case | Was | Is |
|---|---|---|---|
| `:183` `slice(-3)` | *renders the minimal block and exits 0 for a persisted ok run* → **renamed** *renders the digest and exits 0 for a persisted ok run* | literal `State: ok` / `Verdict: approve` / `Run directory: …` | `Review result: ok` / `Verdict: approve` / `Run directory: …`, **plus** an equality against `formatResultDigest({state:"ok",verdict:"approve",runDir}, PLAIN_PALETTE)` — so the flow emits *the digest*, not a look-alike |
| `:206` `slice(-2)` | *persists once and still exits 0 for a completed %s run* (title kept) | 2-line tail, verdict line silently absent | **3-line** tail: `Review result: <state>` / `Verdict: none — no verdict was parsed for this run.` / `Run directory: …` — the clearest single expression of the supersession (H1 omitted the line, H2 states it, AC-1) |
| `:235` `slice(-3)` | *still shows the outcome, with `-` for the run directory* (title kept) | literal `State:` tail with `-` | digest tail with `-`, **plus** a new assertion that no `Full review:` line is emitted for a run whose `result.md` does not exist (AC-7) |
| `:271` `slice(-2)` | *shows a failed run's outcome too when its record could not be written* (title kept — preserved AC-8 case 4) | 2-line tail | 3-line digest tail with the explicit no-verdict line and `-` |

**Doc comments refreshed** (deferred from S4 to here, by plan):
- `render.ts`'s module comment no longer claims "no markdown rendering, no severity highlighting"; it now states the module's purity contract, its two surfaces, and the supersession explicitly.
- `result.test.ts`'s header now names three contracts — the digest as the result step's output, AC-15 (what was rewritten and what must not be swept away with it), and AC-8 preserved.
- The in-file `[E6.F2.H2]` banner no longer says "the four literal-tail assertions above still pin H1's surface until then".

**A-level decision (authorship `claude`), recorded rather than assumed**: both refreshed doc comments were first written naming `formatTuiResult` literally, which would have left `grep -rn "formatTuiResult" src/` at 2 prose hits and made the plan's mechanical acceptance check ambiguous — the same shape as the orchestrator's recorded `picocolors` grep correction. They were reworded to describe the superseded block ("state, verdict only when one existed, run directory") without the identifier. The supersession stays explicit and reviewable; the grep is honestly **0**.

### Test-count arithmetic

**823 − 3 + 4 = 824** (files unchanged at 46). `result.test.ts`: 58 → 59.

- **−3**, the only reduction this stage is permitted: the `formatTuiResult (AC-7)` describe — *renders state, verdict and run directory when all are present*, *omits the verdict line when no verdict exists*, *renders `-` rather than fabricating a run directory*. All three were already replaced by S4's pure `formatResultDigest` describes.
- **+1 pure** (AC-6 / D9): *collapses a multi-line message onto the single Failure line* — asserts the whole 4-line digest, so the collapsed text is pinned exactly.
- **+3 flow** (`the flow builds the digest from what it persisted (AC-5, AC-6, AC-7)`): *renders the record's findings section and the result.md pointer* (AC-5's flow half — the first test that drives the record's `engineOutput` through the flow, and the only coverage the success branch's conditional spreads would otherwise have); *collapses a multi-line failure message from the persisted record* (D9 end to end on the persisted path); *reduces the raw failure to one line when the run could not be persisted* (AC-6 on the raw path, through `formatTuiErrorLine`).
- **repaired in place, no count change**: *never breaks a line and never leaks a stack frame*.

These three flow tests are S5's assigned half of AC-5/AC-6/AC-7 per `plan.md`'s AC → stage map ("AC-5 → S4 (pure keying) + S5 (sections/path line)"). They are not scope drift: without them the new call-site spreads for `failure` and `engineOutput` are executed by no test at all.

### Non-vacuity — how the repaired failure test was established as real

Not argued, **measured**. `collapseToOneLine(digest.failure.message)` was reverted to the bare interpolation in `formatResultDigest` (the D9 fix only; `formatTuiErrorLine`'s own call left intact), the file having been backed up byte-for-byte first.

Result: **RED — 3 failed | 56 passed (59)**:
- *collapses a multi-line message onto the single Failure line* (pure)
- *never breaks a line and never leaks a stack frame* (pure — the repaired case; it passed vacuously before the repair because `"spawn failed"` structurally cannot contain a newline)
- *collapses a multi-line failure message from the persisted record* (flow)

The failure diff is the real thing, not a proxy: `Failure: worktree — Command failed with exit code 128: …` followed by the message continuing onto further physical lines.

**The fourth case stayed green, and that is the point**: *reduces the raw failure to one line when the run could not be persisted* travels the persist-failure branch, where `formatTuiErrorLine` already normalises at the call site. The two paths have separate defences; only the persisted one was undefended, which is exactly what QA-S4-01 said. `render.ts` was then restored from the backup (helper call confirmed back by grep) and the suite re-run → **59 passed (59)**.

### Second non-vacuity probe (unplanned, recorded) — is `stripAnsi` load-bearing?

The AC-15 rewrite's whole claim is "digest-contract assertions over ANSI-stripped output". If the flow emitted no ANSI under test, `stripAnsi` would be decorative and the rewrite no stronger than the literals it replaced. `.map(stripAnsi)` was therefore dropped from rewrite 1 and the file run under both envs:

- `NO_COLOR=1` → **59 passed** (colour off, strip is a no-op — as expected)
- `FORCE_COLOR=1` → **1 failed**, with the diff `- "Review result: ok"` / `+ "Review result: \x1b[32mok\x1b[39m"`

So the flow really does emit SGR through `TUI_PALETTE`, and `stripAnsi` really removes it. This also closes the gap `qa-report.md` flagged as "verified by reading, not by running" (no test injected `TUI_PALETTE`): from this stage on, `risk-e6f2h2-009`'s identity is exercised, not inferred. The file was restored and both envs re-run → 59 / 59.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| **`npm test`** (full, non-negotiable for S5) | yes | **46 files passed (46), 824 tests passed (824)**, 0 failed, exit 0 |
| `npm run check` (biome + tsc + depcruise) | yes | **clean**, exit 0 — biome 159 files, no fixes applied; `tsc --noEmit` silent; depcruise **no violations**, 106 modules / **253** dependencies (252 at S4; the one new edge is `tui-flow.ts` → `colors.ts`) |
| `grep -rn "formatTuiResult" src/` | yes | **0** — no code reference and no prose mention |
| `npx vitest run --project adapters result.test.ts` | narrowed check | **59 passed (59)** |
| `NO_COLOR=1` / `FORCE_COLOR=1` over the adapters project | not required until S6; run anyway | **475 / 475 identical under both** — and now non-vacuously so (probe above) |
| `git diff --stat src/core` · `src/main` | standing guard (AC-16) | **both empty** |
| `git diff --stat` over the eight forbidden TUI/config paths | handoff constraint | **all empty** |
| `grep -rn "offerFullView" src/` · `prompter.confirm` in `tui-flow.ts` | S6 boundary | **0** hits · exactly **1** (the pre-run gate). The prompter scripts stay four-answer |

### Deviations

Two, both stated rather than smoothed over; neither is a scope change.

1. **`design.md` is contradicted on one sentence** — "the persisted path passes `record.failure` straight through untouched". Applied under decision **D9** with spec AC-6 as the authority. This is an approved amendment, not an implementation liberty; `render.ts`'s `TuiResultDigest` doc was updated so the file no longer repeats the superseded claim.
2. **One test renamed**: *renders the minimal block and exits 0 for a persisted ok run* → *renders the digest and exits 0 for a persisted ok run*. "Minimal block" is H1's term for the surface this stage deletes. The renamed case is **not** one of the four protected AC-8 titles; all four of those are untouched.

Not a deviation, but recorded so a reviewer does not read it as one: the two known-and-accepted items were left alone exactly as instructed — **QA-S4-02** (a defined-but-empty `engineOutput` still gets the `Full review` pointer while S6 will withhold the prompt; spec A9's deliberate asymmetry) and the one trailing space on a finding with empty text.

- blockers: none.
- scope / drift / blast-radius: none. Actual scope equals planned scope exactly.
- risks: no new risk. **`risk-e6f2h2-008` (the legacy export carried across one stage boundary) is now CLOSED** — the transitional state ended as predicted, with a green tree on both sides. **`risk-e6f2h2-010` (QA-S4-01) is CLOSED** by D9, with a measured red-then-green proof. **`risk-e6f2h2-009` is materially narrowed**: the ANSI-strip identity is now exercised by real flow tests under `FORCE_COLOR=1` instead of being argued by composition. **`risk-e6f2h2-003` (a completed story's AC superseded) is now DISCHARGED in the diff** — its remaining half is the PR description, which the orchestrator owns.
- git: **no commits, no stashes, no resets** — the orchestrator owns git. The working tree carries the three source files modified, plus this log and the `state.yaml` stage entry, uncommitted.
- QA handoff: **recommended, not run.** This is the first stage that changes observable behaviour and it discharges AC-15, so the supersession is best reviewed on its own diff, before S6 adds a prompt on top of it. A stage-mode `sddl-qa-review` should check: the four preserved AC-8 titles, the four rewritten tails against the spec's contract (not against the old literals), the D9 amendment against AC-6, and that both `return` statements are untouched.
- next action: orchestrator commits S5, then obtains a **new `stage_approval` for S6** — `offerFullView` at the end of both persist branches (blank-guard → one `confirm` → print only on `answer(true)`, returning `void`), the new `__test__/full-view.test.ts`, the AC-11 `prompts.length === 4` assertion in `result.test.ts`, and mutation-verifications M3/M4/M5. S6 must not be started under `cp-stage-approval-s5`. New baseline for every later comparison: **824 tests / 46 files**.

## S6 — the opt-in full view: one post-run prompt that can change nothing

- approval: `stage_approval` granted by the user — checkpoint `cp-stage-approval-s6`, decision `e6f2h2-D10`. This invocation is scoped to **S6 only**; **S7 was not started** — `CLAUDE.md` is untouched.
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty) at `ab67aad`, S1–S5 committed. `plan.md`, `design.md`, `spec.md`, `qa-report.md` and the three target files re-read at stage start. The inherited baseline was **re-measured, not assumed**: `npm test` → **824 tests / 46 files** before a line was written. No contradiction with the tree.
- `tui-deps.ts` needed **no change**: `TuiPrompter.confirm` (`tui-deps.ts:95`) already carries the seam, exactly as spec A7 and design §Post-run prompt predicted. The contract file's diff is empty.

### Changed files — the complete list

| File | Change | Diff |
|---|---|---|
| `src/adapters/driving/tui/tui-flow.ts` | module doc gains property 5; `offerFullView` helper; one call at the end of **each** persist branch | `+68 / −1` |
| `src/adapters/driving/tui/__test__/full-view.test.ts` | **NEW** — 31 tests: AC-8, AC-9, AC-10 (3×2), AC-12, AC-13, and the permanent AC-14 palette invariants (D10) | `+470` (new file) |
| `src/adapters/driving/tui/__test__/result.test.ts` | the AC-11 ordering assertion, its harness support, and one scripted answer added to an existing case (see Deviations) | `+44 / −6` |

`git status --porcelain` lists exactly those three paths and nothing else. Verified empty by explicit `git diff --stat`: `src/core`, `src/main`, `tui-deps.ts`, `index.ts`, `clack-prompter.ts`, `findings.ts`, `colors.ts`, **`render.ts`** (byte-identical to its S5 state after the M5 revert), `tui-test-doubles.ts`, `tsconfig.json`, `.dependency-cruiser.cjs`, `biome.json`, `vitest.config.ts`, `tsup.config.ts`, `package.json`, `CLAUDE.md`, `docs/`, `harnesses/`, `fixtures/`, `history/`, `cli/`.

### The mechanism

```
persistRun catch branch  → digest(no runDir) → 2x io.stderr → await offerFullView(io, prompter, result.engineOutput) → return 1
persistRun success branch→ digest(runDir)                   → await offerFullView(io, prompter, record.engineOutput) → return 0
```

`offerFullView(io, prompter, engineOutput): Promise<void>` — blank/`undefined` guard → one `prompter.confirm` → `formatFullView(engineOutput, TUI_PALETTE)` to `io.stdout`, one line at a time, only on `{kind:"answer", value:true}`. It returns `void`, both calls are the last statement before an **unchanged** `return`, and the `persistRun` call itself was not touched. Nothing in it reads `process`, installs a listener, touches raw mode or exits: cancel is a value, handled by the same `if` as "no" — the direct answer to the H1 CRITICAL where a library owned terminal state.

Per spec **A6** the full view is offered on the persist-failure branch too, sourced from the in-memory `result` (no record exists there). That is the branch where the markdown exists nowhere on disk, so withholding it would invert the story's motivation. The exit code stays 1.

**A-level decisions (authorship `claude`), recorded rather than assumed:**

1. **Prompt copy: `Show the full review output?`** — neither `spec.md` nor `design.md` fixes the wording. Chosen to match the flow's existing register (`Run this review?`) and to name what it prints (the *output*, raw, not a rendered view). It is asserted against a named constant in `full-view.test.ts`, so a later change is a visible test edit.
2. **Positional parameters `(io, prompter, engineOutput)`** rather than a `Pick<TuiDeps, …>` object: the helper needs exactly two seams and the flow already destructures them.
3. **The AC-11 assertion rests on a `promptsAtPersist` recorder** in `result.test.ts`'s harness (the prompt count captured *inside* the `persistRun` fake, one entry per call), plus an optional `extraAnswers` script suffix. Existing cases pass neither: the script they build is byte-identical and the recorder is write-only, so no existing assertion changed meaning. `createScriptedPrompter` itself is untouched, as the handoff requires.

### AC-11, and why the assertion is not vacuous

The AC-11 case drives a run whose **`result` and `record` both carry markdown** and scripts a fifth answer. That is deliberate: with a markdown-less run the assertion would hold wherever the call sat, because the guard would suppress the prompt either way — the test would pass vacuously and M4 could not go red. Because the markdown is present, hoisting the call above `persistRun` really does make the fake observe five prompts (M4 below, measured).

### Mutation verification — actually run, with the real observed output

**M3 (AC-9 — the blank guard is what keeps the other suites valid).** The `if (engineOutput === undefined || engineOutput.trim() === "")` early return was deleted.

Result: **RED — 18 failed | 130 passed (148)** across **three** suites:

- `full-view.test.ts` — 7 cases: all five AC-9 cases (`no engine output`, and the four blank shapes `""`, `" "`, `"   \n\t\n  "`, `"\n"`), the persist-failure no-output case, and `still points at result.md for a defined but empty engine output`.
- `result.test.ts` — 8 cases: `renders the digest and exits 0 for a persisted ok run`, the four `persists once and still exits 0 for a completed <state> run` cases, `emits the no-history diagnostic and the failure, and exits non-zero`, `collapses a multi-line failure message from the persisted record`, `reduces the raw failure to one line when the run could not be persisted`.
- **`flow.test.ts` — 3 cases**: `launches the interactive flow when both streams are TTYs`, `drives only core use cases, in the review order`, `keeps a single static-text indicator active while runReview is pending`. This is the point of M3: an **untouched** suite goes red, so the four other TUI suites are green *because of* the guard, not by luck.

The failures surface as `expected 1 to be +0` (the throw is caught by `createTui` and becomes exit 1) with the exhaustion message on `stderr`. It was surfaced verbatim with a temporary `toEqual` probe on the persist-failure case, then reverted:

```
[
  "The review completed but its run could not be persisted: no history was written and `sentinel runs show` will not find it.",
  "Failed to persist run at /runs/owner__repo",
  "prompt script exhausted: unexpected confirm \"Show the full review output?\"",
]
```

So the predicted `prompt script exhausted` is the real cause, quoting this stage's own prompt. Guard restored → **148 / 148** green.

**M4 (AC-11 — the prompt is strictly after `persistRun`).** The success-branch `offerFullView` call was moved above the `persistRun` `try` (reading `result.engineOutput`, the only value in scope there).

Result: **RED** — `result.test.ts`: `AssertionError: expected [ 5 ] to deeply equal [ 4 ]` on `asks about the full view strictly after persistRun settled (AC-11)`; **1 failed | 59 passed (60)**. Across the whole TUI directory the mutation costs **10 failures** (the AC-11 case plus nine `full-view.test.ts` cases whose stdout tail is no longer digest-then-view), so the ordering is pinned from two directions. Restored → green.

**M5 (AC-13 — no truncation).** `formatFullView` was capped with `.slice(0, 100)`.

Result: **RED** — `emits a 500-line output in full, with no marker and no further prompt`: `AssertionError: expected [ …(111) ] to have a length of 500 but got 111` (111 = the 11 lines the flow prints before the view, plus the 100 that survived the cap); **1 failed | 30 passed (31)**. Restored; `render.ts` verified byte-identical to its S5 state, its `git diff --stat` empty.

All three went red exactly as `plan.md` predicted. No mutation was skipped or argued instead of run.

### `e6f2h2-D10` — the permanent palette invariants, landed

`risk-e6f2h2-009`'s remaining half was that AC-14's dual run could be satisfied *in letter* by assertions that are themselves env-dependent. `full-view.test.ts` now carries ten permanent cases that are relations **between** `TUI_PALETTE`, `PLAIN_PALETTE` and `stripAnsi`, never assertions about the ambient decision — so they hold identically under `NO_COLOR=1` and `FORCE_COLOR=1` by construction, which is what makes the dual run meaningful rather than two runs that happen to agree:

- `stripAnsi(TUI_PALETTE[role]("sentinel")) === "sentinel"` for all four roles;
- `PLAIN_PALETTE[role]("sentinel") === "sentinel"` for all four roles;
- `stripAnsi("\u001b[31mred\u001b[39m") === "red"` and a nested bold+green case — **without these two, the eight above would also hold for a `stripAnsi` that did nothing at all**, which is precisely the vacuity M2 could only rule out with a throwaway;
- `formatResultDigest(digest, TUI_PALETTE).map(stripAnsi)` deep-equals `formatResultDigest(digest, PLAIN_PALETTE)`, and the same identity for `formatFullView` (also equal to `MARKDOWN.split("\n")`).

M2's throwaway is thereby superseded by permanent coverage, and S5's `stripAnsi` probe is no longer the only evidence that the strip is load-bearing.

### Test-count arithmetic

**824 + 32 = 856** tests; **46 + 1 = 47** files. Additive only — nothing was deleted or weakened.

- **+31** — `full-view.test.ts` (new file): 4 AC-8 (accept / decline / cancel / the persist-failure branch), 8 AC-9 (absent, four blank shapes, the persist-failure branch, and the A9 `result.md`-pointer asymmetry), 6 AC-10 (the 3×2 matrix), 2 AC-12, 1 AC-13, 10 AC-14/D10 palette invariants.
- **+1** — `result.test.ts`: `asks about the full view strictly after persistRun settled (AC-11)`. The file goes 59 → 60.
- The four `[E6.F2.H1]` AC-8 titles are still present and green, untouched by this stage.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| **`npm test`** (full — non-negotiable for S6) | yes | **47 files passed (47), 856 tests passed (856)**, 0 failed, exit 0 |
| `npm run check` (biome + tsc + depcruise) | yes | **clean**, exit 0 — biome 160 files, no fixes applied; `tsc --noEmit` silent; depcruise **no violations**, 106 modules / **253** dependencies (unchanged — `tui-flow.ts` already imported `render.ts` and `colors.ts`) |
| `NO_COLOR=1 npx vitest run --project adapters` | yes (AC-14) | **26 files / 507 tests passed** |
| `FORCE_COLOR=1 npx vitest run --project adapters` | yes (AC-14) | **26 files / 507 tests passed — identical**: same files, same count, zero failures |
| `npx vitest run --project adapters src/adapters/driving/tui/` | narrowed check | **148 passed (148)** across all eight TUI suites |
| `git diff --stat src/core` · `src/main` | standing guard (AC-16) | **both empty** |
| `git diff --stat` over the forbidden TUI/config/doc paths | handoff constraint | **all empty** (`render.ts` included, post-M5) |
| `grep -rEn '^import .*"picocolors"' src/` | confinement (orchestrator's corrected form) | **exactly 1** — `src/adapters/driving/tui/colors.ts:34` |
| `git status --porcelain` | scope | exactly the three S6 files: 2 modified, 1 new |

**The four other TUI suites needed no edit — proved, not assumed.** `cancel.test.ts`, `empty-states.test.ts`, `errors.test.ts` and `spinner.test.ts` are green untouched, and M3 showed what makes that true: delete the guard and `flow.test.ts` goes red immediately. (`flow.test.ts` reaches `persistRun` on its happy path; the other three stop before it.)

### Deviations

One, stated rather than smoothed over. It is a consequence of the approved behaviour, not a scope change.

1. **`result.test.ts` needed one edit more than "the AC-11 assertion only".** The case S5 added — `renders the record's findings section and the result.md pointer` — is the one existing case whose **record carries `engineOutput`**, so under AC-8 the flow now legitimately asks a fifth prompt and its four-answer script overran (`prompt script exhausted`). One scripted `answer(false)` was added, with a comment saying why; a decline prints nothing further, so its `slice(-6)` tail assertion is untouched and still asserts exactly what it did. The alternative — withholding the prompt so an existing script stays valid — would contradict AC-8. The handoff's plan-time evidence (`grep -rn "engineOutput" src/adapters/driving/tui/` returning zero hits) predates S5, which introduced that single hit; every *other* TUI suite still sets no `engineOutput` and needed nothing.

Not deviations, but recorded so a reviewer does not read them as oversights: **QA-S4-02** was left exactly as instructed — `full-view.test.ts` now *pins* the A9 asymmetry as intended behaviour (`still points at result.md for a defined but empty engine output`: the path line is emitted, the prompt is not) rather than unifying the two guards; `formatTuiErrorLine`'s duplication, the trailing space on an empty finding, and `tui-deps.ts` were all left untouched.

- blockers: none.
- scope / drift / blast-radius: none beyond the single deviation above. Actual scope equals planned scope.
- risks: no new risk. **`risk-e6f2h2-009` (AC-14 vacuity) is now CLOSED** — permanent, env-independent palette invariants exist, including the two cases that make `stripAnsi` itself non-vacuous, and the adapters project is identical under both env settings. **`risk-e6f2h2-006`** (the process now waits for input after a run) is realised as designed and remains accepted: the prompt is asked only when there is output to show, cancel is a value, and no script can reach it (H1's non-TTY guard).
- git: **no commits, no stashes, no resets** — the orchestrator owns git. The working tree carries the three source files, plus this log and the `state.yaml` stage entry, uncommitted.
- QA handoff: **recommended, not run.** S6 adds the flow's first post-run interaction and discharges five ACs; a stage-mode `sddl-qa-review` should check the three invariants independently — that both `return` statements are untouched and the exit codes still depend only on (completed, persisted), that `persistRun` is still called exactly once, and that the prompt is unreachable when the markdown is blank — plus the prompt copy against the spec's intent, since the wording is an A-level choice made here.
- next action: orchestrator commits S6, then obtains a **new `stage_approval` for S7** — the `CLAUDE.md` closeout (E6 complete, remaining MVP work, `picocolors` in the runtime-dependency list) plus the final evidence sweep (AC-14/16/17). S7 must not be started under `cp-stage-approval-s6`. **New baseline for every later comparison: 856 tests / 47 files.** The orchestrator's standing correction still holds for S7: the valid confinement check is `grep -rEn '^import .*"picocolors"' src/` = 1, not the plan's literal `grep -rn "picocolors" src/`.

---

## S7 — the closeout: CLAUDE.md at the E6-complete state, then the final evidence sweep

- approval: `cp-stage-approval-s7` (decision `e6f2h2-D11`, "S7 y después review 4R"). S7 was **not** run under `cp-stage-approval-s6`.
- planned scope (plan.md S7 row): **`CLAUDE.md` only**. Actual scope: `CLAUDE.md` only. No source change was needed or made — the standing level-C guard never fired.

### Changed files — the complete list

| File | Change | Diff |
|---|---|---|
| `CLAUDE.md` | MODIFIED — four anchored replacements | **+4 / −4** (`git diff --stat`: `1 file changed, 4 insertions(+), 4 deletions(-)`) |

`git status --porcelain` after the stage: `M CLAUDE.md` plus this log and the `state.yaml` stage entry. Nothing else in the tree.

### The four CLAUDE.md edits, section by section

1. **Heading (line 9)** — `## Current state: E0–E6 implemented` → `## Current state: E0–E6 complete`. "Implemented" was the honest word while `[E6.F2.H2]` was still open; the epic-level fact that changed is that E6's last **required** story is done.
2. **"Current state" paragraph (line 11)** — the H1-only TUI sentence is replaced by the E6.F2-as-a-whole sentence. `[E6.F2.H1]` keeps its navigation-flow credit; `[E6.F2.H2]` is described by what it actually renders — *"a digest (state, verdict, failure, findings grouped by the harnesses' `[SEV: …]` convention, run directory and a `Full review:` pointer at the persisted `result.md`) and then offering the engine's raw markdown behind one opt-in prompt that cannot change the exit code"*. Every clause is checked against `render.ts`'s `formatResultDigest` line order (`Review result:` / `Verdict:` / `Failure:` / `Findings:` / `Run directory:` / `Full review:`), not against the design's intent. The runtime-dep list gains **`picocolors` (exact-pinned `1.1.1`; confined to `tui/colors.ts`)** beside the existing five. The paragraph closes with the anti-overstatement clause the handoff demanded: *"E6's ⚪ `[E6.F2.H3]` (`sentinel open`) is skipped, not built — workflow contract rule 7."*
3. **"Remaining MVP work" line (line 13)** — `` `[E6.F2.H2]` result rendering (🔴) and E7 `` → **E7 only**. E7's five items are left exactly as they were: it remains entirely open, and nothing in this stage implies otherwise.
4. **Architecture → "Driving surfaces" (line 60)** — the single-importer sentence generalised: `keeps @clack/prompts confined to tui/clack-prompter.ts (tests use scripted prompter doubles, no real TTY)` → `keeps each terminal library confined to one module (@clack/prompts to tui/clack-prompter.ts, picocolors to tui/colors.ts, whose palette the pure renderers take as a required argument). Tests use scripted prompter doubles and an injected plain palette — no real TTY, no ambient colour detection.` **A-level decision, authorship `claude`, recorded as the one edit beyond the literal AC-17 wording** (see Deviations): AC-14's confinement is an architectural rule a future contributor can break, and this paragraph is the only place in CLAUDE.md that states the rule for the sibling library. Leaving it naming `@clack/prompts` alone would have made the file describe half of a rule that now governs two modules.

Sections deliberately **not** touched: Source of truth, Language policy, Commands, `create-issues.sh`, the `src/` tree block, ports/review-flow paragraphs, Architecture guards, Workflow contract, Conventions, Session kickoff, the sdd-lite policy, the decision protocol, the audit-history rules, and the generated `sdd-lite:start/end` block.

### Final evidence sweep — commands and their real output

| # | Command | Required | Actual output |
|---|---|---|---|
| 1 | `git diff --stat src/core` | empty (AC-16) | **empty** — no output at all |
| 1b | `git diff --stat src/main` | empty (standing guard) | **empty** |
| 2 | `grep -rEn '^import .*"picocolors"' src/` | exactly 1 | **exactly 1** — `src/adapters/driving/tui/colors.ts:34:import pc from "picocolors";` |
| 2b | `grep -rn "picocolors" src/ \| wc -l` (the plan's literal form) | — | **11** — the orchestrator's correction re-confirmed at closeout: the naive grep is not an acceptance check. The other 10 hits are prose (the `colors.ts` header states the single-importer rule and quotes both grep forms; `__test__/tui-test-doubles.ts` explains `stripAnsi`). It reads 11 rather than the orchestrator's measured 9 because S5/S6 added two more prose mentions after that measurement — which is exactly why a literal-count check would have been a false failure |
| 3 | `grep -n '"picocolors"' package.json` | bare exact pin | **`35:    "picocolors": "1.1.1",`** — no caret, no range. `package-lock.json` agrees: root `dependencies` spec `1.1.1`, `node_modules/picocolors` version `1.1.1` |
| 4 | `npm run check` | clean | **exit 0** — biome `Checked 160 files in 164ms. No fixes applied.`; `tsc --noEmit` silent; depcruise `✔ no dependency violations found (106 modules, 253 dependencies cruised)`. All five guards green |
| 5 | `npm test` (full) | green | **exit 0** — `Test Files 47 passed (47)`, `Tests 856 passed (856)`, 0 failed, 17.41s |
| 6a | `NO_COLOR=1 npx vitest run --project adapters` | AC-14 | **26 files / 507 tests passed**, exit 0 |
| 6b | `FORCE_COLOR=1 npx vitest run --project adapters` | identical | **26 files / 507 tests passed**, exit 0 — same file count, same test count, zero failures. **Identical** |
| 7 | consistency read of `CLAUDE.md` | no stale TUI-result claim | **clean** — see below |

**Consistency read (7), in detail.** Every mention of the TUI result surface in `CLAUDE.md` was re-read after the edit: line 11 (the "Current state" paragraph), line 13 (remaining work), line 60 (driving surfaces), line 67 (the guard "no logic in TUI/CLI commands" — still true, the flow calls pure renderers and holds no domain logic). `grep -n "🔴\|pending\|not yet\|minimal"` over the file returns exactly one hit, line 77, which is the workflow contract's "pending review" and unrelated. No sentence survives that describes the result step as minimal, as H1's, or as future work.

### Test-count arithmetic — the full path from the story baseline

The inherited baseline was **754 tests / 45 files** (measured by the orchestrator, then *confirmed* by S1 as its first act — it was not assumed).

| Stage | Δ tests | Δ files | Running total | What moved |
|---|---|---|---|---|
| baseline (pre-S1) | — | — | **754 / 45** | inherited from `[E6.F2.H1]`, confirmed at S1 |
| S1 | 0 | 0 | 754 / 45 | dependency gate only — `package.json` / `package-lock.json` |
| S2 + S3 | **+24** | **+1** | **778 / 46** | NEW `__test__/findings.test.ts` (the AC-3 matrix). `colors.ts` and the `stripAnsi` helper added no permanent test of their own — M2 was a throwaway, deleted |
| S4 | **+45** | 0 | **823 / 46** | `result.test.ts` gains the pure `formatResultDigest` / `formatFullView` describes; purely additive, `formatTuiResult` retained |
| S5 | **−3 +4 = +1** | 0 | **824 / 46** | the **only** permitted reduction: the three superseded `formatTuiResult` unit cases, deleted with the function. +4 = one pure D9 whitespace case and three flow cases covering the success branch's conditional spreads |
| S6 | **+31 +1 = +32** | **+1** | **856 / 47** | NEW `__test__/full-view.test.ts` (31: AC-8/9/10/12/13 plus the ten permanent palette invariants) and one AC-11 ordering case in `result.test.ts` |
| **S7** | **0** | **0** | **856 / 47** | documentation only — no test file was created, edited or deleted |

Arithmetic: `754 + 24 + 45 − 3 + 4 + 31 + 1 = 856`; files `45 + 1 + 1 = 47`. **Net +102 tests / +2 files**, of which exactly **3 deletions**, all at S5, all replaced by S4's pure equivalents. The final `npm test` measured **856 / 47** — the arithmetic and the measurement agree.

### AC status at closeout

- **AC-14** — pin verified in `package.json` *and* `package-lock.json`; statement-level confinement = 1; the adapters project is identical under `NO_COLOR=1` and `FORCE_COLOR=1` (507/507 both ways); colour-as-decoration is pinned permanently by the ten palette invariants S6 landed. **Satisfied.**
- **AC-16** — `npm run check` clean (five guards), `npm test` 856/47 green, `git diff --stat src/core` **empty** across the whole change. **Satisfied.**
- **AC-17** — `CLAUDE.md` refreshed to the E6-complete state, `picocolors` in the runtime-dependency list, remaining work now E7-only. **Satisfied.**

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `git diff --stat src/core` · `src/main` | yes (AC-16) | both **empty** |
| statement-level picocolors grep | yes (as corrected) | **1** |
| exact pin in `package.json` | yes | **`"picocolors": "1.1.1"`** |
| `npm run check` | yes | **clean, exit 0** |
| `npm test` (full) | yes | **856 / 47, exit 0** |
| AC-14 dual-env adapters run | yes | **507 / 507 identical** |
| consistency read of CLAUDE.md | yes | **clean** |
| `git status --porcelain` | scope | `M CLAUDE.md` only (plus this log and the state entry) |

### Deviations

One, stated rather than smoothed over.

1. **A fourth CLAUDE.md edit beyond the literal AC-17 wording.** AC-17 names the "Current state" facts and the runtime-dependency list; edit 4 above touches the **Architecture → Driving surfaces** paragraph as well, to generalise the terminal-library confinement rule from `@clack/prompts` alone to both libraries. It is inside S7's declared scope (`CLAUDE.md` only), it is one sentence, and it states a rule the change actually introduced rather than adding new claims. Level A, authorship `claude`. The alternative — leaving line 60 naming one of the two confined libraries — would have left `CLAUDE.md` describing half of a live architectural rule.

Not deviations, but recorded so a reviewer does not read them as oversights:

- **The `Stage Overview` table at the top of this log was refreshed**, not rewritten: S6's row still said `pending` although its full section was appended below it, and the executor header listed invocations only through S5. Both now match the sections that exist. No prior entry text was altered.
- **`README.md` carries a materially stale status block and was deliberately NOT edited** — it is outside S7's scope. Reported to the orchestrator for a decision (see below).

### Stale-claim sweep outside CLAUDE.md — reported, not edited

- **`README.md` (lines 13–17) — MATERIAL, stale.** The blockquote reads *"**Status: pre-MVP.** Epic **E0 — Foundations** is complete: hexagonal scaffold, executable architecture guards in CI, the `ReviewEngine` port + run terminal-state model, and a `FakeEngine` with a shared reusable contract suite. The rest of the MVP develops against `FakeEngine` while the real engines are spiked."* Two claims are now false: E0 is not the frontier (E1–E6 are done), and the real `claude-code` / `opencode` engine adapters landed at **E4** — they are no longer "being spiked". Recommendation: this is `[E7.F2.H1]` (user documentation) territory, whose acceptance is a reproducible quick start; folding a status refresh into this story's PR would widen `[E6.F2.H2]`'s diff beyond its scope. The orchestrator decides — a one-line status correction in this PR is defensible, a README rewrite is not.
- **`README.md` — minor.** *"The published binary is `sentinel` (alias `snt`); packaging lands later in the backlog"* is still accurate (`[E7.F2.H3]`). *"License is not yet decided (tracked for the wrap-up epic)"* is still accurate (`[E7.F2.H2]`). No action.
- **`CONTRIBUTING.md` — clean.** It states no progress or status facts: prerequisites, the four commands (all still exact), the workflow contract, the sdd-lite activation policy and a pointer list. Every command and rule it names matches `package.json` and `CLAUDE.md`. Nothing stale found, nothing to report.

### Stage close

- blockers: none.
- scope / drift / blast-radius: none. Planned scope was `CLAUDE.md` only and actual scope is `CLAUDE.md` only; no source change was needed, so the contradiction stop this stage was warned about never triggered.
- risks: no new risk. `risk-e6f2h2-003`'s documentation half is now discharged (its remaining half is the PR description, orchestrator-owned).
- git: **no commits, no stashes, no resets.** The orchestrator owns git. The tree carries `CLAUDE.md`, this log and the `state.yaml` stage entry, uncommitted.
- QA handoff: **not this stage's call.** S7 touched no code, so a stage-mode QA over it would review a documentation diff. The plan's post-execution route stands and is unchanged: **4R code review over the frozen diff** (`e6f2h2-D11`), then **final QA (`sddl-qa-review`, `final` mode)** — the only stage that may mark this change `completed`. This stage claims neither.
- next action: the orchestrator commits S7, then runs the 4R code review over the frozen diff, then final QA. All seven planned stages are executed; `sddl-executor` has nothing left to run for this change.

## S8 — Fix round 1, step 1: the neutralisation primitive (`engine-text.ts`)

- approval: `stage_approval` granted — checkpoint `cp-stage-approval-s8-s10`, decisions `e6f2h2-D12` (the fix round exists, scoped to the six confirmed ledger ids) and `e6f2h2-D13` (S8–S10 run sequentially, one `sddl-executor` invocation each; Q-F1 accepted). This invocation is scoped to **S8 only** — S9 rewires the call sites and is a separate invocation, not started here.
- precondition check: working tree **clean** at stage start (`git status --porcelain` empty), `HEAD` at `7795489` (`docs(sddl): [E6.F2.H2] stage_approval S8-S10 + D13 accepts Q-F1`). `plan.md`'s Fix Round 1 section, `design.md` §A-2 and `spec.md` AC-18 are all present and mutually consistent on everything S8 needs except one sentence, recorded under Deviations below. No contradiction with the approved artifacts; the level-C guard (`risk-e6f2h2-004`) never came near firing — nothing in this stage wants `src/core/**` or `src/main/**`.
- why this stage is alone: nothing imports the new module yet, so the contract is proved before a single call site moves — the S2/S3 shape. A reviewer sees the primitive and its suite as one clean diff, and S9's diff is then only the rewiring.

### Changed files — the complete list

| File | Change |
|---|---|
| `src/adapters/driving/tui/engine-text.ts` | **NEW** — 143 lines. `splitEngineLines`, `neutralizeControls`, `toSafeLines`, plus the module-private `NEUTRALIZED` character class and `tokenFor` |
| `src/adapters/driving/tui/__test__/engine-text.test.ts` | **NEW TEST** — 470 lines, 52 tests |

`git status --porcelain` after the stage is exactly two `??` lines, one per path above. **No existing file was touched** — not `findings.ts`, not `render.ts`, not `tui-flow.ts`, not `colors.ts`, not any existing test, not a config file, not `package.json`. Those belong to S9 and S10.

### The contract as implemented (AC-18, design §A-2)

- **Neutralised set N**, as the five contiguous ranges the plan names: `U+0000-U+0008`, `U+000B-U+001F`, `U+007F-U+009F`, `U+2028`, `U+2029`. The contiguous `U+000B-U+001F` already covers CR (`U+000D`) and ESC (`U+001B`); `U+007F-U+009F` covers DEL plus the whole C1 block, including the 8-bit CSI (`U+009B`) and the 8-bit OSC (`U+009D`).
- **Deliberately outside N**, both argued in the module's own doc comment rather than left implicit: `U+000A` (the splitter's separator) and `U+0009` (HT — forward-only, cannot reposition, erase or introduce a sequence, and is the indentation byte of every quoted code excerpt; escaping it would render real review output as a run of `\x09` tokens for no safety gain).
- **Token**: `\xNN` for `cp <= U+00FF`, `\uNNNN` for U+2028/U+2029, lowercase `x`/`u` and lowercase hex, ASCII-only. The doc comment records the mapping as **deliberately non-injective** — a literal `\x1b` typed in the reviewed source and a real ESC byte render alike — because injectivity would require escaping the backslash itself and would mangle every Windows path and regex in a review.
- **CRLF**: `splitEngineLines` consumes **one** trailing CR per element, so the element count is exactly `markdown.split("\n").length`. A second trailing CR, and every interior CR, survive the split and are neutralised.
- **Zero imports**: a grep for a line starting `import` / `require` / `export … from` over the new module returns **nothing** (exit 1). The only two occurrences of the word "import" in the file are prose inside the module header (lines 20 and 23). `depcruise` confirms it independently: **107 modules** cruised (was 106) against an **unchanged 253 dependencies** — a new module with neither an edge out nor an edge in.
- **biome-ignore**: the character class carries `// biome-ignore lint/suspicious/noControlCharactersInRegex:` with a real justification, following the in-repo convention at `core/run/builtin-verdict-extraction.ts:81` and `__test__/tui-test-doubles.ts:63`.

### The suite — 52 tests, and why each block bites

| Block | Cases | What makes it non-vacuous |
|---|---|---|
| `neutralizeControls — the boundary table (AC-18)` | 20 rows + 1 token-shape case | Every row asserts the **exact** resulting string for `A<cp>B`, which is what makes "and performs **no other** transformation" checkable: a row cannot pass because something else was trimmed, collapsed or dropped. Rows cover every range edge (0x00, 0x08, 0x0b, 0x1f, 0x7f, 0x80, 0x9f, U+2028, U+2029), the two deliberate exclusions (0x09, 0x0a), the highest-value member (0x1b ESC), the 8-bit CSI (0x9b), and the nearest printable neighbours on either side of each edge (0x20, 0x7e, 0xa0, U+2027, U+202A), so neither widening nor narrowing N can pass silently |
| `no other transformation` | 5 | no trim, no whitespace or control collapsing, no case or order change, no truncation (a 10 004-character result asserted by length **and** by both of its 5 000-character halves), empty string unchanged |
| `P1 visibility` | 2 | the hostile fixture is asserted to be **actually hostile before it is rendered**, then the negative, then six `toContain` assertions naming every payload that must survive. A second case proves the escaping cannot be reassembled into a sequence |
| `P2 idempotence` | 2 | second pass equals first, over the hostile fixture and over every boundary row; paired with a `toContain` and a length-growth assertion, so stability-at-the-empty-string cannot satisfy it |
| `P3 transparency` | 2 | control-free markdown (headings, an em-dash finding line with a `file:line` range, tab-indented code, accented prose) returned **byte-identical** via `toBe` |
| `splitEngineLines — the CRLF rule` | 8 (one of them a 9-input `it.each`) | the CRLF case, a lone interior CR (kept, so the escaper can show it), a double trailing CR (exactly one consumed), a trailing CR with no LF, the empty string, a newline-terminated input, source-order preservation, and the element-count property over nine inputs |
| `toSafeLines` | 4 | the composition identity, the hostile fixture asserted as an exact 6-element array, no element containing a line separator, and clean markdown identical to its plain LF split |

**Negative-assertion pairing rule — applied without exception.** Every "contains no code point in N" assertion in this file sits in the same `it` as a positive assertion naming text that must be present: the boundary table pairs the negative with exact-string equality; P1 pairs it with six `toContain`s over the neutralised payloads plus a standing "the fixture really is hostile" guard on the input; `toSafeLines`' per-line negative loop runs **after** the exact 6-element `toEqual` has already named every line. Unpaired, each of those negatives would also be satisfied by the content having been deleted — R1-003's own failure mode. The suite header states the rule so a later editor does not reintroduce the species.

The test file also restates N independently (`IN_N`), on purpose: an edit that widens or narrows the module's own class does not move the test's copy, so the boundary table fails instead of agreeing with itself. M6 below is the proof that this actually works.

### Evidence — commands and their real output

| # | Command | Required | Actual output |
|---|---|---|---|
| 1 | `npx vitest run --project adapters src/adapters/driving/tui/__test__/engine-text.test.ts` | green | **`Test Files 1 passed (1)`, `Tests 52 passed (52)`**, exit 0, 427 ms |
| 2 | `npm run check` | clean | **exit 0** — biome `Checked 162 files in 225ms. No fixes applied.`; `tsc --noEmit` silent; depcruise `✔ no dependency violations found (107 modules, 253 dependencies cruised)`. All five guards green; the unimported new module is legal (no orphan rule — the S2 precedent) |
| 3 | `git status --porcelain` | exactly the two new paths | **exactly two lines**: `?? src/adapters/driving/tui/__test__/engine-text.test.ts` and `?? src/adapters/driving/tui/engine-text.ts` |
| 4 | `git diff --stat src/core` | empty (AC-16) | **empty** — no output at all |
| 4b | `git diff --stat src/main` | empty (standing guard) | **empty** |
| 5 | `npm test` (full suite — reported although S8 only required the narrowed run) | at or above 856 / 47 | **`Test Files 48 passed (48)`, `Tests 908 passed (908)`**, exit 0, 16.65 s |
| 6 | statement-level picocolors grep over `src/` | exactly 1 | **exactly 1** — `src/adapters/driving/tui/colors.ts:34`. S8 adds no terminal-library import anywhere |
| 7 | zero-import check on the new module | no import statement | **no match, exit 1**; a `grep -rn "engine-text" src/` finds exactly one importer, its own test file |

### Test-count arithmetic

| Stage | Δ tests | Δ files | Running total |
|---|---|---|---|
| S7 (inherited baseline) | — | — | **856 / 47** |
| **S8** | **+52** | **+1** | **908 / 48** |

Purely additive: no test was edited or deleted, so the S5 "a fall needs a named justification" rule does not engage. The file count reaches the **48** `plan.md` predicted for S8, and the measured 908 equals 856 plus the 52 the narrowed run reported.

### Mutation verification — both run, both observed, both reverted

**M6 — would the boundary table be just as happy with an over-wide N?** Mutation: the first range widened from `U+0000-U+0008` to `U+0000-U+0009`, putting HT into N. Predicted red: the HT row of the boundary table, the tab escaped instead of surviving.

- Observed: **4 failed | 48 passed (52)**, and the predicted row is the first of them.
  - `neutralizeControls — the boundary table (AC-18) > 'U+0009 HT' 'survives' …` → `AssertionError: expected 'A\x09B' to be 'A\tB' // Object.is equality` — exactly the predicted failure, at the exact-equality assertion.
  - Three further reds the prediction did not name, all transparency: `returns control-free markdown byte-identical`; `keeps tabs, newlines and non-ASCII prose exactly as they were` (`AssertionError: expected '# Review\n\n[SEV: major] calc.js:6-8 …' to contain '\n\tif (b === 0) {\n'`); and `toSafeLines … leaves control-free markdown identical to its plain LF split`, whose diff shows the tab-indented code block turning into `"\\x09if (b === 0) {"` / `"\\x09\\x09return NaN;"` / `"\\x09}"`. Stronger than predicted: the HT exclusion is pinned by four independent assertions, and the P3 block is demonstrably load-bearing rather than decorative.
- Reverted; the narrowed run is back to **52 passed**.

**M7 — is the CRLF rule really asserted?** Mutation: `splitEngineLines` reduced to a plain `markdown.split("\n")`, dropping the trailing-CR consumption entirely. Predicted red: the CRLF split case, with the first element keeping its CR.

- Observed: **5 failed | 47 passed (52)**, the predicted one first.
  - `splitEngineLines — the CRLF rule (AC-18) > consumes the CRLF terminator without merging or losing a line` → `AssertionError: expected [ 'a\r', 'b', 'c' ] to deeply equal [ 'a', 'b', 'c' ]` — the first element keeping its CR, precisely as M7 predicted.
  - Also red: `consumes exactly one trailing CR, keeping any second one` (`[ 'a\r\r', 'b' ]` against `[ 'a\r', 'b' ]`); `consumes a trailing CR on the final element even with no LF after it` (`[ 'a\r' ]` against `[ 'a' ]`); `preserves source order, element by element` (`[ 'first\r', 'second\r', …(3) ]`); and `toSafeLines … renders the hostile fixture inert, line by line, losing nothing`, because that fixture is CRLF-joined and its exact 6-element assertion breaks too.
  - Worth recording: the element-count `it.each` stayed **green** under this mutation, correctly — dropping a CR never changes how many elements there are, so the count property alone could never have caught it. That is exactly why the CRLF behaviour is asserted by its own cases rather than left to the property.
- Reverted; narrowed run back to **52 passed**, `npm run check` clean, full suite back to **908 / 48**.

Neither mutation was assumed. Both were applied to the real file, run, and their real output is transcribed above.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| narrowed adapters run on the new file | yes (S8's stated per-stage run) | **52 / 52, exit 0** |
| `npm run check` | yes | **clean, exit 0** (107 modules / 253 dependencies) |
| `git status --porcelain` equals the two new paths | yes | **exactly the two paths** |
| `git diff --stat src/core` and `src/main` | yes (AC-16) | **both empty** |
| full `npm test` | not required at S8; run and reported anyway | **908 / 48, exit 0** |
| statement-level picocolors grep | every stage | **1** |
| M6, M7 | yes | **both went red as predicted, both reverted** |

The AC-14 dual-env adapters run was **not** performed: `plan.md` assigns it to S9 and S10, and S8 adds no colour-dependent code — the new module never touches a palette. Recorded as deliberately skipped, not forgotten.

### Deviations

One, stated rather than smoothed over.

1. **A contradiction inside the approved artifacts about the final element's trailing CR, resolved toward the spec.** `design.md` §A-2's prose says *"A **lone** CR — interior, **or trailing with no LF** — is not a terminator and is neutralised."* The same section's own signature comment says *"`markdown.split("\n")`, with one trailing U+000D removed per element"*; `spec.md` AC-18 says *"with **one** trailing U+000D removed per element (the CRLF terminator)"*; `plan.md`'s S8 gotcha says *"drops **one** trailing U+000D per element"*; and the stage handoff glosses a lone CR as *"(interior, not before LF)"*. The two readings agree on every input **except** one: an input whose final element ends in CR with no LF after it (`"a\r"`), where the prose sentence would escape it and the other four sources drop it. Implemented as the four say — `splitEngineLines("a\r")` returns `["a"]` — because AC-18 is the acceptance criterion, it is unambiguous, and three further sources including the design's own code block agree with it. The residue is a fidelity nit, not a safety hole: the caller writes its own line break after the last line, so the dropped CR could only have returned the cursor to a column that is about to be left anyway, and nothing is rendered after it to forge with. The case is covered by a named test (`consumes a trailing CR on the final element even with no LF after it`) whose comment states the reasoning, and the module's doc comment states the consequence explicitly rather than leaving it to be discovered. Level **A**, authorship `claude`. If the orchestrator prefers the prose reading, the change is one line in `splitEngineLines` plus one expectation, and is cheapest to take at S9 while `render.ts` is already open.

Not deviations, but recorded so a reviewer does not read them as oversights:

- **The boundary table has 20 rows while the suite has 52 tests.** AC-18 lists 20 code points; the remaining cases are the token-shape case, the five "no other transformation" cases, P1/P2/P3 (six), the eight `splitEngineLines` cases and the four `toSafeLines` cases — every one of them named in AC-18's own evidence column. Nothing was invented beyond it.
- **The full suite was run although S8 only required the narrowed one.** Reported because the handoff asked for the total; it cost 17 s and confirms nothing regressed.
- **`U+00A0`, `U+2027` and `U+202A` are written as `\u` escapes in the test source** rather than pasted as literal characters, and every control-byte input is built with `String.fromCodePoint` rather than pasted. The test file therefore contains no invisible or control byte a reviewer could not see in a diff — checked, not assumed.

### Stage close

- blockers: none.
- scope / drift / blast-radius: none. Planned scope was two new files; actual scope is those two files and nothing else in the tree moved. No stop rule fired.
- risks: no new risk. `risk-e6f2h2-011` (printable-text spoofing is a named non-goal) and `risk-e6f2h2-012` (the CLI's `runs show` and the H1 catch-all carry the same exposure and stay out of scope) are both **named in the new module's own doc comment**, so the next reader of `engine-text.ts` learns what it does not defend against and why the primitive is not shared with the CLI. `risk-e6f2h2-004`'s level-C guard held without being approached.
- git: **no commits, no stashes, no resets, no branch change.** The orchestrator owns git. The tree carries the two new files, this log entry and the `state.yaml` stage entry, uncommitted.
- QA handoff: **deferred, deliberately.** S8 adds a module nothing imports; a stage-mode QA over it would review a diff with no product-visible effect, and `plan.md` routes the fix round to a **scoped re-review over the fix delta** after S10, then final QA. That route is unchanged and this stage claims neither.
- next action: the orchestrator commits S8, then approves **S9** — the rewiring (`render.ts`, `findings.ts`, and the three existing TUI suites; full `npm test`, the AC-14 dual-env run, and mutation-verifies M8, M9, M10, M11) — as its own `sddl-executor` invocation. S9 was **not** started here.

## S9 — Fix round 1, step 2: the rewiring (the stage that closes the three CRITICALs)

- approval: `stage_approval` granted — checkpoint `cp-stage-approval-s8-s10`, decisions `e6f2h2-D12` (the fix round, scoped to the six confirmed ledger ids), `e6f2h2-D13` (three sequential stages, one invocation each; **Q-F1 accepted**, so the real-fixture AC-4 case is in S9's stated scope) and `e6f2h2-D14` (the CRLF ruling: `splitEngineLines` consumes one trailing CR per element, including on a final element ending in CR with no LF; the design prose has been corrected and was not re-litigated here). This invocation is scoped to **S9 only** — S10 was not started.
- precondition check: working tree **clean** at stage start, `HEAD` at `ab32082` (`feat(tui): [E6.F2.H2] S8 — the neutralisation primitive, imported by nothing`). `engine-text.ts` is present, exports the three functions, has zero imports, and is covered by 52 tests. Baseline **re-measured, not assumed**: `npm test` → `Test Files 48 passed (48)`, `Tests 908 passed (908)`. `plan.md`'s Fix Round 1 row for S9, `design.md` §A-3/§A-4/§A-5/§A-6 and the amended `spec.md` AC-2/AC-3/AC-6/AC-12/AC-13/AC-19 are mutually consistent on everything this stage needs. The level-C guard (`risk-e6f2h2-004`) never came near firing.

### Changed files — the complete list

| File | Change |
|---|---|
| `src/adapters/driving/tui/findings.ts` | **MOD** — `extractFindings(lines: readonly string[])` (signature change), `FINDING_LINE`'s remainder group widened from `(.*)` to `([^\n]*)`, the precondition documented on the module, on `matchFindingLine` and on `extractFindings`; the stale "a trailing `\r` is absorbed by the per-line `trim()`" note removed |
| `src/adapters/driving/tui/render.ts` | **MOD** — imports `neutralizeControls` and `toSafeLines`; `formatFindingsSection(safeLines, palette)`; `toSafeLines(digest.engineOutput)` computed **once** inside `formatResultDigest` and handed down; `Failure:` composed as `neutralizeControls(collapseToOneLine(message))`; `formatFullView` returns `toSafeLines(markdown).map(...)`; the module header and the `formatFullView` doc rewritten around AC-12(a)(b)(c) instead of the superseded byte-verbatim identity |
| `src/adapters/driving/tui/__test__/findings.test.ts` | **MOD** — all five `extractFindings(...)` call sites moved to the array signature; the AC-3 byte-identity case; the AC-19 layer-2 block |
| `src/adapters/driving/tui/__test__/result.test.ts` | **MOD** — the named `:900` change; a `fixtureResult(file)` helper so the noisy fixture is read rather than invented; the AC-2, AC-4, AC-6, AC-12(a)(b)(c) and AC-19 layer-1 cases |
| `src/adapters/driving/tui/__test__/full-view.test.ts` | **MOD** — AC-13's 500-line case with a control sequence injected into one line |

`git status --porcelain` after the stage is exactly those five ` M` lines. **Nothing else moved**: not `engine-text.ts`, not `tui-flow.ts`, `colors.ts`, `index.ts`, `tui-deps.ts`, `clack-prompter.ts` or `tui-test-doubles.ts` (S10 owns the test-double changes), not `src/adapters/driven/**` — `envelope.ts` in particular is untouched, the third channel being fixed **inside the TUI adapter** as §A-5 requires — and no config, doc, fixture or harness file.

### The order, as implemented

`formatResultDigest` and `formatFullView` both run **split → neutralise → match → colour**:

- `toSafeLines(engineOutput)` is called **once** per digest, in `formatResultDigest`, and the resulting lines are what `formatFindingsSection` receives; it no longer takes markdown at all, so a caller cannot reach the matcher with raw text by accident.
- `formatFullView` maps `toSafeLines(markdown)`, so `matchFindingLine` and the palette both see already-neutral text.
- The palette is applied **after** neutralisation in both, which is why sentinel's own SGR is never itself escaped. That is asserted, not merely arranged: AC-12(c) compares `formatFullView(HOSTILE, TUI_PALETTE).map(stripAnsi)` against the `PLAIN_PALETTE` render and requires equality, so a reordering that escaped the palette's codes would fail.
- The `Failure:` line composes the two passes in the fixed order `collapseToOneLine` **then** `neutralizeControls`, so a real newline becomes a space rather than a `\x0a` token (§A-5). `failure.stage` is a `RunStage` union member and is deliberately not neutralised, which has its own case.

### AC-19's two layers, asserted separately

Deliberately in two files, because a single end-to-end test would let either layer rot undetected:

- **Layer 2 (the widened remainder group)** — `findings.test.ts`, `describe("extractFindings — an interior control never deletes a finding (AC-19, layer 2)")`. The inputs are **not** neutralised: they are what reaches `findings.ts` if a future caller forgets the ordering. Four `it.each` rows (interior CR, U+2028, U+2029, ESC) each assert the finding is present, classified `blocker`, and that its text both starts with `auth.ts:12` and ends with `real` — the positive half, so "did not vanish" cannot be satisfied by an empty text. A fifth case, `is not a safety layer on its own: the raw control reaches the text`, asserts the extracted text still **equals** `auth.ts:12\rreal`, which is the explicit statement that layer 2 is not a safety property.
- **Layer 1 (the neutralise-before-match ordering)** — `result.test.ts`, `describe("formatResultDigest — an interior control never deletes a finding (AC-19, layer 1)")`. The same four controls, end-to-end through `formatResultDigest`, each asserting the counts line **and** the exact listed line carrying the visible token (`\x0d`, `\u2028`, `\u2029`, `\x1b`), paired with "no digest line contains a code point in N". A fifth case asserts the digest never degrades to the AC-4 line when a control-carrying finding exists.

M8 and M9 below are the proof that neither block is vacuous and that neither layer alone satisfies the AC.

### AC-3's tolerance: byte-identical, proved rather than asserted by hand

`findings.test.ts`, `describe("extractFindings — the parsing tolerance survives the fix (AC-3)")`. A five-line corpus covering the `calc.js:6-8` range, an em-dash separator, a plain hyphen, no separator at all, an indented line and a list-prefixed line, with the expected findings **written out by hand** rather than derived from either pipeline. Three assertions in one case: the corpus through the raw LF split (the "before"), the same corpus through `toSafeLines` (the "after"), and the two against each other. The first two are what make it byte-identity rather than mere agreement; the third is what fails if a future change moves only one path. AC-18 P3 (a string with no code point in N is returned unchanged) is the reason they can be equal at all.

### Q-F1, taken under `e6f2h2-D13`: the AC-4 case is driven by the real fixture

`fixtures/claude-code/noisy-output.json` was **read**, not imagined: its `result` is a prose review with `## Code Review`, three numbered sections, a `### Summary` and a `VERDICT: request-changes` line, and **no `[SEV: …]` marker anywhere**. The new case in `result.test.ts` reads it through a `fixtureResult(file)` helper (`fixtureMarkdown()` now delegates to it, so the noisy reader is not a second copy of the reading logic), guards that the fixture really carries no marker **and** really carries its verdict line, then asserts the degradation line verbatim, the absence of any `Findings: <digit>` claim, the absence of any listed finding, and — the pairing — that the `Full review:` pointer the degradation line promises is actually emitted. Among the captured `claude-code` fixtures this shape is the common one (`valid-verdict.json` yields 2 recognised findings; `noisy-output.json` yields 0), so AC-4's path is now asserted against real engine output rather than only a hand-written string.

### Evidence — commands and their real output

| # | Command | Required | Actual output |
|---|---|---|---|
| 1 | `npm test` (full, not narrowed) | at or above 908 / 48 | **`Test Files 48 passed (48)`, `Tests 927 passed (927)`**, exit 0, 15.9 s (re-run after every mutation was reverted: same numbers, 20.9 s) |
| 2 | `npm run check` | clean | **exit 0** — biome `Checked 162 files in 181ms. No fixes applied.`; `tsc --noEmit` silent; depcruise `✔ no dependency violations found (107 modules, 254 dependencies cruised)`. The one new dependency edge is `render.ts -> engine-text.ts`, intra-adapter and legal |
| 3 | adapters project under `NO_COLOR=1` (with `CI`/`FORCE_COLOR` unset) | identical to 4 | **`Test Files 27 passed (27)`, `Tests 578 passed (578)`** |
| 4 | adapters project under `FORCE_COLOR=1` (with `CI`/`NO_COLOR` unset) | identical to 3 | **`Test Files 27 passed (27)`, `Tests 578 passed (578)`** — identical file and test counts, both green (AC-14) |
| 5 | `git diff --stat src/core` | empty (AC-16) | **empty** — no output at all |
| 6 | `git diff --stat src/main` | empty (standing guard) | **empty** |
| 7 | `grep -rEn '^import .*"picocolors"' src/` | exactly 1 | **exactly 1** — `src/adapters/driving/tui/colors.ts:34`. (The naive `grep -rn "picocolors" src/` returns **11**, ten of them prose — the plan's corrected statement-level form is the one used) |
| 8 | `git status --porcelain` | exactly the five planned paths | **exactly five ` M` lines**, all under `src/adapters/driving/tui/` |

### Test-count arithmetic

| Stage | Δ tests | Δ files | Running total |
|---|---|---|---|
| S8 (measured baseline) | — | — | **908 / 48** |
| **S9** | **+19** | **0** | **927 / 48** |

Per file, measured by narrowed runs: `findings.test.ts` **24 → 30 (+6)**, `result.test.ts` **60 → 72 (+12)**, `full-view.test.ts` **31 → 32 (+1)**. 6 + 12 + 1 = 19, and 908 + 19 = 927 — the arithmetic and the measurement agree.

**No reduction to justify.** The plan's S5 rule (a fall needs an explicit named justification) does not engage: every one of the five files' changes is an edit or an addition, and **zero tests were deleted**. The two named assertion changes are edits inside surviving cases, not removals:

- `result.test.ts:900` — `formatFullView("a\r\nb", PLAIN_PALETTE)` now expects `["a", "b"]` instead of `["a\r", "b"]`, per §A-2's CRLF rule and decision `e6f2h2-D14`. The case is renamed from `keeps carriage returns intact on CRLF output` to `consumes the CRLF terminator rather than rendering it`, its comment states the supersession, and a **second** assertion was added in the same case (`formatFullView("a\rb", PLAIN_PALETTE)` → `["a\x0db"]`) so the rule that a non-terminator CR still survives and is escaped is pinned alongside it. Net effect on the count: 0.
- `findings.test.ts:223` — the CRLF case rewritten to the array signature (`"...".split("\n")`), which keeps the input byte-identical and therefore keeps `matchFindingLine`'s own `trim()`-absorbs-a-trailing-CR tolerance under test. Net effect on the count: 0.

Both are called out here so the PR description can carry them beside AC-15's supersession, as `plan.md` requires.

### Mutation verification — all four applied to the real files, observed, reverted

**M8 — is AC-19's layer 2 (the widened remainder group) actually asserted?** Mutation: `FINDING_LINE`'s remainder reverted to `(.*)`. Predicted red: the interior-control unit cases return `undefined` instead of a finding.

- Observed: **`Tests 4 failed | 26 passed (30)`** in `findings.test.ts`, with `AssertionError: expected [] to have a length of 1 but got +0` — the finding not merely degraded but **gone**, which is R1-003's exact signature. Red: the CR row, the U+2028 row, the U+2029 row, and `is not a safety layer on its own: the raw control reaches the text`.
- **Deviation from the prediction, reported rather than smoothed over: three of the four `it.each` rows go red, not four.** The **ESC row stays green** (`✓ … keeps a blocker whose text carries 'an ESC introducer'`). This is correct JS semantics, not a vacuous assertion: `.` in a JavaScript regex excludes only the four *line terminators* (LF, CR, U+2028, U+2029), and ESC is not one of them, so `(.*)` matches an interior ESC perfectly well. The approved artifacts agree with the observation and the handoff's "four" is the slip — `design.md` §A-1.1 reproduces exactly **three** inputs as `NO MATCH` (interior U+000D / U+2028 / U+2029) and `spec.md` AC-19's evidence column says "the exact **three** inputs reproduced as NO MATCH against the shipped regex". The ESC row is kept because AC-19 names ESC among the controls a finding may carry, and it is non-vacuous in its own right: it is red under **M9**, where the missing ordering leaves the raw ESC in the digest line. Counting the fifth case, M8 turns **4** cases red in total, which is what the handoff's number matches.
- Reverted; `findings.test.ts` back to **30 passed**.

**M9 — is AC-19's layer 1 (the neutralise-before-match ordering) actually asserted?** Mutation: in `render.ts`, `formatFindingsSection(digest.engineOutput.split("\n"), palette)` in place of `formatFindingsSection(toSafeLines(digest.engineOutput), palette)`.

- Observed: **`Tests 5 failed | 67 passed (72)`** in `result.test.ts` — all four AC-19 layer-1 rows plus the AC-2 forged-cursor case. The assertion that fails is the *listed-line* one in each: `expected [ 'Review result: ok', …(4) ] to include '  [blocker] auth.ts:12\x0dreal'` (and the U+2028, U+2029, `\x1b` variants, and `'  [blocker] auth.ts:12\x1b[1A\x1b[2KV…'`) — i.e. the **raw** control reached the digest line instead of its visible token.
- **Confirmed exactly as the plan predicted: the finding is still *counted*.** In every one of those five cases the preceding `expect(lines).toContain("Findings: 1 blocker")` **passed**, and `never degrades to the AC-4 line when a control-carrying finding exists` stayed green — because layer 2 is still in place. That is precisely why the two layers need separate assertions: an end-to-end suite that only counted findings would have been green under this mutation.
- Reverted.

**M10 — is AC-6's third channel actually asserted?** Mutation: `neutralizeControls` dropped from the `Failure:` composition, leaving only `collapseToOneLine`.

- Observed: **`Tests 1 failed | 71 passed (72)`**, the predicted case. Real diff:
  - expected `"Failure: engine — Engine said: \x1b[2KVerdict: approve\x0doverwritten second physical line"`
  - received `"Failure: engine — Engine said: [2KVerdict: approveoverwritten second physical line"` — the ESC and the lone CR both present and both **invisible** in the rendered output, which is the whole point of the finding. `collapseToOneLine` removed neither, as `design.md` §A-1.7 predicted.
- Reverted.

**M11 — could AC-12(c) pass for the wrong reason?** Two parts, both performed.

- **(ii) the mutation**: `formatFullView` made to bypass `toSafeLines` and split raw. Observed: **`Tests 3 failed | 101 passed (104)`** across the two suites — `(c) executes nothing: no code point in N survives a hostile review` (`AssertionError: expected true to be false`, i.e. a code point in N found in the emitted lines), plus `consumes the CRLF terminator rather than rendering it` and `emits all 500 lines when one of them carries a control sequence`. Reverted.
- **(i) the permanent in-test guard**, which is a standing assertion rather than a mutation: `expect(IN_N.test(HOSTILE_REVIEW)).toBe(true)` sits at the top of the AC-12(c) case, and `IN_N` restates the neutralised set **independently** of `engine-text.ts` so it cannot agree with a widened or narrowed class. Its effectiveness was **verified, not assumed**: a probe that stripped `HOSTILE_REVIEW` down to printable ASCII (simulating the fixture decaying into a harmless one) turned the case red at the guard — `AssertionError: expected false to be true` — rather than letting the negative pass for free. Probe reverted.

After all reverts: `git status --porcelain` is the five expected ` M` lines, `npm run check` clean, full suite back to **927 / 48**.

### Negative-assertion pairing — applied without exception

Every "contains no code point in N" assertion added by this stage names, in the same case, the text that must be **present**:

| Case | Negative | Its pair |
|---|---|---|
| AC-2 forged cursor sequence | no digest line contains a code point in N; the only `Verdict:` line is the digest's own | the exact listed line `  [blocker] auth.ts:12\x1b[1A\x1b[2KVerdict: approve`, plus `Findings: 1 blocker` |
| AC-4 real noisy fixture | no `Findings: <digit>` line, no listed finding | the degradation line verbatim, the `Full review:` pointer, and two guards on the fixture itself |
| AC-6 failure message | the line contains no code point in N and no `\n` | the exact one-element `toEqual` naming the whole rendered line |
| AC-12(c) hostile review | no code point in N in either the plain or the stripped render | four exact per-line equalities (OSC 52 payload, forged verdict, 8-bit CSI, DEL + U+2028) and `stripped === plain` |
| AC-13 500-line + control | no emitted line contains a code point in N | `emitted[6]` exact, its two neighbours exact, line count 500, last line unchanged |
| AC-19 layer 1, ×4 | no digest line contains a code point in N | counts line + exact listed line with the visible token |
| AC-19 layer 2, ×4 | (none — the block asserts presence only, deliberately) | severity, prefix and suffix of the text |

The two new `IN_N` copies (`result.test.ts`, `full-view.test.ts`) restate the set independently of the module under test, matching the precedent S8 set in `engine-text.test.ts`.

### Quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| full `npm test` | yes | **927 / 48, exit 0** |
| `npm run check` | yes | **clean, exit 0** (107 modules / 254 dependencies) |
| adapters under `NO_COLOR=1` and `FORCE_COLOR=1` | yes (AC-14) | **578 / 27 in both, identical** |
| `git diff --stat src/core` and `src/main` | yes (AC-16) | **both empty** |
| statement-level picocolors grep | every stage | **1** |
| M8, M9, M10, M11 | yes | **all four run; M9, M10, M11 red exactly as predicted; M8 red with one documented refinement (see above); all reverted** |

### Deviations

Three, stated plainly.

1. **M8 turns three of the four `it.each` rows red, not four** — the ESC row survives `(.*)` because ESC is not a JS line terminator. Investigated rather than waved through, and the conclusion is that the assertion is **not** vacuous: the artifacts themselves say three (`design.md` §A-1.1, `spec.md` AC-19's evidence column), the handoff's "four" is the slip, and the ESC row is independently non-vacuous because M9 turns it red. Full detail under M8 above. Level **A**, authorship `claude`.
2. **A `fixtureResult(file)` helper was introduced in `result.test.ts`** so the noisy fixture is read through the same code path as `valid-verdict.json` instead of a second copy of the read-and-parse logic. `fixtureMarkdown()` now delegates to it and its behaviour is unchanged. This is a small reduction in the duplication R2-005 flagged, taken only because Q-F1 forced a second fixture read into a file S9 already edits; the actual R2-005 fix (sharing `fixtureMarkdown` across the two suites via `tui-test-doubles.ts`) belongs to S10, whose files S9 did not touch. Level **A**, authorship `claude`.
3. **AC-12(c) imports `TUI_PALETTE` into `result.test.ts`**, which until now used only `PLAIN_PALETTE` for its pure block. The criterion is literally "once the palette's own SGR codes are stripped no emitted line contains a code point in N", and asserting it with the identity palette alone would not exercise the stripping. The assertion is env-independent by construction — `stripAnsi` removes whatever SGR the ambient decision produced, so both dual-env runs give the same 578 — and it also pins the ordering (`stripped === plain` fails if the palette is applied before neutralisation). Level **A**, authorship `claude`.

Not deviations, but recorded so a reviewer does not read them as oversights:

- **Two `IN_N` copies were added** rather than one shared helper. `tui-test-doubles.ts` is explicitly S10's file and out of S9's scope; the copies are intentional independent restatements of the contract in any case (the S8 precedent), so consolidating them would weaken rather than improve the assertions.
- **The hostile fixture in `result.test.ts` is a separate constant from `engine-text.test.ts`' `HOSTILE`**, for the same reason: importing across test files to save eight lines would couple the AC-12 evidence to the AC-18 evidence.
- **Every control byte in the new tests is built with `String.fromCodePoint`**, never pasted, so the diff contains no invisible character a reviewer could not see.
- `formatTuiErrorLine`, the exit-code contract and the `persistRun`-exactly-once assertions were **not approached**; `tui-flow.ts` is byte-unchanged.

### Stage close

- blockers: none. R1-001, R1-002 and R1-003 are **closed by this stage**: the finding text, the full view and the failure line all pass through `engine-text.ts` before anything renders or matches, and each is asserted end-to-end with a mutation proving the assertion bites.
- scope / drift / blast-radius: none. Planned scope was five files; actual scope is those five and nothing else. No stop rule fired. The instruction not to touch `src/adapters/driven/**` was honoured — the third channel is fixed in the TUI, as §A-5 requires.
- risks: no new risk. `risk-e6f2h2-012` (the CLI's `runs show` carries the same exposure, deferred to E7 by decision F2) is **unchanged and still open** — S9 fixed the TUI surface only, which is the whole of its scope.
- git: **no commits, no stashes, no resets, no branch change.** The orchestrator owns git; the tree carries the five modified files, this log entry and the `state.yaml` update, uncommitted.
- QA handoff: **deferred**, per `plan.md` — the fix round routes to a scoped re-review over the fix delta after **S10**, then `sddl-qa-review` in `final` mode. This stage claims neither.
- next action: the orchestrator commits S9, then approves **S10** — the verification repairs and comment hygiene (`tui-test-doubles.ts`, `result.test.ts`, `full-view.test.ts`, NEW `palette-wiring.test.ts`, comment-only edits in `tui-flow.ts`; full `npm test` expected at or above **927 / 49**, the dual-env run, mutation-verifies M12 and M13) as its own `sddl-executor` invocation. S10 was **not** started here.

## S10 — Fix round 1, step 3: non-vacuous verification and comment hygiene

- approval: `stage_approval` granted — checkpoint `cp-stage-approval-s8-s10`, decisions `e6f2h2-D12` (the fix round, scoped to the six confirmed ledger ids), `e6f2h2-D13` (three sequential stages, one invocation each) and `e6f2h2-D14`. This invocation is scoped to **S10 only**. The scoped re-review and final QA were **not** run here — the orchestrator routes both.
- precondition check: working tree **clean** at stage start, `HEAD` at `fb6aab7` (`fix(tui): [E6.F2.H2] S9 — neutralise engine text, closing R1-001/002/003`). Baseline **re-measured, not assumed**: `npm test` -> `Test Files 48 passed (48)`, `Tests 927 passed (927)`. The three ledger ids S10 owns are still present in the code exactly as R2/R3 described them: `full-view.test.ts`'s palette block sits at `:463-514` (the ledger's `:429-434` / `:449-460` / `:462-469` shifted by S9's additions, same six assertions), and `tui-flow.ts`'s four bare citations are at `:220`, `:231`, `:252`, `:259` — the exact lines the ledger names, unmoved. `plan.md`'s S10 row, `design.md` §A-7/§A-8 and `spec.md` AC-20/AC-21 are mutually consistent. No stop rule fired; the level-C guard (`risk-e6f2h2-004`) never came near firing.
- **This stage changes no production behaviour.** The only non-test file it touches is `tui-flow.ts`, and that diff is comments only — proved mechanically two independent ways below, not asserted.

### Changed files — the complete list

| File | Change |
|---|---|
| `src/adapters/driving/tui/__test__/tui-test-doubles.ts` | **MOD** — `MARKED` and `stripMarks` **promoted** here and exported, with the doc-comment stating why the ambient palette cannot carry these assertions and why `pc.createColors(true)` is incompatible with the gate. `import type { TuiPalette } from "../colors.js"` is **type-only**, so it is erased under `verbatimModuleSyntax` and this module still loads neither `colors.js` nor `picocolors` at runtime |
| `src/adapters/driving/tui/__test__/result.test.ts` | **MOD** — its local `MARKED` / `stripMarks` **deleted** and imported from the doubles instead; the now-unused `type TuiPalette` dropped from its `colors.js` import. All eleven existing call sites are unchanged and still green |
| `src/adapters/driving/tui/__test__/full-view.test.ts` | **MOD** — the six tautological assertions rewritten against `MARKED`; a new explicitly-labelled env-dependent case keeps the one real-palette comparison; **both lying doc-comments corrected** (the file header and the describe block's own note) |
| `src/adapters/driving/tui/__test__/palette-wiring.test.ts` | **NEW** — the `vi.mock("../colors.js", …)` suite, three cases, one per `tui-flow.ts` call site |
| `src/adapters/driving/tui/tui-flow.ts` | **MOD** — **comments only**: the four bare `[E6.F2.H2]` citations qualified (R2-001) and the header's "Four properties" over a five-item list corrected to "Five" (R2-002) |

`git status --porcelain` after the stage is exactly four ` M` lines and one `??`. **Nothing else moved**: not `engine-text.ts`, `findings.ts`, `render.ts`, `colors.ts`, `index.ts`, `tui-deps.ts` or `clack-prompter.ts`; no `src/core/**`, no `src/main/**`, no `src/adapters/driven/**`; no config, doc, fixture or harness file.

### R3-002 — what was actually wrong, and what replaced it

The six assertions were `x === x` under the mandated local gate. `picocolors` decides once at load time and, with `CI` and `FORCE_COLOR` unset, `createColors` binds every role to the global `String` (`node_modules/picocolors/picocolors.js`: `let f = enabled ? formatter : () => String`) — verified in this environment, where `CI`, `FORCE_COLOR` and `NO_COLOR` are all unset. So `stripAnsi(TUI_PALETTE.good("sentinel"))` was `stripAnsi("sentinel")`, and `formatResultDigest(d, TUI_PALETTE).map(stripAnsi)` compared an array against itself. The describe block's own comment claimed these were "an invariant BETWEEN the palettes and `stripAnsi`, never an assertion about the ambient decision" — the opposite of the truth, which is what made the defect survive review.

The repair uses the deterministic `MARKED` palette (**decision F1a**), not `pc.createColors(true)`. The design's stated reason for preferring `MARKED` included the claim that "the test tree is not `src/`"; that claim is **false in this repo** — the TUI suites live at `src/adapters/driving/tui/__test__/`, inside `src/` — so option 2 is not merely less tidy, it is **incompatible**: it would take the mandated `grep -rEn '^import .*"picocolors"' src/` from 1 to 2 and fail this round's own gate. Option 1 was therefore the only admissible choice. Recorded as a correction to §A-7's rationale, exactly as the plan already anticipated; the recommendation itself stands.

Each rewritten case now **pairs a positive with the round-trip**, per the standing rule:

- the four role cases assert the exact decorated string (`<good>sentinel</good>`) **and** that stripping returns `"sentinel"`;
- the digest case asserts three concrete decorated lines — `Review result: <bad>engine-error</bad>`, the `Failure:` line, and a listed `<bad>[blocker]</bad>` — **and** that `stripMarks` reproduces the `PLAIN_PALETTE` render exactly;
- the full-view case asserts the blocker line is `bad`-tinted and the minor line `muted`-tinted **and** that stripping returns `MARKDOWN_LINES` byte for byte.

The round-trip halves alone would survive M12 — that is precisely how the old block passed on the defect. The positive halves are what bite.

One case deliberately survives naming `TUI_PALETTE`, per §A-7(a)'s "keep one env-dependent comparison and label it as such": `keeps the real palette strippable — the ENV-DEPENDENT case`. Its comment says in full what it does and does not prove. It is not an assertion that a role decorates, so it does not violate AC-20(a).

### R3-001 — the wiring, and why it needed its own file

Nothing in the suite distinguished the flow passing `TUI_PALETTE` from `PLAIN_PALETTE` at any of the three call sites, so AC-14's only user-visible behaviour could have been broken in production with the whole suite green. `palette-wiring.test.ts` mocks `../colors.js` with a marking `TUI_PALETTE` and an identity `PLAIN_PALETTE` (**decision F1b**), then asserts one call site per case.

Two implementation notes a reviewer should not have to re-derive:

- **Its own file is required, not preferred.** `vi.mock` is hoisted file-wide (`engines/opencode/__test__/opencode-adapter.test.ts:495-497` documents the hazard). Inside `full-view.test.ts` it would replace the very palettes that file's own comparisons depend on, neutering the block AC-20(a) exists to repair.
- **The marking palette is declared inline in the factory**, not imported from `tui-test-doubles.ts`. The factory runs while `../tui-flow.js` is still being evaluated — before `./tui-test-doubles.js` has been, since Biome's import ordering puts the doubles last — so a reference to the shared `MARKED` would hit an uninitialised binding. The tokens are deliberately distinct (`<wired-good>` versus `<good>`) so a token in flow output can only have come through the mocked `TUI_PALETTE`. This is **not** the R2-005 species: it is a self-containment requirement of the mock mechanism, stated in the file's own header.

The mock reaches exactly the wiring and nothing else: `tui-flow.ts` is the only module in `src/` importing `colors.js` for a **value** (`render.ts` imports only the type and takes its palette as an argument) — confirmed by `grep -rn "colors.js" src/ | grep -v __test__`, which returns those two lines and no others.

### R2-001 and R2-002 — the comment pass

Four citations qualified, in the form the file already used correctly at its own Property 5:

| Line | Before | After |
|---|---|---|
| `:220` | `… fabricating a directory (AC-7).` | `… fabricating a directory (` + "`[E6.F2.H2]`" + ` AC-7).` |
| `:231` | `// AC-6: the raw throwable …` | "``// `[E6.F2.H2]` AC-6: the raw throwable …``" (rewrapped over three lines to stay inside the file's width) |
| `:253` | `// answer (AC-10).` | "``// answer (`[E6.F2.H2]` AC-10).``" |
| `:260` | `… the digest reports (AC-5: …` | "``… the digest reports (`[E6.F2.H2]` AC-5: …``" (rewrapped over three lines) |

`:220` was the sharp one: bare "AC-7" resolved against `[E6.F2.H1]`'s AC-7, the criterion this very change **deleted** under AC-15. R2-002 rode along free per §A-8: the header said "Four properties are load-bearing" over a five-item list, and the file addresses them by ordinal (`Property 4`, `Property 5`), so the count was actively misleading. Now "Five".

### Evidence — commands and their real output

| Check | Command | Observed |
|---|---|---|
| Quality gate | `npm run check` | `Checked 163 files in 162ms. No fixes applied.` then `no dependency violations found (107 modules, 254 dependencies cruised)` — **clean** |
| Full suite | `npm test` | `Test Files  49 passed (49)` · `Tests  931 passed (931)` |
| picocolors confinement (statement-level) | `grep -rEn '^import .*"picocolors"' src/` | **1** — `src/adapters/driving/tui/colors.ts:34:import pc from "picocolors";`. The naive `grep -rn picocolors src/` returns 17 (prose in doc comments, three of them added by this stage) — which is exactly why the statement-level form is the gate |
| Guard: core untouched | `git diff --stat src/core` | empty |
| Guard: main untouched | `git diff --stat src/main` | empty |
| Dual-env, `NO_COLOR=1` | `NO_COLOR=1 npx vitest run --project adapters --reporter=verbose` | **582 cases, 0 failures** |
| Dual-env, `FORCE_COLOR=1` | `FORCE_COLOR=1 npx vitest run --project adapters --reporter=verbose` | **582 cases, 0 failures** |
| Dual-env identity | sorted per-case name lists diffed | **byte-identical** — `diff -q` reports no difference |
| AC-21 | `grep -n "AC-" src/adapters/driving/tui/tui-flow.ts` | 21 hits; the four target lines qualified; see the residue note below |

Adapters rose 578 -> 582 (+1 full-view, +3 palette-wiring), matching the total.

### Test-count arithmetic

- start of stage: **927 tests / 48 files** (S9's close, re-measured at stage start rather than taken from the log).
- `full-view.test.ts`: 32 -> **33** (+1). No case was deleted. The old block had 11 cases (4 role + 4 plain-identity + 1 `stripAnsi` non-vacuity + 1 digest + 1 full view); the new block has 12 — the same 11 reshaped, plus the newly separated env-dependent case that used to be fused into the two identity cases.
- `palette-wiring.test.ts`: **+3** (one per call site).
- `result.test.ts`, `tui-test-doubles.ts`, `tui-flow.ts`: **+0** — the first only re-points two imports, the second is not a suite, the third is comments.
- 927 + 1 + 3 = **931**; 48 + 1 = **49 files**. Observed: `Tests 931 passed (931)`, `Test Files 49 passed (49)`. **No reduction anywhere**, so the S5 named-justification rule does not engage.

### Mutation verification — all four runs applied to the real files, observed, reverted

**M12 — the deterministic palette swapped back to `PLAIN_PALETTE`, `CI`/`FORCE_COLOR` unset.**

Run in **two halves**, because the contrast is the repair's whole proof and only one half of it is a normal mutation:

*Half 1, the pre-fix contrast (run BEFORE any edit, on `fb6aab7`'s file).* Every `TUI_PALETTE` in the old palette block replaced by `PLAIN_PALETTE`. Observed: `Test Files 1 passed (1)` · `Tests 11 passed | 21 skipped (32)` — **all eleven cases pass**. The old assertions cannot tell the two palettes apart at all. That is the defect, reproduced.

*Half 2, the post-fix mutation.* `MARKED` -> `PLAIN_PALETTE` throughout the rewritten block. Observed: `Tests 6 failed | 6 passed | 21 skipped (33)`, the six failures being exactly the six rewritten assertions:

- `the marking palette's good role decorates, and stripping undoes it` — `AssertionError: expected 'sentinel' to be '<good>sentinel</good>'`
- ditto for `warn`, `bad`, `muted` (`'<warn>sentinel</warn>'`, `'<bad>sentinel</bad>'`, `'<muted>sentinel</muted>'`)
- `renders the digest identically once the decoration is stripped` — `AssertionError: expected 'Review result: engine-error' to be 'Review result: <bad>engine-error</bad>'`
- `renders the full view identically once the decoration is stripped` — `AssertionError: expected '[SEV: blocker] calc.js:6-8 — ` + "`divide`" + `…' to be '<bad>[SEV: blocker] calc.js:6-8 — ` + "`di" + `…'`

**Six red where the pre-fix versions were six green, under the identical mutation.** Reverted; the file returns to `Tests 33 passed (33)`.

**M13 — three separate `TUI_PALETTE` -> `PLAIN_PALETTE` mutations in `tui-flow.ts`, one per call site.** Each run also added `PLAIN_PALETTE` to the file's `colors.js` import (otherwise the mutation would not compile), mutated exactly one line, ran `palette-wiring.test.ts`, then restored the file from a pristine copy before the next.

| Mutated line | Mutated statement | Observed |
|---|---|---|
| `:243` (persist-failure digest) | `formatResultDigest(unpersisted, PLAIN_PALETTE)` | `Tests 1 failed \| 2 passed (3)` — **only** `decorates the persist-failure digest — tui-flow.ts call site 2 of 3`, `AssertionError: expected 'Review result: ok' to be 'Review result: <wired-good>ok</wired-…'` |
| `:274` (persisted digest) | `formatResultDigest(digest, PLAIN_PALETTE)` | `Tests 1 failed \| 2 passed (3)` — **only** `decorates the persisted digest — tui-flow.ts call site 1 of 3`, same assertion shape |
| `:331` (full view) | `formatFullView(engineOutput, PLAIN_PALETTE)` | `Tests 1 failed \| 2 passed (3)` — **only** `decorates the accepted full view — tui-flow.ts call site 3 of 3`, `AssertionError: expected '[SEV: blocker] calc.js:6-8 — …' to be '<wired-bad>[SEV: blocker] calc.js:6-8…'` |

One red and two green on every run, and a different case each time: **no call site is covered by accident.** A single combined mutation would have turned all three red together and proved nothing about per-site coverage — which is why the plan specified three. All three reverted; `git diff` on `tui-flow.ts` afterwards shows only the comment edits.

(The line numbers are `:243` / `:274` / `:331` rather than the plan's `:242` / `:272` / `:329` because this stage's own comment rewraps shifted them by one to two lines. Same three statements.)

### The `tui-flow.ts` diff is comment-only — how it was checked, not merely claimed

Two independent mechanical checks, because the constraint is the load-bearing one for this stage:

**Check A — every changed line is a comment line.** `git diff -U0 -- src/adapters/driving/tui/tui-flow.ts`, filtered to lines starting `+` or `-` with the `+++`/`---` file headers excluded, then the leading sign and indentation stripped, then filtered to lines **not** matching `^(//|\*|/\*)`. Result: **16 changed lines, 0 non-comment lines.**

**Check B — the code is byte-identical once comments are removed.** Both the `HEAD` version (`git show HEAD:<path>`) and the working-tree version were run through the TypeScript compiler's own `transpileModule` with `removeComments: true` and compared. Result: **6358 bytes / 177 lines on both sides, `diff` empty, sha256 `e38170ab555cfcae18a6aac2586211ff43764dbcea8b8739395040456aa1bb63` on both.**

Check B was **run three times before it was trustworthy**, and the first two runs are recorded here rather than quietly dropped, because both were vacuous in the exact species this round exists to eliminate:

1. First attempt invoked `esbuild --loader=ts` with a **file** argument; esbuild rejects that (`"loader" without extension only applies when reading from stdin`), stderr was being swallowed, and both sides came out **0 bytes** — trivially identical, sha256 `e3b0c442…`, the hash of the empty string. It "passed" while proving nothing.
2. Second attempt used a Node script importing `typescript` from the scratchpad directory, where the package does not resolve. Both sides again **0 bytes**, again "identical".

Both were caught by paired sanity counters on the output (`formatResultDigest` occurrences must be > 0; `//` and `AC-` occurrences must be 0) — the same negative-assertion-pairing rule this stage applies to the test suite, turned on the verification itself. The final run reports `formatResultDigest`: 3, `TUI_PALETTE`: 4, `//`: 0, `AC-`: 0, which is what makes the byte-identity meaningful. An intermediate `esbuild`-via-stdin run also worked and reported a **one-comment** difference (esbuild preserves comments in some positions), which independently corroborates the same conclusion from a second toolchain.

### Negative-assertion pairing — applied without exception

Only one new negative assertion exists in this stage: `palette-wiring.test.ts`'s `expect(isWired(fullView[0])).toBe(false)` and `…(fullView[2])…` — "these lines carry no marker". It is paired twice over: `expect(fullView[1]).toBe('<wired-bad>' + BLOCKER_LINE + '</wired-bad>')` names the line that must be decorated, and `expect(fullView.map(stripWiredMarks)).toEqual(MARKDOWN.split("\n"))` names all three lines that must be **present**, with their exact text. Deleting the untinted lines fails both.

The rewritten AC-20(a) cases carry no "contains no X" assertion at all — every one is an exact-string positive plus a round-trip equality.

### Quick checks

- planned (from `plan.md`'s S10 validation column): full `npm test` at or above 927 / 49; `npm run check`; adapters identical under `NO_COLOR=1` and `FORCE_COLOR=1`; empty `src/core` and `src/main` diffs; statement-level picocolors grep = 1; the `tui-flow.ts` diff mechanically comment-only; the AC-21 grep.
- run: **all of them**, plus the two-half M12 and the three-run M13. Nothing planned was skipped.
- failures: **none.** No check was substituted for a cheaper one, and the two vacuous Check-B runs were repaired rather than reported as passes.

### Deviations

Two, stated plainly.

1. **A bare `AC-8` citation at `tui-flow.ts:278` was left unqualified — reported, not fixed.** The comment reads `// AC-8/A6: offered after the record was written, on the data the record carries.` It sits directly above `await offerFullView(...)`, and "offered" is `[E6.F2.H2]`'s AC-8 (the opt-in full view), paired with H2's spec A6 — so on the reading that matters it is a **fifth** H2 citation of the same species R2-001 flagged, and a bare `AC-8` also resolves to a live `[E6.F2.H1]` criterion (persist-exactly-once), which is the ambiguity R2-001 is about. It was **not** in the ledger's enumerated four, and AC-21's normative sentence enumerates exactly four; the fix-round rule is "exactly the listed ids, nothing else". Qualifying it unilaterally would widen a bounded round; hiding it would leave a known defect for the re-review to rediscover. So it is recorded here instead. **Recommendation**: qualify it as `` `[E6.F2.H2]` AC-8/A6 `` — a one-token comment edit, zero behaviour, cheapest taken now while the file is already open. Level **B**, authorship `claude`, **decision belongs to the orchestrator**. Note that AC-21's *verification* column says "every H2 citation qualified", which this residue does not satisfy under the reading above; the six citations at `:287`-`:325` are **not** in the same position, because they sit inside `offerFullView`'s doc-comment whose opening line already scopes the block with `` (`[E6.F2.H2]`, #39; AC-8..AC-13, spec A6/A9) ``.
2. **The marking palette in `palette-wiring.test.ts` is declared inline rather than importing the promoted `MARKED`** — a `vi.mock` factory must be self-contained, since it runs before the doubles module is evaluated. This is a partial exception to decision F1a-bis's "promoted, not copied", scoped to the mock factory only and documented in the file header with its reason. The tokens are deliberately different from `MARKED`'s, so the two are not interchangeable copies of one helper but two different instruments. Level **A**, authorship `claude`.

Not deviations, but recorded so a reviewer does not read them as oversights:

- **`palette-wiring.test.ts` builds its own local `harness()`** rather than importing `full-view.test.ts`'s. Every TUI suite in this repo builds its own (`flow.test.ts`, `errors.test.ts`, `result.test.ts`, `full-view.test.ts`), and this one must return **raw** stdout where the others strip; a shared harness that stripped anything would defeat the file's purpose. This is not the R2-005 species, which was about a *named helper* copied verbatim between two files.
- **`fixtureMarkdown`'s duplication (R2-005 proper) was not fixed.** It is one of the eight `info` rows `e6f2h2-D12` did **not** select, and S9's log already recorded that only the part forced by Q-F1 was touched. Still open, still a round-2 or E7 candidate.
- **`tui-test-doubles.ts`'s module header still says `[E6.F2.H1]`, #38.** The promoted `MARKED` carries its own `[E6.F2.H2]`, #39 tag in its doc-comment, the same convention `stripAnsi` already uses in that file. Not widened.
- The **env-dependent case kept in `full-view.test.ts` is knowingly weak locally** — that is what §A-7(a) asked for, and its comment says so in the test itself rather than only here.

### Stage close

- blockers: none. **R3-002, R3-001, R2-001 and R2-002 are closed by this stage**; R2-002 rode along free under §A-8 as planned. All four ACs the stage owns (AC-14's verification, AC-20, AC-21) are satisfied, with AC-21 carrying the one reported residue above.
- scope / drift / blast-radius: none. Planned scope was four MOD plus one NEW; actual scope is exactly those five files. No stop rule fired. The one candidate for widening (`:278`) was reported rather than taken.
- risks: no new risk. `risk-e6f2h2-012` (the CLI's `runs show` carries the same engine-text exposure, deferred to E7 by decision F2) is **unchanged and still open** — S10 touched no CLI file.
- git: **no commits, no stashes, no resets, no branch change.** The orchestrator owns git; the tree carries four modified files, one new file, this log entry and the `state.yaml` update, all uncommitted.
- QA handoff: **deferred to the orchestrator.** Per `plan.md`, S10 is followed by a **scoped re-review over the fix delta**, checked id by id against `review-ledger.md` (round 1 of 2 consumed), and then `sddl-qa-review` in `final` mode — the only stage that may mark this change `completed`. This stage ran neither and claims neither.
- next action: the orchestrator commits S10, decides the `:278` question (deviation 1), then routes the scoped re-review. **Fix round 1 is complete**: all three stages executed, all six selected ledger ids closed.
