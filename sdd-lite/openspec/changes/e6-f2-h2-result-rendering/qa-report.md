# QA Report — e6-f2-h2-result-rendering

## Closeout Digest

- **mode**: `final` (change-wide closeout)
- **target**: `59b806e..31b7fb4` on `claude/project-post-merge-analysis-a4tcbl`, tree clean
- **story**: `[E6.F2.H2]` — TUI result rendering (issue #39), last required story of E6
- **verdict**: **`pass_with_warnings`** — 21/21 ACs verified, both gates green, 0 open severe; completion withheld for user acceptance (see §Verdict)
- **scope reviewed**: all 21 acceptance criteria re-verified independently against source and tests; both project gates re-run by QA; review ledger consumed as evidence.

> This report was written incrementally as evidence was produced, oldest section first.

## Gates Measured By QA

All commands run by this stage on the frozen tree at `31b7fb4` (clean).

| Gate | Command | Measured result |
|---|---|---|
| Quality gate | `npm run check` | **exit 0** — biome: 163 files checked, no fixes applied; `tsc --noEmit`: clean; `depcruise src`: **no dependency violations (107 modules, 254 dependencies cruised)** |
| Test gate | `npm test` | **exit 0** — **49 test files passed, 995 tests passed**, 0 skipped, duration 19.97s |
| Core isolation | `git diff --stat 59b806e..31b7fb4 -- src/core` | **empty output** across the whole change |
| Composition root | `git diff --stat 59b806e..31b7fb4 -- src/main` | **empty output** across the whole change |
| `picocolors` confinement | `grep -rEn '^import .*"picocolors"' src/` | **exactly one hit**: `src/adapters/driving/tui/colors.ts:34` |

Note on the confinement check: the naive `grep -rn "picocolors" src/` returns **18** hits on this tree and is not a valid confinement check — the other 17 are prose in doc comments naming the library. The statement-anchored form above is the check that carries meaning.

Baseline movement: inherited baseline 754 tests / 45 files → **995 / 49**. The four new files are `engine-text.test.ts`, `findings.test.ts`, `full-view.test.ts`, `palette-wiring.test.ts`; `result.test.ts` grew by 1178 lines.

| Colour matrix | `NO_COLOR=1 npx vitest run --project adapters` | **exit 0 — 28 files / 646 tests passed** |
| Colour matrix | `FORCE_COLOR=1 npx vitest run --project adapters` | **exit 0 — 28 files / 646 tests passed** (identical counts) |

**Is the `FORCE_COLOR=1` half of that matrix real?** Verified rather than assumed. A bundled probe of the shipped `colors.ts` shows `TUI_PALETTE.good("x")` returns `"x"` with `CI`/`FORCE_COLOR`/`NO_COLOR` unset (the R3-002 tautology, reproduced) and returns `ESC[32m x ESC[39m` under `FORCE_COLOR=1`. `vitest.config.ts` declares no `test.env` override, so the variable reaches the worker. The dual run therefore does carry weight in one of its two configurations.

## Independent Verification Performed By QA

Two probes were bundled with `esbuild` against the **shipped modules** (`engine-text.ts`, `findings.ts`, `render.ts`, `colors.ts`) and executed outside the vitest suite, so none of the evidence below depends on the suite being green. The neutralised set **N** was rebuilt from the AC-18 prose (65 code points), never read from the module's own character class.

| Probe | Result |
|---|---|
| AC-18 per-code-point token, P1 visibility, P2 idempotence | 65/65 code points produce the exact `\xNN` / `\uNNNN` token between sentinels; no member of N survives; second pass is stable |
| AC-18 P3 transparency | Byte-identical return for HT, LF, SP, `~`, NBSP, U+2027, U+202A, U+202E, U+2066, and a sweep of every non-N code point in U+00A0–U+2FFF |
| `splitEngineLines` element count | `length === markdown.split("\n").length` on 8 shapes incl. `"a\r\r\nb"`, `"a\n\r\n\rb"`, `""`, `"\n\n\n"`; CRLF rule and one-trailing-CR rule both hold |
| AC-12(a) completeness | Hostile 8-line fixture (OSC 52 / OSC 0 / OSC 8 / CSI cursor-up + erase / BEL / DEL / 8-bit CSI U+009B / 8-bit OSC U+009D / U+2028 / U+2029) emits exactly 8 lines under both `PLAIN_PALETTE` and the real `TUI_PALETTE` |
| AC-12(b) restricted identity | Control-free markdown reproduces `m.split("\n")` byte-for-byte |
| AC-12(c) non-executability | After stripping SGR, **no** emitted line contains any member of N — for both palettes |
| AC-13 | 500-line output with an injected `CSI 2K` still emits exactly 500 lines, marker neutralised, no cap |
| **AC-19 / RR1-001 regression sweep** | 9 base finding shapes × 65 members of N × every insertion index = **11,765 combinations**. `before && !after` (a finding the raw matcher kept and neutralisation deleted) = **0**. `!before && after` (heuristic newly widened, forbidden by decision F4) = **0** |
| **RR1-001 structural-position sweep** | Positions defined *independently* as "any index where inserting a literal space still matches": **123 structural positions** found across the 9 shapes; each probed against all five whitespace-class members of N (VT, FF, CR, LS, PS) = **615 cases, LOST = 0** |
| **Fuzz** | 200,000 random insertions; 10,373 fell in the relevant class (absorbed code point at a structural position); **LOST = 0** |
| AC-6 | `formatResultDigest` with `failure.message = "spawn\nfailed" + CSI 2K + CR + "rewrite"` yields exactly one `Failure:` line, no LF, no CR, no ESC, no stack frame |
| AC-2 | Forged `[SEV: blocker] real + CSI1A + CSI2K + CR + "Verdict: approve"` renders as one `  [blocker] …` line with visible `\x1b`/`\x0d` tokens; the forged text gets no line of its own; no member of N anywhere in the digest |
| AC-1 / AC-4 / AC-5 / AC-7 | Exercised directly: no-verdict line, degradation line with no count claim, and the 5 terminal states × {markdown present, absent} matrix for both `Findings:` and `Full review:`, plus `engine-error` carrying failure AND markdown |
| AC-3 | The five tolerance cases (`calc.js:6-8`, em dash, hyphen, no separator, unknown level) produce **byte-identical** results before and after neutralisation |

This sweep is wider than the one recorded in the execution log (9 shapes / 11,765 combinations / independently derived structural positions, versus the plan's 9 positions × 5 points = 45). It reproduces the same conclusion: RR1-001 is closed, there is no tenth structural position, and the repair did not widen the heuristic.

## Acceptance Criteria — All 21, Re-Verified

`E` = executed by QA (probe or targeted test run); `R` = read in the source/test files. Every row was checked against the code, not replayed from `execution-log.md`.

| AC | Verdict | How | Evidence QA personally checked |
|---|---|---|---|
| AC-1 | **pass** | E+R | Probe: `Review result: <state>` present for all five states; `Verdict:` line present always, carrying `none — no verdict was parsed for this run.` when absent. `render.ts:250-258`; `result.test.ts:486-528` |
| AC-2 | **pass** | E+R | Probe: fixture-shaped major listed with its own text; minor counted only; forged CSI finding rendered as visible tokens on exactly one `  [blocker]` line. `render.ts:formatFindingsSection`; `result.test.ts:530-599, 1006-1029` |
| AC-3 | **pass** | E+R | Probe: range / em dash / hyphen / no separator / list prefix / indent all classified, remainder byte-identical pre- and post-neutralisation; `[SEV: critical]` correctly ignored. `findings.ts:FINDING_LINE`; `findings.test.ts:44-180, 266-295` |
| AC-4 | **pass** | E+R | Probe: non-conforming markdown yields exactly the `none in the [SEV: …] format …` line and **no** count claim. Also asserted against the real `claude-code/noisy-output.json` fixture (`result.test.ts:1030-1060`) |
| AC-5 | **pass** | E | Probe: full 5 states × {markdown, no markdown} matrix — `Findings:` and `Full review:` appear iff `engineOutput` is defined, never keyed on state; `engine-error` carrying both `failure` and `engineOutput` renders both sections |
| AC-6 | **pass** | E+R | Probe: multi-line + ESC + lone-CR message collapses to exactly one `Failure:` line with stage, no U+000A/U+000D/U+001B, no stack frame. Order in `render.ts:262-278` is collapse → neutralise, which is the only order that works. Note: this is the criterion QA-S4-01 caught with a **vacuous** guard test; the current test (`result.test.ts:718-755, 1061-1092`) feeds genuinely multi-line and control-carrying input |
| AC-7 | **pass** | E+R | Probe: persisted+markdown → both lines; persisted without markdown → no pointer; persist failure → `Run directory: -` and no pointer; defined-but-empty `engineOutput` still gets the pointer (mirrors `run-store-fs`) |
| AC-8 | **pass** | R+E | `full-view.test.ts:212-284`: `prompter.prompts` length **5**, last entry `{kind:"confirm", message:"Show the full review output?"}`, stdout tail asserted for yes / no / cancel. `offerFullView` in `tui-flow.ts:307-334` |
| AC-9 | **pass** | R | `full-view.test.ts:286-333`: four-answer script; a fifth prompt would exhaust the scripted double and throw. Parameterised over `""`, `" "`, `"   \n\t\n  "`, `"\n"`, plus the persist-failure branch |
| AC-10 | **pass** | R | `full-view.test.ts:335-388`: the full 3×2 matrix; each cell asserts the exit code, `persistRunRequests` length 1, `prompts` length 5, **and** that the digest slice preceding the full view is identical across accept/decline/cancel |
| AC-11 | **pass** | E+R | `result.test.ts:259-278` ("asks about the full view strictly after persistRun settled") — run by name, passes. The `persistRun` fake records `prompts.length` at call time and asserts 4. Both call sites in `tui-flow.ts` place `offerFullView` after `persistRun` settles, on both branches |
| AC-12 | **pass** | E+R | All three properties executed against the shipped `formatFullView` on a hostile fixture (see probe table): (a) exact line count and per-index origin, (b) byte-identical on control-free input, (c) no member of N survives SGR-stripping. No `marked`/`marked-terminal` in `package.json`. The named supersession at `result.test.ts:900` is present and reviewed |
| AC-13 | **pass** | E+R | Probe: 500 lines in, 500 out, with and without an injected control; no marker, no cap. `full-view.test.ts:416-470` adds the flow-level "no sixth prompt" assertion |
| AC-14 | **pass** | E+R | `package.json` adds `"picocolors": "1.1.1"` (exact, in `dependencies`); lockfile drops its `dev` flag. Statement-anchored grep = **1** (`colors.ts:34`). Adapters suite identical under both env settings (646/646 each). Every coloured fact also present as plain text — asserted as a strip-equals-plain equality against `MARKED` |
| AC-15 | **pass** | E+R | H1 AC-7's `slice(-3)`/`slice(-2)` literal-tail assertions are gone; `render.ts`'s header is now an H2 boundary comment naming the supersession. **The four H1 AC-8 cases exist and were run by name, all green**: `hands persistRun the run it just completed, exactly once` (exactly-once + request identity), `attempted persistence exactly once — no retry, no second run`, `emits the no-history diagnostic and the failure, and exits non-zero` (diagnostic + non-zero exit), `asks about the full view strictly after persistRun settled (AC-11)` |
| AC-16 | **pass** | E | `npm run check` exit 0 with **no dependency violations** (five guards, 107 modules); `npm test` **995 / 49**; `git diff --stat 59b806e..31b7fb4 -- src/core` produces **no output** across the whole change (`src/main` likewise); no CLI file touched, `formatTuiErrorLine` still duplicated per Q9/D4 |
| AC-17 | **pass** | R | CLAUDE.md diff reviewed line by line. It claims E0–E6 **complete**, names `[E6.F2.H2]`'s actual surface, adds `picocolors` (exact-pinned `1.1.1`, confined to `tui/colors.ts`) to the runtime list, and states remaining MVP work is **E7 only**. It explicitly records `[E6.F2.H3]` (`sentinel open`) as "**skipped, not built** — workflow contract rule 7". **No overstatement found** |
| AC-18 | **pass** | E+R | Probe over all 65 members of N plus a broad non-N sweep: exact token, P1, P2, P3, and both deliberate exclusions (HT, LF). `engine-text.ts` has **zero imports**. `engine-text.test.ts` restates N independently of the module and guards its own fixture's hostility |
| AC-19 | **pass** | E+R | Both layers verified separately. Layer 1 (ordering): probe shows interior CR / U+2028 / U+2029 / ESC findings recognised end-to-end through `formatResultDigest`, counted and listed. Layer 2 (`([^\n]*)`): present at `findings.ts:FINDING_LINE`; `findings.test.ts:296-330` asserts the raw-control path degrades to a **visible** finding, with an explicit case stating it "is not a safety layer on its own" |
| AC-20 | **pass** | E+R | (a) The six `full-view.test.ts` assertions now run against the deterministic `MARKED` palette with paired positive + round-trip halves, and the block's doc-comment states what it actually proves. A companion case asserts `stripAnsi` really removes SGR — a guard against the guard being vacuous. (b) `palette-wiring.test.ts` mocks `../colors.js` with a *marking* `TUI_PALETTE` and an identity `PLAIN_PALETTE`, then asserts the exact marked string at **all three** call sites (persisted digest, persist-failure digest, accepted full view). Swapping any one argument to `PLAIN_PALETTE` makes exactly one `toBe` fail — the mutation is deductive from the mock, not merely claimed |
| AC-21 | **pass (with a nit)** | R | The four named bare citations are qualified: `tui-flow.ts:220`, `:231`, `:253`, `:260`, `:278` all read `` `[E6.F2.H2]` AC-n ``. Every remaining bare number in the pre-run half (`:18, :21, :23, :33, :57, :63, :72, :81, :168, :207`) resolves to a live H1 criterion. **Nit**: the bare `AC-8..AC-13` inside `offerFullView` (`:295, :298, :302, :314, :325`) are H2 criteria left unqualified; they are scoped by that function's own `` `[E6.F2.H2]` `` header, which is a defensible reading of the AC, but it is a slightly weaker one than the AC's letter. `should` priority, no behaviour |

**Summary: 21 / 21 pass.** No AC is unmet.

## Review Ledger As Evidence

Digest read: mode `4r`, target `59b806e..d8ad970`, `confirmed: 4 · suspect: 0 · escalated: 0 · info: 14`, **open_severe_findings: 0**, verdict `pass_with_warnings`, fix budget **2 of 2 used**.

QA did not take the `verified` marks on trust. Each was re-checked against the shipped tree:

| id | Sev | Ledger status | QA's independent check |
|---|---|---|---|
| R1-001 | CRITICAL | verified | **Confirmed closed.** Probe: engine-derived finding text in the digest carries no member of N; `render.ts` routes it through `toSafeLines` once, before matching |
| R1-002 | CRITICAL | verified | **Confirmed closed.** Probe: hostile fixture through `formatFullView` — no OSC/CSI/BEL/DEL/8-bit-CSI/LS/PS survives, under both palettes |
| R1-003 | CRITICAL | verified | **Confirmed closed.** Probe: interior CR / U+2028 / U+2029 / ESC findings are counted *and* listed; layer 2 (`([^\n]*)`) present and separately asserted |
| R2-001 | WARNING | verified | **Confirmed closed** by reading `tui-flow.ts` (see AC-21, with one nit) |
| R3-001 | WARNING | verified | **Confirmed closed** by `palette-wiring.test.ts`, all three call sites, deductive mutation |
| R3-002 | WARNING | verified | **Confirmed closed** by the `MARKED` rewrite; the underlying tautology (`TUI_PALETTE.good === String` locally) was itself reproduced by QA |
| RR1-001 | CRITICAL | verified | **Confirmed closed** by QA's own 11,765-combination sweep + 615 structural cases + 200k fuzz: 0 lost, 0 regressed, 0 widened |
| RR2-001 | WARNING | verified | **Confirmed closed**: `result.test.ts:1195-1218` now asserts the AC-12(c) positive against `MARKED` and labels the residual comparison `— the ENV-DEPENDENT case` |

Info rows never selected for a fix round (R2-002/003/004/005, R3-003, R4-001/002/003, RR3-001/002) and named risks `-011` / `-012` / `-013` were confirmed correctly classified and are **not re-litigated** here. One of them, R4-002 (post-run `confirm` never settles on stdin EOF → exit 13 with a raw Node warning over the digest), is the residual with the largest user-visible footprint and is the natural candidate for the E7 dogfooding story; recorded, not reopened.

## The Vacuity Question

This change produced the same defect species **seven times**: an assertion whose input cannot violate the property it claims. QA was asked whether an eighth instance survives in the shipped suite.

**Method.** Rather than re-reading 2,200 lines of test code hoping to spot one, QA (1) scanned all eleven TUI suites for the structural signatures of the species — an expected value computed by the same production function as the actual, unpaired negatives, `toBeDefined`/`toBeTruthy`/`not.toThrow` — and (2) rebuilt the properties from the AC prose and executed them against the shipped modules directly, so that a vacuous test could not hide a real defect from QA even if QA failed to notice the test.

**Findings.**

1. **One structurally tautological assertion pair remains** — `result.test.ts:1218` and `full-view.test.ts:570-574`, comparing `stripAnsi(f(x, TUI_PALETTE))` against `f(x, PLAIN_PALETTE)`. Under the mandated local gate (`CI`/`FORCE_COLOR` unset) `TUI_PALETTE` *is* the identity, so these are `x === x` — the exact species. **But it is disclosed, not hidden**: both carry the literal name `— the ENV-DEPENDENT case` and a comment stating they prove nothing where colour is off, and both become real assertions under `FORCE_COLOR=1`, which QA verified genuinely enables SGR and genuinely reaches the vitest worker, and which QA ran (646/646). A labelled, environment-compensated tautology is categorically different from the seven, every one of which claimed to prove something it could not.
2. **One self-referential oracle** — `full-view.test.ts:195-210`'s `expectedDigest()` computes the expected flow output by calling `formatResultDigest` itself. This is *not* vacuous (it pins the flow's data-wiring and line ordering) but it means no flow-level test pins the digest's literal copy; that pinning lives only in the pure suites. Deliberate layering, recorded as a `low` finding so a future reader does not mistake a green flow test for copy coverage.
3. **No hidden eighth instance found.** The scan surfaced exactly one `toBeDefined()` (paired in the same case with a full `toEqual`) and no unpaired negative in the new suites. More importantly, the suites written in the two fix rounds are *actively* anti-vacuous in a way the earlier ones were not: `engine-text.test.ts` restates N independently of the module under test and guards that its own hostile fixture is hostile; `findings.test.ts` re-implements the pre-round matcher and asserts a **differential** over a 72-line corpus, with an explicit non-vacuity assertion that the corpus contains 18 real negatives, plus corpus-size guards (`toHaveLength(9)`, `(5)`, `(45)`) whose stated purpose is that "a later edit could shrink the table and every case below would still pass, which is how this defect shipped."

**How much confidence do the 995 green tests actually carry?** Materially more than a raw count suggests, but not uniformly.

- **High** for the pure renderers and the neutralisation layer. These are pure string functions, tested against injected palettes with literal expectations, independently restated contracts and differential oracles — and QA's own out-of-band probes reproduce every property without touching the suite. This is where the two fix rounds concentrated, and the suite there is now stronger than the code it guards.
- **Moderate** for the flow. The scripted-prompter doubles prove prompt counts, ordering, exit codes and data wiring rigorously, but the oracle for rendered content is the renderer itself, and colour wiring is proved only by one mocked file.
- **Low — structurally, not repairably here** for anything at process level. The TUI is tested with no real TTY, no real stdin and no real `picocolors` ambient decision; the `e2e` project is empty. That is deliberate and is `[E7.F1.H1]`'s scope, **not this change's debt** — but it is also exactly where the one behavioural residual (R4-002, stdin EOF) lives, so the honest statement is that the green suite says nothing about how this feature behaves against a real terminal.

The decisive point: in this change **every** vacuity was caught by deliberate mutation-verification or a fresh reviewer, and **never** by the suite going green. QA therefore treated the 995 as a necessary condition and re-derived the load-bearing properties independently. Both methods agree.

## Findings

| id | Severity | Finding | Disposition |
|---|---|---|---|
| QA-F-01 | low | `full-view.test.ts:195-210`'s `expectedDigest()` uses the production renderer as its own oracle, so flow tests cannot detect a change in the digest's literal copy. The pure suites do pin it. | Record only. Not worth a fix round; the layering is sound and the budget is exhausted |
| QA-F-02 | low | AC-21 nit: five bare `AC-n` citations inside `offerFullView` (`tui-flow.ts:295, 298, 302, 314, 325`) denote H2 criteria and are qualified only by the enclosing function's header, not individually. | Record only. `should`-priority AC, no behaviour, no test |
| QA-F-03 | low | The `— the ENV-DEPENDENT case` assertions are tautologies under the local gate and carry weight only in the `FORCE_COLOR=1` / CI run. Labelled and compensated, but the local `npm test` alone does not exercise them. | Accepted as designed. Worth a line in the PR description so a reader does not over-read the local run |
| QA-F-04 | medium | **Process-level behaviour of the post-run prompt is untested by construction** — no real TTY, no real stdin, `e2e` project empty. R4-002 (stdin EOF → exit 13, marked `worsened` by this change) sits precisely in that blind spot and is accepted as `info`. | **Not this change's debt** (`[E7.F1.H1]` owns the smoke suite). Carried forward as an explicit E7 input rather than closed silently |

No `high` finding. No BLOCKER/CRITICAL. Nothing here justifies a third fix round, and none is available.

## Verdict

**`pass_with_warnings`.**

The change is functionally complete and correct on the evidence: 21 of 21 acceptance criteria independently re-verified, both gates green with numbers QA measured itself, zero open severe findings, and every one of the ledger's eight `verified` closures independently reproduced — including the two that were introduced by this change's own fix rounds. The neutralisation layer is, on QA's own sweep of 11,765 combinations and 200,000 fuzz cases, sound at every structural position, with no widening of the heuristic.

It is **not** a clean `pass`, for reasons of evidence rather than doubt about the code:

1. The review ledger's own verdict is `pass_with_warnings` with fourteen `info` rows and three named accepted risks still live in the shipped tree. QA was directed to consume the ledger as evidence; nothing QA found removes those warnings, so upgrading the verdict would assert something the artifacts contradict.
2. QA-F-04 is a real, named validation gap: the story's headline behavioural change — the process now *waits for input* after a finished review — has no test at process level anywhere in the repo, and the one accepted `info` row with a user-visible failure mode lives exactly there.
3. The fix budget is exhausted. That is the correct state for this change, but it means the last remaining judgement — "is this acceptable to ship as-is, with these named residuals" — is a human acceptance decision, not a QA one.

**`lifecycle_status` is NOT set to `completed`.** Per the skill's closeout rules, `final` + `pass_with_warnings` keeps the change in `reviewing` and raises a `final_review` checkpoint for explicit user acceptance. QA holds the authority to complete and is deliberately declining to exercise it on a `pass_with_warnings` — not because the work is unfinished, but because closing a change whose review history is "the same defect species seven times, twice introduced by its own fixes, budget now exhausted" should be a decision a person makes with the residuals in front of them. Nothing further should be *fixed* in this change; what remains is acceptance.

## Next Action

1. Present this report and the four residual findings to the user at a `final_review` checkpoint.
2. On acceptance: commit the change, open the PR for `[E6.F2.H2]` (`Closes #39`), and record in the description the three reviewed supersessions (H1 AC-7 via AC-15; `result.test.ts:900`; `findings.test.ts:223`) plus QA-F-03's caveat about the local run.
3. Carry QA-F-04 and R4-002 into `[E7.F1.H1]` as named inputs to the E2E smoke story.
4. E6 has no further required stories: `[E6.F2.H3]` is ⚪ and skipped under workflow contract rule 7.

## Review History

| Run | Mode | Range | Verdict | Note |
|---|---|---|---|---|
| 1 | `stage` | `b0a3a04..442e705` (S1–S4) | `pass_with_warnings` | QA-S4-01 (AC-6, multi-line failure + vacuous guard test) → fixed in S5 under D9 |
| 2 | `final` | `59b806e..31b7fb4` (whole change) | `pass_with_warnings` | This report. 21/21 ACs, gates measured, ledger reproduced, four `low`/`medium` residuals, completion withheld pending user acceptance |
