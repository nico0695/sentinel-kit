# QA Report

## Closeout Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- mode: **final** (re-run, review seq 2)
- verdict: **pass**
- lifecycle effect: **closes the change** — `lifecycle_status: completed`. The sole warning from review seq 1 (QA-1) was resolved by Amendment 1 + ST-4; no finding remains open, and no `final_review` decision is outstanding.

## Review History

| Seq | Mode | Reviewed Against | Verdict | Reported At | Outcome |
|---|---|---|---|---|---|
| 1 | final | 9-AC spec, target `30c90aa` | pass_with_warnings | 2026-08-22T02:00:00Z | One `medium` finding (QA-1) raised at `cp-final-review`; two `low` observations. Superseded by seq 2, not deleted — its findings drove Amendment 1. |
| 2 | final | 10-AC amended spec, current tree | **pass** | 2026-08-22T02:55:00Z | QA-1 closed; no new findings. |

Seq 1's full findings text is preserved in git history (`30c90aa`) and its substance is carried forward in the AC table and Findings section below. This report describes the current state of the change.

## Scope Reviewed

The full implemented change across ST-1..ST-4, against `spec.md` **as amended** (10 ACs: the original 9 plus AC-10 from Amendment 1), `design.md`, `plan.md` (now 4 stages), the full `execution-log.md`, and `review-ledger.md`.

## What This Re-Run Verified Independently

**Production code is byte-identical to review seq 1's target.** `git diff --stat 30c90aa..HEAD -- src/` returns exactly one file — `__test__/resolve-engine.test.ts`, +32 lines. Every production-code verification from seq 1 (the three mutations on precedence/validation/echo, the exhaustive AC-6 grep, the AC-9 direct diff read, the echo-across-terminal-states probe) therefore still holds without re-execution. This is stated rather than quietly re-run: re-performing identical checks on identical bytes would manufacture the appearance of independence without adding evidence.

New checks run for this seq:

