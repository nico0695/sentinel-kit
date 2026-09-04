# Review Ledger — e6-f2-h2-result-rendering

## Review Digest

- mode: **4r** (full-4r tier)
- target (immutable): `59b806e..d8ad970` on `claude/project-post-merge-analysis-a4tcbl`, tree clean at `d8ad970`
- scope: `src/adapters/driving/tui/**`, `package.json` (9 files, +1969/−79)
- triage rationale: hot-path driving adapter carrying the product's user-facing output surface and the
  exit-code contract; 1968 changed source lines, far above the 400-line full-4r threshold
- lenses run: R1 Risk, R2 Readability, R3 Reliability, R4 Resilience — one sweep each, all four returned
- refuter: **not run** — every severe finding carries deterministic evidence (executed probes against the
  target's own modules, plus independent orchestrator reproduction). Per the ledger contract, deterministic
  severe findings count as `confirmed` without a refuter pass. The one refutable inferential claim was
  refuted by a lens itself (see R4-001 / R3 cross-lens note).
- counts: `confirmed: 4` · `suspect: 0` · `escalated: 0` · `info: 14`
- open_severe_findings: **0** — all four confirmed severe findings are `verified`
- verdict: **`pass_with_warnings`** — no open severe findings; only `info` rows remain. Fix budget **2 of 2 used**
- reported_at: 2026-08-29 (lineage), scoped re-review 2026-08-30

## Findings

| id | location | severity | status | claim | causal |
|---|---|---|---|---|---|
| R1-001 | `tui/render.ts:222` | CRITICAL | **verified** | Attacker-influenceable engine text is printed into sentinel's own result digest with ANSI/OSC control sequences intact, unconditionally and before any opt-in prompt | introduced |
| R1-002 | `tui/render.ts:295` | CRITICAL | **verified** | `formatFullView` emits engine output byte-verbatim, so a hostile review can drive the terminal (OSC 52 clipboard write, OSC 0 title, cursor/erase) | introduced |
| R1-003 | `tui/findings.ts:40` | CRITICAL | **verified** (interior position only — see RR1-001) | An interior `\r`, U+2028 or U+2029 makes `FINDING_LINE` fail, silently dropping that finding from both the digest counts and the listed blockers, with no degradation notice | introduced |
| R2-001 | `tui/tui-flow.ts:220,231,252,259` | WARNING | **verified** | Four new comments cite `[E6.F2.H2]` criteria by bare number in a module whose header pins it to H1, and each number already denotes a different, still-referenced H1 criterion | introduced |
| R2-002 | `tui/tui-flow.ts:11` | SUGGESTION | info | Header announces "Four properties are load-bearing" then lists five; the file addresses them by ordinal | introduced |
| R2-003 | `tui/findings.ts:56-58` | SUGGESTION | info | Unreachable `return undefined` branch with no comment saying it is unreachable, in a module that documents every other subtlety | introduced |
| R2-004 | `tui/colors.ts:9-10` | SUGGESTION | info | The header enumerates which files a naive picocolors grep also matches, but S5/S6 added two more prose hits, so the parenthetical is stale | introduced |
| R2-005 | `tui/__test__/result.test.ts:464-477` | SUGGESTION | info | `fixtureMarkdown()` duplicated verbatim into two test files that already share a helper module, and the copies have already drifted cosmetically | introduced |
| R3-001 | `tui/tui-flow.ts:242,272,329` | WARNING | **verified** | Nothing in the 856-test suite distinguishes the flow passing `TUI_PALETTE` from `PLAIN_PALETTE`; AC-14's only user-visible behaviour has no test at either call site | introduced |
| R3-002 | `tui/__test__/full-view.test.ts:429-434,449-460,462-469` | WARNING | **verified** | The six "real palette" assertions are tautologies whenever `CI`/`FORCE_COLOR` are unset — the mandated local gate — because picocolors then binds all four roles to global `String`; the block's own doc-comment claims the opposite | introduced |
| R3-003 | `tui/render.ts:210` + `tui-flow.ts:315` | SUGGESTION | info | For a reachable empty `engineOutput` the digest says "see the full review" and points at an empty `result.md` while the prompt that would show it is suppressed | introduced |
| R4-001 | `tui/tui-flow.ts:278` | WARNING | **fixed (S12)** | The unguarded `await offerFullView(...)` lets a throw from the prompt seam escape into the catch-all, turning a completed+persisted review into exit 1 — violating the module's own documented Property 5. Re-raised by the repo owner's PR #76 review. `io.stdout` is `process.stdout.write`; the reachable failure is a TTY write error (e.g. `EIO` on hangup) or a synchronously-throwing prompter, NOT the piped-stdout/EPIPE scenario first named — a scoped re-review found that scenario architecturally unreachable (the TUI gates on both streams being real TTYs) and that Node does not throw synchronously on EPIPE for pipe writes anyway. Fixed in S12 via `offerFullViewSafely`, a wrapper that cannot reject; the fix and its tests are unaffected since they exercise a synchronous throw, which is the real reachable shape | introduced |
| R4-002 | `tui/tui-flow.ts:319` (sites `:253`, `:278`) | WARNING | info | The post-run `confirm` never settles on stdin EOF, so the process exits 13 with a raw Node warning dumped over the digest, losing the intended exit code | worsened |
| R4-003 | `tui/tui-flow.ts:253` + `:320` | SUGGESTION | info | On the persist-failure branch the in-memory markdown is the only copy in existence, yet a decline discards it irrecoverably with no last-copy signal | introduced |
| **RR1-001** | `tui/findings.ts:72` + `tui/render.ts:296` | **CRITICAL** | **verified** | **WIDENED at round-2 planning, confirmed by orchestrator probe: 45 of 45 combinations (9 structural positions × 5 code points), not the leading position alone.** EVERY `\s` in the matcher is affected — `trim()`, `LIST_OR_QUOTE_PREFIX`'s `\s+`, and the five `\s*` inside `FINDING_LINE` — because each matches a real VT/FF/CR/U+2028/U+2029 but not the printable token that replaces it. A finding carrying one of those five at any of: leading, leading-mixed-with-spaces, before a list marker, after a list marker, inside a quoted bullet, after `[`, before `:`, after `:`, before `]` is silently deleted from BOTH the counts and the listed blockers | **introduced by fix round 1** |
| RR2-001 | `tui/__test__/result.test.ts:1177-1198` | WARNING | **verified** | The new AC-12(c) case's two `TUI_PALETTE` assertions are byte-identical duplicates of the `PLAIN_PALETTE` ones under the mandated local gate, and its doc-comment claims to assert the colour-after-neutralisation ordering, which it cannot — the sixth instance of this change's recurring vacuity species, and unlabelled where its repaired sibling is labelled `— the ENV-DEPENDENT case` | introduced by fix round 1 |

## Corroboration

No refuter pass was needed or run. Evidence disposition per severe finding:

- **R1-003** — reproduced independently by the orchestrator, outside the lens: interior `\r`, U+2028 and
  U+2029 each turn a matching `[SEV: blocker] …` line into `NO MATCH`, while the trailing-`\r` case (the one
  the suite *does* test, `findings.test.ts:131`) still matches. JS `.` excludes all line terminators and `$`
  without `m` matches only end-of-input. Deterministic.
- **R1-001** — structurally confirmed by the orchestrator against the code: `findings.ts:64` carries the line
  remainder as `(match[2] ?? "").trim()` with no control-character handling; `tui-flow.ts:242` and `:272`
  print the digest *before* the prompts at `:253` and `:278` on both branches; `grep` finds no strip or
  sanitize anywhere in the render path. Deterministic.
- **R1-002** — the byte-verbatim property is not merely present, it is **required by AC-12** and asserted by
  the suite. No inference involved; the disagreement is about whether the AC is right.

### Cross-lens interactions worth recording

1. **R4-001 vs R3's refutation.** R4 demonstrated the exit-code flip with a probe injecting a *throwing
   prompter double*. R3 independently chased the same hypothesis and killed it for the shipped seam:
   `@clack/core/dist/index.mjs:246` is `new Promise((t) => …)` with **no reject parameter**, settling only on
   `submit`/`cancel`. Both are right: the contract is undefended in code, but unreachable through the real
   prompter. Recorded as `info`, not severe — an undefended invariant, not a live bug.
2. **R1-003 vs R3 severity disagreement.** R3 found the same bare-`\r` behaviour and judged it "too marginal
   to defend"; R1 raised it CRITICAL with an exploitation trace. R1's framing prevails on evidence: the input
   is attacker-influenceable and the effect is the silent deletion of a *blocker* from a tool whose entire
   purpose is surfacing blockers. Recorded at R1's severity with the disagreement noted.
3. **R2 deferred a behavioural divergence to R3** (`record.failure.message === ""` renders a dangling
   `Failure: stage — ` where `formatTuiErrorLine` substitutes `error.name`). R3 chased it and left it below
   the precision gate. Recorded here as a known residue, no row.

### The premise the three CRITICALs rest on

Engine output is the stdout of an external AI agent reviewing arbitrary, possibly untrusted code. The
adversarial path does **not** require prompt injection: an engine quoting a source line verbatim inside a
finding summary is its normal, intended behaviour, so control bytes present in the reviewed source reach the
renderer by design. The repo already treats engine output as escape-carrying —
`core/run/builtin-verdict-extraction.ts:80` strips ANSI SGR — but that defence is scoped to the verdict
window and was never extended to the rendering path this change created.

## Fix Rounds

- rounds used: **2 of 2 — exhausted.** Both rounds closed what they were convened for; round 1 introduced RR1-001, which round 2 closed
- status: awaiting `review_gate` decision. Per the orchestrator contract, confirmed severe findings never
  trigger direct edits: fixes flow through `sddl-plan` (a fix stage seeded from confirmed ledger ids), then
  `stage_approval`, then `sddl-executor`.
- **R1-002 additionally requires a spec amendment**, not just a fix stage: AC-12 mandates
  `stripAnsi(emitted) === engineOutput.split("\n")`, so any sanitisation of the full view contradicts the
  accepted contract. That routes through `sddl-design`/`sddl-spec` reopening, not through a plan stage alone.

## Review History

(none — this is the first review lineage for this change)


## Fix Round 1 — outcome (scoped re-review, 2026-08-30)

- **Delta reviewed (immutable)**: `d8ad970..ed3ba28`, 10 files, +1543/−79, all under `src/adapters/driving/tui/`.
- **All six selected ids verify.** Each was checked by execution against the real modules rather than by
  reading the new tests: the digest, the full view and the `Failure:` line all now route through
  `engine-text.ts`; every `io.stdout`/`io.stderr` write in the adapter was enumerated and
  `run-review.ts`'s total try/catch traced, confirming no engine bytes reach the two unneutralised
  `stderr` writes.
- **Gates re-run by the reviewer**: `npm run check` clean (107 modules, 254 dependencies), `npm test`
  931/49, adapters 582/28 identical under `NO_COLOR=1` and `FORCE_COLOR=1`, `src/core` diff empty both
  for the delta and across the whole change, statement-level picocolors grep = 1.
- **D14's trailing-CR reasoning was tested, not accepted**: the reviewer verified the premise the design
  never stated — `main/container.ts:96` writes `` `${line}\n` ``, so every emitted line carries its own
  terminator and a dropped final CR could not have been overwritten by anything.

### RR1-001 — the round introduced the defect it was convened to close

Neutralisation was inserted **upstream of** `matchFindingLine`'s `line.trim()`. `design.md:53` recorded
"the trim itself is unchanged" without tracing the consequence. JS `trim()` removes
WhiteSpace ∪ LineTerminator, which contains VT, FF, CR, U+2028 and U+2029 — all five in the neutralised
set N. They are printable `\x0b` / `\x0c` / `\x0d` / `\u2028` / `\u2029` tokens by the time `trim()`
runs, so the `^\[` anchor fails and the finding vanishes from the counts and the list, with **no**
degradation notice when another finding matched.

Reproduced independently by the orchestrator, leading position, old matcher vs shipped pipeline:
VT / FF / CR / U+2028 / U+2029 each go MATCH → NO MATCH. HT is unaffected (excluded from N).

AC-19's layer 2 does **not** cover it: the failure is at the anchor, not in the remainder group. Every
new interior-control test in the delta places the control **inside** the remainder; no case in the delta
puts one before the marker. It violates AC-19's own invariant — "a finding is never silently absent from
both the counts and the list".


## Fix Round 2 — planning correction to RR1-001's extent

The round-2 plan probed rather than reasoned, and the ledger row as first written **understated the
finding**. Reproduced independently by the orchestrator, pre-round matcher vs shipped pipeline:

```
1 lider              | ROTO: VT,FF,CR,LS,PS      6 despues de [       | ROTO: VT,FF,CR,LS,PS
2 lider+espacios     | ROTO: VT,FF,CR,LS,PS      7 antes de :         | ROTO: VT,FF,CR,LS,PS
3 antes de lista     | ROTO: VT,FF,CR,LS,PS      8 despues de :       | ROTO: VT,FF,CR,LS,PS
4 despues de lista   | ROTO: VT,FF,CR,LS,PS      9 antes de ]         | ROTO: VT,FF,CR,LS,PS
5 vineta citada      | ROTO: VT,FF,CR,LS,PS      TOTAL: 45 de 45
```

This matters for the repair's shape, not just its bookkeeping: **fixing only the position the row's
prose named would have left eight instances of the identical silent-deletion mode alive — precisely
how fix round 1 failed**, by closing the interior position and never testing the leading one.

Mechanism chosen (plan decision F4, one of four candidates evaluated against **both** rendering
surfaces): `findings.ts` treats an AC-18 token standing for a whitespace-class code point as the
whitespace it replaced, at every structural position where the matcher used `\s`. This keeps one
pipeline, one input per line, and one predicate shared by the digest and the full view, so the two
surfaces cannot diverge by construction. The rejected alternatives are recorded in `plan.md` with what
each did to both surfaces — notably the obvious "trim raw before neutralising" was measured **not to
fix the defect at all** (it cannot reach a control after a list marker or inside the marker).

### New residue, recorded as a decision rather than left implicit

A **leading** code point of N that is *not* whitespace-class (ESC, NUL, DEL, C1) still prevents
recognition. This is **not** a round-1 regression — the pre-round matcher dropped it identically — and
it sits outside AC-19's letter, which speaks about the remainder. Low reachability: quoted attacker
text lands *after* the marker, and an SGR-coloured line fails to match under every variant because of
the `[31m` itself. Recommended as an E7 hardening story beside `risk-e6f2h2-012`.


## Fix Round 2 — outcome (scoped re-review, `ed3ba28..7e7cf3c`)

**RR1-001 and RR2-001 both CLOSED. No new severe finding. `findings: []`.**

The reviewer did not stop at the nine positions the plan enumerated — the trap that sank round 1, whose
suites covered perfectly the space round 1 had itself defined. It ran an **exhaustive single-insertion
differential**: 15 code points at *every index* of 16 base lines (6 ordinary, 10 exotic — `[ sev : Blocker ]`,
`>>>`, `+ +`, `999)`, tabbed bullets, no separator, empty remainder), comparing the pre-neutralisation
matcher at `d8ad970` on raw input against the shipped pipeline. Then **220,000 multi-insertion fuzz cases**.

- **`LOST: 0` in every run** — the shipped pipeline never loses a line the pre-round matcher recognised.
  Against round 1's tree it is a strict superset: `LOST: 0`, `GAINED: 7,299`.
- **Surface synchronisation holds**: 60,000 fuzz inputs rendered through both surfaces, **0 cases** where
  the digest counted a finding the full view did not tint, or the reverse. That was the hazard raised at
  the round-2 gate, and the mechanism was chosen to make it impossible by construction.
- **0 emitted lines carried any member of N** across 60,000 hostile inputs, through both surfaces plus
  the failure line.
- **AC-3 byte-identical**; both real fixtures unchanged through the shipped pipeline (2 and 0 findings).
- **No ReDoS** from the nested-quantifier composition: linear, 1.66 ms at n = 60,000.
- **No tenth structural position** — the index sweep covers insertion points nobody enumerated (inside
  `sev`, inside the level word, between digits of an ordered marker, after `]`, end-of-line); all are
  consistent between both matchers.
- **No seventh vacuity instance** — six bundled mutants of `findings.ts`, all killed. Notably the
  `only-the-fifth-\s*` mutant is killed by exactly one shipped assertion, which **pins the five-vs-three
  deviation the executor flagged as unpinned**.

### Two info rows added

| id | severity | claim |
|---|---|---|
| RR3-001 | WARNING | `tokenFor`'s deliberate non-injectivity means a **literal** `\x0b` typed in reviewed source is now indistinguishable from a neutralised VT and acts as structural whitespace, manufacturing a finding the pre-round matcher rejected |
| RR3-002 | SUGGESTION | `plan.md` step 4 says `FINDING_LINE` carries three `\s*`; it carries five, and the plan's own position table says five. Code and `execution-log.md` are right; only the plan text disagrees with itself |

**RR3-001 is bounded, and the orchestrator verified the bound rather than accepting it**: a literal at a
*non*-structural position still does not match, and — decisively — plain `[SEV: blocker]` **already**
manufactured a finding before any of this work. The channel is a new spelling of an existing capability,
not a new capability. The error direction is *more* findings, never a deleted one (`LOST: 0` everywhere),
and findings feed no exit code. This is the species `risk-e6f2h2-011` names as a non-goal.
