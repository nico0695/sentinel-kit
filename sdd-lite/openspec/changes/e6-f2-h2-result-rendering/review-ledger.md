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
- counts: `confirmed: 4` · `suspect: 0` · `escalated: 0` · `info: 12`
- open_severe_findings: **1** (RR1-001, introduced BY fix round 1; the original three are `verified`)
- verdict: **`not_reached`** — one open severe finding, fix budget **1 of 2 used**, one round remains
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
| R4-001 | `tui/tui-flow.ts:278` | WARNING | info | The unguarded `await offerFullView(...)` lets a throw from the prompt seam escape into the catch-all, turning a completed+persisted review into exit 1 — violating the module's own documented Property 5 | introduced |
| R4-002 | `tui/tui-flow.ts:319` (sites `:253`, `:278`) | WARNING | info | The post-run `confirm` never settles on stdin EOF, so the process exits 13 with a raw Node warning dumped over the digest, losing the intended exit code | worsened |
| R4-003 | `tui/tui-flow.ts:253` + `:320` | SUGGESTION | info | On the persist-failure branch the in-memory markdown is the only copy in existence, yet a decline discards it irrecoverably with no last-copy signal | introduced |
| **RR1-001** | `tui/findings.ts:72` + `tui/render.ts:296` | **CRITICAL** | **open** | A `[SEV: …]` finding whose marker is immediately preceded by a **leading** U+000B, U+000C, U+000D, U+2028 or U+2029 was recognised before fix round 1 and is now silently deleted from BOTH the counts and the listed blockers — R1-003's own failure mode in a new position | **introduced by fix round 1** |
| RR2-001 | `tui/__test__/result.test.ts:1177-1198` | WARNING | info | The new AC-12(c) case's two `TUI_PALETTE` assertions are byte-identical duplicates of the `PLAIN_PALETTE` ones under the mandated local gate, and its doc-comment claims to assert the colour-after-neutralisation ordering, which it cannot — the sixth instance of this change's recurring vacuity species, and unlabelled where its repaired sibling is labelled `— the ENV-DEPENDENT case` | introduced by fix round 1 |

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

- rounds used: **1 of 2** — one round remains, and there is no third
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