- `npm run check`: `Checked 93 files in 79ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (67 modules, 129 dependencies cruised)`.
- `npm test`: `Test Files 19 passed (19)` / `Tests 295 passed (295)` (293 + AC-10's 2).
- **A novel mutation, deliberately different from the one ST-4 already ran** (which mutated the empty-string branch): mislabelled the reported cascade level (`"run"` → `"repo"` in the run branch). Result: **2 failed / 7 passed** — the AC-5 test *and* the new AC-10 run-level test both fail. This proves the AC-10 tests pin the reported `level`, not merely that *something* throws, which ST-4's own mutation did not establish. Reverted; `git diff` on `resolve-engine.ts` empty.
- **Amendment coherence audit**: `grep -rn "non-empty"` across the change directory. Every surviving hit in `spec.md` is either AC-1's own explicit `was "provided and non-empty"` provenance note or the Amendment 1 narrative describing what it replaced. **No live requirement anywhere still asserts "non-empty".** Remaining hits in `qa-report.md` (seq 1), `review-ledger.md`, `execution-log.md`, and `state.yaml` are historical records, correct to retain verbatim.
- **Spec internal coherence**: read the amended Expected Behavior table and AC-1..AC-3 together. AC-1's "present (not `undefined`)" makes AC-2/AC-3's "absent" unambiguous, and the new `""` row agrees with both AC-1 and AC-10. No contradiction introduced by the amendment.
- Final story diff: 8 files, 235 insertions / 5 deletions, all under `src/core/` — no adapter, no `src/main/`.

## Review Ledger Consumption

`review-ledger.md` (standard tier, one `reliability` lens, target `30c90aa`): verdict `pass_with_warnings`, **`open_severe_findings: 0`**, 2 `info` rows, 0 fix rounds.

- **R3-001** (`WARNING`, `info`) — the empty-string contract mismatch. **Addressed by Amendment 1 + ST-4**, in both halves the lens identified: the spec now says what the code does, and the behavior is pinned by tests in both directions.
- **R3-002** (`SUGGESTION`, `info`) — the `exactOptionalPropertyTypes` call-site friction. Confirmed during seq 1 as **convention-consistent, not a defect** (zero optional props in `src/core/**` use explicit `| undefined`; 14 conditional-spread call sites already exist). No action needed.

The ledger itself is deliberately **not** amended. It is frozen to target `30c90aa`, where the old spec wording genuinely was in effect, so its claim text remains accurate for its target. Rewriting a frozen ledger to reflect later fixes would destroy the audit trail it exists to provide.

## AC Coverage Summary

| ACs | Status |
|---|---|
| AC-1 (run override wins when **present**) | pass — as amended; precedence mutation-verified in seq 1 |
| AC-2, AC-3 (repo-wins, global-fallback) | pass — mutation-verified |
| AC-4, AC-5 (unknown-name rejection, message + `level`) | pass — the novel level-mislabel mutation in this seq strengthens AC-5's evidence specifically |
| AC-6 (single `EngineNameSchema` definition) | pass — exhaustively grep-verified in seq 1; unchanged since |
| AC-7, AC-8 (echo present / key absent) | pass — verified in seq 1 across all terminal states, not just the happy path |
| AC-9 (`run-review.ts` pipeline unchanged) | pass — direct diff read in seq 1; file untouched since |
| **AC-10** (Amendment 1: empty override rejected, not cascaded) | **pass** — 2 dedicated tests at both overridable levels, non-vacuity established by two *different* mutations (ST-4's cascade-past-empty, and this seq's level-mislabel) |

10 of 10 ACs implemented and test-pinned. No AC is manual-only — unlike `[E4.F2.H1]`/`[E4.F2.H2]`, this story has no permanently-open manual-verification gap.

## Findings

**None.** No new finding surfaced in this re-run, and no finding from seq 1 or the review ledger remains open:

| Prior Finding | Status |
|---|---|
| QA-1 (seq 1, `medium`) | **closed** — Amendment 1 (`dec-002`) reworded AC-1 and the Scope Boundary; AC-10 + 2 tests closed the coverage half |
| QA-2 (seq 1, `low`) — echo tested only on the `ok` path | **closed as not-a-defect** — verified in seq 1 that the echo is correct on `validation-failed` too; the single unconditional spread makes it uniform by construction |
| QA-3 (seq 1, `low`) — no code review had run | **closed** — a standard-tier 4R review has since run (`review-ledger.md`), which is what produced R3-001/R3-002 |
| R3-001, R3-002 (ledger, `info`) | addressed / contextualized as above; neither was ever blocking |

## Verdict

**pass.** The change is complete and honest: 10 of 10 ACs implemented and pinned by tests, all quality gates green (`npm run check`, `npm test` 295/295), the diff exactly 8 core-only files with zero adapter or composition-root spill, architecture guards clean at 67 modules / 129 dependencies, and the one contract discrepancy two independent review passes found has been closed at its root — the spec and the code now agree, and a test prevents either from drifting again.

Worth recording plainly: this reached a clean `pass` on the second attempt, not the first. Seq 1's `pass_with_warnings` was correct at the time and did real work — it, and the 4R review that independently confirmed it, are why AC-10 exists at all.

## Next Action

`final` + `pass` → the change closes: `lifecycle_status: completed`, `next_action.kind: complete`. No `final_review` checkpoint is outstanding (`cp-final-review` was resolved by `dec-002`).

Remaining work is outside this change:

1. **Offer the PR** — `[E4.F2.H3] Cascading engine resolution`, `Closes #30`. Per CLAUDE.md, do not open it unless the user explicitly asks; never merge, never push `main`.
2. **`history-log`** — the mandatory session audit entry must be written before closing the session (CLAUDE.md, Audit history).
3. **Downstream, not now** — `resolveEngine` is intentionally not wired into any composition root; that is `E6.F1`, which depends on this story. The `E6.F1` author should read `review-ledger.md`'s R3-002 first: the conditional-spread call shape is required by this codebase's `exactOptionalPropertyTypes` convention.
