# QA Report

## Closeout Digest

- change_name: e6-f2-h2-result-rendering
- mode: **stage** (does not close the change)
- target: commits `b0a3a04..442e705` on `claude/project-post-merge-analysis-a4tcbl` — stages S1 (pin), S2+S3 (matcher + colour seam), S4 (digest + full view). Working tree clean at `442e705`.
- verdict: **pass_with_warnings**
- reported_at: 2026-08-29T21:05:00Z
- one-line: the digest's literal copy matches `design.md` byte for byte, colour carries no information of its own, and every pure AC in scope holds — except AC-6's "exactly one message line", which is reachable today with a multi-line `record.failure.message` and is guarded only by a vacuous test.

## Findings

| Id | Severity | AC | Evidence | Recommendation |
|---|---|---|---|---|
| QA-S4-01 | **medium** | AC-6 | `render.ts:243-249` interpolates `digest.failure.message` into one template string with no whitespace reduction anywhere in the file. On the persisted path that value is `record.failure.message`, which `core/history/persist-run.ts:91-95` copies verbatim from `failure.error.message`. `adapters/driven/git/git-cli.ts:354` builds port errors as `` `${message}: ${asError.message}` `` where `asError` is an execa error — measured in this review: `execa("git", ["worktree","add","/tmp/nope-xyz","definitely-not-a-ref"])` rejects with a **3-line** message (`"Command failed with exit code 128: …\n\nfatal: invalid reference: …"`). `run-review.ts:496-517` classifies such an error as `engine-error` and returns it as a failure (it does not reject), so the TUI persists and renders it. Result: a `Failure:` entry spanning three physical lines with a blank line inside it, on one of the most ordinary failure paths (a bad ref). The CLI, given the same value, deliberately collapses it — `cli/render/format-review.ts` `field()`: `.replace(/[\t\r\n]+/g, " ")`, commented "a failure message carrying a newline would otherwise split one record across two lines (AC-10)". **The guarding test is vacuous**: `result.test.ts` "never breaks a line and never leaks a stack frame" asserts `lines.some(l => l.includes("\n")) === false` while feeding `message: "spawn failed"` — an input that cannot break a line. | Collapse whitespace on the message inside `formatResultDigest` (the CLI's `field()` reduction, or reuse `formatTuiErrorLine`'s `replace(/\s*\n\s*/g, " ")`), and add one pure case with an embedded `\n`. Note this contradicts `design.md`'s "the persisted path passes `record.failure` straight through untouched", so it is a small design correction, not a silent implementation fix — decide it at S5, which owns both call sites. |
| QA-S4-02 | low | AC-4 / AC-7 / AC-9 interaction | With `engineOutput === ""` the digest emits `Findings: none in the [SEV: …] format — … see the full review.` **and** `Full review: <runDir>/result.md` (both correct per AC-4/AC-7 and asserted at `result.test.ts` "points at result.md for a defined but empty engineOutput"), while AC-8/AC-9 will withhold the full-view prompt because the markdown is blank. The user is pointed at an empty file and offered nothing. Deliberate per spec A9, and honest, but the three conditions disagree only in this one cell. | No change required. Recorded so S6 does not "fix" the blank-guard by accident. |

No BLOCKER/CRITICAL finding. Per the project severity floor, neither finding opens a fix loop; QA-S4-01 is carried into S5's scope, which edits exactly this code.

## Acceptance Criteria Verification (pure halves in scope)

