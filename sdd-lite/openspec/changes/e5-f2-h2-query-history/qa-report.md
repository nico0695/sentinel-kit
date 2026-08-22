# QA Report

## Closeout Digest

- change_name: e5-f2-h2-query-history
- review_mode: final
- reviewed_scope: full-change (ST-1..ST-5)
- verdict: pass
- blocking_findings_digest: none — 0 open severe items in review-ledger.md, 0 failing checks
- residual_risk_digest: 4 non-blocking `info` findings in review-ledger.md (get()/list() decomposition suggestions, unfiltered stray files in validations/, >999-entry lexicographic sort order) — real but narrow, recorded as optional follow-up, not required for this story
- next_action_digest: change eligible for `completed`; recommend opening the PR (Closes #34) on explicit user instruction, per CLAUDE.md's PR-creation gate

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- review_mode: final
- reviewed_scope: full-change
- target_stage_id: n/a (full change)
- lifecycle_status_before_review: reviewing
- lifecycle_status_after_review: completed
- code_touched: no (QA is read-only; ST-1..ST-5 already applied and committed)
- verdict: pass
- completion_eligible: true
- final_review_checkpoint_id: n/a — clean pass, no closeout decision needed
- final_review_decision_id: n/a
- reported_at: "2026-08-22T23:10:00Z"

## Review History

| Review Id | Mode | Reviewed Scope | Verdict | Reported At | Next Action |
|---|---|---|---|---|---|
| qa-1 | final | full-change | pass | "2026-08-22T23:10:00Z" | complete |

## Review Context

- proposal_spec_reviewed: yes — proposal.md, spec.md (revision 2, 15 ACs, D1..D9)
- design_plan_reviewed: yes — design.md (6 decisions, AC coverage map), plan.md (ST-1..ST-5, ST-5 the fix stage)
- execution_log_reviewed: yes — all 5 stage entries, including both mutation-testing findings from ST-3 (the discovered readdir-order gap, closed by ST-4) and both fix-stage mutation proofs (ST-5)
- previous_qa_report_reviewed: n/a (first QA pass for this change)
- changed_scope_reviewed: yes — full `git diff --stat origin/main...HEAD -- src/`, 14 files
- quality_commands_considered: `npm run check` (biome+tsc+depcruise), `npm test` (vitest) — both re-run fresh for this review, not trusted from execution-log.md alone
- review_trigger: ST-5 fix stage complete, review-ledger.md verdict `pass_with_warnings` with 0 open severe findings
- review_notes: Re-verified independently rather than trusting cached results: fresh `npm run check` and `npm test` (362/362); AC-15 via a fresh `git diff --stat -- src/core/run` (empty); the full 14-file story diff scope; AC-17 via a fresh `process.env` grep scoped to production files.

## Review Evidence

- review_ledger_path: sdd-lite/openspec/changes/e5-f2-h2-query-history/review-ledger.md
- review_mode: 4r
- ledger_verdict: pass_with_warnings
- ledger_counts: confirmed=0 suspect=0 escalated=0 info=4
- open_severe_findings: 0
- ledger_findings_reused_instead_of_reanalyzed: true
- notes: Both CRITICAL findings (R3-001, R4-001) were fixed in ST-5 and independently proven by mutation testing (each fix reverted, its dedicated regression test failed for the exact claimed reason, fix re-applied, suite re-verified clean) — consumed as settled evidence, not re-derived here. The 4 `info` rows (R2-001, R2-002, R3-002, R3-003) are non-blocking per the severity floor and are carried forward as optional follow-up rather than requiring action in this change.

## Validation Plan And Results

| Check Id | Category | Source | Planned Check | Outcome | Notes |
|---|---|---|---|---|---|
| V-1 | command | config | `npm run check` (biome + tsc + depcruise) | passed | Fresh run: 106 files checked, 0 lint/format errors, 0 type errors, 0 dependency-cruiser violations (76 modules, 152 deps) |
| V-2 | command | config | `npm test` (vitest) | passed | Fresh run: 23 test files, 362/362 tests passed |
| V-3 | repo-state | spec (AC-15) | `git diff --stat -- src/core/run` is empty | passed | Empty output — confirmed for the whole story across all 5 stages |
| V-4 | repo-state | design | Full story diff confined to `src/core/history/**` and `src/adapters/driven/storage/**` | passed | `git diff --stat origin/main...HEAD -- src/` lists exactly 14 files, all within those two trees; no `src/main/` file, no adapter other than `storage` |
| V-5 | command | spec (AC-17) | `grep -rn "process\.env"` across production files in `src/core/history` and `src/adapters/driven/storage` | passed | Zero matches, re-run fresh (not trusted from execution-log.md) |
| V-6 | artifact | execution-log | ST-1..ST-5 each independently proved non-vacuity by mutation | passed | 7 mutation proofs across the 5 stages (drift guard, classifyRunDirEntry, get() usage reconstruction, list() merge-order, list() sort-order discovery, R3-001 fix, R4-001 fix) — all reverted-and-restored cleanly |
| V-7 | artifact | review-ledger | 0 open severe findings | passed | Both CRITICALs `status: fixed`; consumed as evidence per Review Evidence section above |
| V-8 | behavior | spec (AC-1..AC-15) | Spot-check each AC against its assigned test(s) | passed | See AC Coverage Check below |

### AC Coverage Check (spec.md revision 2, 15 ACs)

| AC | Covered By | Verified |
|---|---|---|
| AC-1 (ascending order) | `RunStore.contract.ts` | yes |
| AC-2 (readdir-order independence) | `run-store-fs.test.ts` (mocked reversed readdir) | yes — the real proof, added in ST-4 after ST-3's mutation testing showed the contract-suite version was unprovable on this filesystem |
| AC-3 (empty repo → `[]`) | contract + fs test | yes |
| AC-4 (partial inclusion, final-wins dedupe) | `run-store-fs.test.ts` | yes |
| AC-5 (minimal partial shape) | `run-store-fs.test.ts` | yes |
| AC-6 (4 corrupt cases) | `run-store-fs.test.ts` | yes |
| AC-7 (mixed listing, none affecting others) | `run-store-fs.test.ts`; **also now covers the raw-fs-error case** after the ST-5 R4-001 fix and its regression test | yes |
| AC-8 (ok-entry field mapping) | contract | yes |
| AC-9 (get round-trip, bodies, diff.warnings default) | contract | yes |
| AC-10 (unknown id → `RunNotFoundError`) | contract | yes |
| AC-11 (get on partial/corrupt) | `run-store-fs.test.ts`; **strengthened** by the ST-5 R3-001 fix and regression test for the present-but-metadata-less case | yes |
| AC-12 (stray entries ignored) | `run-store-fs.test.ts` | yes |
| AC-13 (path-traversal rejection, pre-fs) | `run-store-fs.test.ts` | yes |
| AC-14 (raw fs failure translation) | `run-store-fs.test.ts` (top-level `readdir` EACCES still surfaces `RunPersistenceError`; per-entry raw failures now degrade gracefully per the ST-5 fix, reconciling the AC-7/AC-14 tension the review surfaced) | yes |
| AC-15 (architecture guards, empty `src/core/run` diff) | V-3, V-4, depcruise | yes |

## Findings

| Finding Id | Severity | Summary | Scope | Blocking | Recommended Action |
|---|---|---|---|---|---|
| QA-001 | low | 4 non-blocking `info` findings remain in review-ledger.md (get()/list() closure decomposition ×2, unfiltered stray files in `validations/`, lexicographic vs numeric sort past 999 entries) | full-change | no | Optional follow-up for a future story; not required for `[E5.F2.H2]`'s closure. Flag to the user in the closeout summary. |
| QA-002 | low | This QA pass, and the code review before it, both caught real `jsonschema`-level defects in `state.yaml` that a prior hand-rolled (non-jsonschema) check had missed across this session and the prior `[E5.F2.H1]` change — worth a process note, not a code defect | process | no | Recorded in the audit history entry; no change needed to this story's code |

## Evidence Log

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` — 2026-08-22T23:05Z | 106 files, 0 errors, depcruise 76 modules/152 deps clean |
| command | `npm test` — 2026-08-22T23:06Z | 362/362 passed, 23 test files |
| command | `git diff --stat -- src/core/run` | empty |
| command | `git diff --stat origin/main...HEAD -- src/` | 14 files, matches plan.md's ST-1..ST-5 scope exactly |
| command | `grep -rn "process\.env" src/core/history src/adapters/driven/storage --include="*.ts" \| grep -v __test__` | zero matches |
| artifact | review-ledger.md | verdict `pass_with_warnings`, 0 open severe, 4 info, both CRITICALs `status: fixed` with mutation-proof notes |
| artifact | execution-log.md | 5 stage entries, all quick checks green, 7 mutation proofs total |

## Verdict Rationale

- `pass`: all 15 ACs verified against their tests; `npm run check` and `npm test` both fresh-green; AC-15's empty `src/core/run` diff and full story-diff scope both independently re-confirmed; AC-17 re-confirmed by a fresh grep; review-ledger.md consumed as evidence with 0 open severe findings (both CRITICALs fixed and independently mutation-proven in ST-5, not merely marked fixed on trust). The 4 remaining `info` findings are real but narrow robustness/readability observations that the severity floor correctly keeps non-blocking — they do not weaken confidence in this story's correctness, only flag optional future polish.
- This is a clean `pass`, not `pass_with_warnings`: the QA verdict scale answers "is the change adequately supported by the evidence with no blocking issue," and every blocking item from the code review was resolved and independently verified before this review started. Carrying forward non-blocking `info` rows from the ledger does not itself demote a QA verdict — CLAUDE.md's completion criteria are about ACs and architecture guards holding, which they do.

## Mode-Specific Closeout Notes

- `final` mode, verdict `pass` → `lifecycle_status: completed` is applied.

## Next Recommended Action

- Change is complete. Per workflow contract rule 6, `[E5.F2.H2]` is one story within the `E5` milestone; `E5.F1.H1`/`E5.F1.H2` remain untouched and `E5.F2.H3` is ⚪ optional — the epic is not yet fully in open/merged PRs, so the epic-summary-and-STOP rule does not trigger yet.
- Write the mandatory `history-log` entry before closing this session.
- Offer to open the PR (`Closes #34`) only on explicit user instruction, per CLAUDE.md's PR-creation gate — do not open one proactively.

## State Sync Notes

- `state.yaml`'s `qa_summary`, `lifecycle_status`, `open_risks`, and `next_action` updated to reflect this pass; full findings/evidence stay in this report only.

## Budget Notes

- Final review for a 5-stage change (4 planned + 1 fix stage), 1362 changed lines total. Comparable in scope to `[E5.F2.H1]`'s final QA, with one additional fix-round verification layer this story's review surfaced.