| AC | Result | Evidence I checked personally |
|---|---|---|
| AC-1 | pass | `render.ts:236-241`: `Review result:` unconditional, exactly one `Verdict:` line always — the value or `none — no verdict was parsed for this run.` Copy is byte-identical to `design.md` (compared programmatically, U+2026 / U+2014 included). Tests cover the three verdicts and all five states. |
| AC-2 | pass | `render.ts:189-213`: counts line + `LISTED_SEVERITIES = ["blocker","major"]`, blockers grouped before majors, `minor`/`nit` counted only. Fixture `fixtures/claude-code/valid-verdict.json` really carries 1 major + 1 minor with `calc.js:6-8` (read directly). Zero findings → degradation branch; only-minors → counts with no listed lines (both asserted). Empty finding text renders one trailing space — known and accepted, breaks no AC. |
| AC-3 | pass | `findings.ts:33-66`: `trim()` → `/^(?:(?:[-*+>]|\d{1,3}[.)])\s+)+/` → `/^\[\s*sev\s*:\s*(blocker\|major\|minor\|nit)\s*\]\s*(.*)$/i`, remainder `.trim()`ed and never re-split. Matches design §Design Overview step-for-step. `[SEV: critical]`, mid-line markers, `[SEVERITY:]`, `[SEV major]` all rejected; 24 tests in `__test__/findings.test.ts` cover the matrix including CRLF. |
| AC-4 | pass | `render.ts:113-114` + `195-197`. Literal string byte-identical to design. It does **not** read as "no findings": the qualifier `in the [SEV: …] format`, the hedge `the engine may report them differently` and the pointer `see the full review.` are all on the same line. `result.test.ts` asserts no `^Findings: \d` line and no listed lines on this branch. |
| AC-5 | pass | `formatResultDigest` contains **no** branch on `digest.state` other than the colour role (`stateRole`, decoration only). Findings section and `Full review` line are gated solely on `engineOutput !== undefined` (`render.ts:251`, `:257`). The parse-fault shape (`engine-error` + `failure` + `engineOutput`) renders both, asserted explicitly; the 5-state × present/absent matrix is present. |
| AC-6 | **partial — see QA-S4-01** | Stage + message shape and the single-`Failure:`-entry rule hold (`render.ts:243-249`); no stack frames are constructible from `persist-run.ts`'s reduction. The "exactly one message **line**" half does not hold for a multi-line `record.failure.message`, which is reachable. |
| AC-7 | pass | `render.ts:255-261`: `Run directory:` always (`ABSENT = "-"`), `Full review:` iff `runDir !== undefined && engineOutput !== undefined`, path via `node:path.join`. Mirrors `run-store-fs.ts:223` (`if (record.engineOutput !== undefined)` → writes `result.md`) exactly — read both. Three-case coverage present. |
| AC-12 | pass | `render.ts:277-287`: `markdown.split("\n")` (confirmed — not `/\r?\n/`), per-line colour only, no header/footer/marker/line numbers. Tests assert equality with `markdown.split("\n")` for handcrafted markdown, the real fixture, `""`, `"a\n"`, and CRLF (`["a\r","b"]`). |
| AC-14 | pass (pure half) | `picocolors` exact-pinned `1.1.1` in `dependencies`; lockfile entry loses `"dev": true`. `grep -rEn '^import .*"picocolors"' src/` → exactly 1 hit (`colors.ts:34`); the plain `grep -rn` returns 9 (prose), as the recorded orchestrator correction states. No `marked`/`marked-terminal`. Every coloured fact is also plain text on the same line; the `MARKED` palette test asserts `stripMarks(render) === plainRender` as an equality — stripping the decoration loses nothing. Roles match design (`good` ok/approve, `warn` ambiguous/request-changes/major, `bad` failed/blocker/failure, `muted` paths/counts/degradation/minor/nit); `comment` → `muted` is an unlisted but harmless assignment. |
| AC-16 | pass (for this range) | `git diff --stat b0a3a04~1..442e705 -- src/core` → **empty**; same for `src/main`. `npm run check` green (five guards, 106 modules cruised, no violation). |

## Gate Results (run by me, at `442e705`)

| Command | Result |
|---|---|
| `npm run check` | green — biome 159 files, `tsc --noEmit` clean, `depcruise src` "no dependency violations found (106 modules, 252 dependencies cruised)" |
| `npm test` | **823 passed / 46 files** — matches the execution log exactly |
| `NO_COLOR=1 npx vitest run --project adapters` | 474 / 25 green |
| `FORCE_COLOR=1 npx vitest run --project adapters` | 474 / 25 green (identical) |
| `git diff --stat … -- src/core` · `-- src/main` | both empty |
| `grep -rEn '^import .*"picocolors"' src/` | 1 hit — `colors.ts:34` |
| picocolors runtime probe (`node --input-type=module`) | `pc.green/yellow/red/dim` all `function`; `FORCE_COLOR=1` emits `[32m…[39m` and `[2m…[22m` (both matched by the test double's `stripAnsi` regex); the namespace form yields `keys=[createColors,default]`, `pc.red === undefined` — S1's claim reproduced, not taken on trust |

**Verified by reading, not by running** (stated as such): that `stripAnsi(formatResultDigest(d, TUI_PALETTE)) === formatResultDigest(d, PLAIN_PALETTE)`. No test injects `TUI_PALETTE`, so today's dual-env run is green vacuously for the new code; the identity follows by composition from the `MARKED`-palette equality test plus the measured SGR shapes above, and becomes load-bearing (and directly tested) at S5/S6 — which is exactly what `risk-e6f2h2-009` already tracks.

## Review Evidence

- No `review-ledger.md` exists for this change; no 4R/judgment-day protocol has run yet (the plan schedules it after execution).
- Known-and-accepted items were re-confirmed present and are **not** findings: the stale `[E6.F2.H1]` doc comments in `render.ts` and `result.test.ts` (S5, AC-15), `formatTuiResult` surviving one stage boundary (`risk-e6f2h2-008`; 3 usages in `tui-flow.ts`, 5 in the suite), the deliberate `formatTuiErrorLine` duplication (D4/A5), and the fact that nothing imports the new modules yet.
- The four H1 literal-tail assertions are still present and green (`result.test.ts:183, 206, 235, 271`), which is the S4 invariant: no observable behaviour changed.
- Non-vacuity: I did not run my own mutation probe (read-only on `src/`). The execution log's S4 padding-removal probe (5 tests red, reverted) is consistent with `result.test.ts`'s `"  <warn>[major]  </warn> m"` assertion, which cannot pass without padding-before-colouring.

## Next Action

Proceed to **S5** under a new `stage_approval`, with QA-S4-01 added to its scope: while both `tui-flow.ts` call sites are being switched to `formatResultDigest`, decide and apply the failure-message reduction (and add the embedded-newline case that the current test cannot fail on). Everything else in the frozen range is accepted as-is. This is a `stage` review: the change stays `implementing` and is not closed.
