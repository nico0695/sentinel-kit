# QA Report

## Closeout Digest

- change_name: e5-f1-h1-process-runner
- review_mode: final
- reviewed_scope: full-change (ST-1..ST-5)
- verdict: pass_with_warnings
- blocking_findings_digest: none — 0 open severe items in review-ledger.md, 0 failing checks, all 17 ACs verify
- residual_risk_digest: 6 non-blocking `info` findings in review-ledger.md carried forward (R4-002/risk-007 process-group kill gap is the most notable; R1-001 truncation boundary-equal edge case; three test-coverage gaps — relative-cwd rejection, `env` overlay, default-budget path — plus one readability suggestion). All real but narrow; none block this story's closure.
- next_action_digest: change eligible for `completed`; recommend opening the PR (`Closes #31`) on explicit user instruction, per CLAUDE.md's PR-creation gate

## Summary

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- review_mode: final
- reviewed_scope: full-change
- target_stage_id: n/a (full change)
- lifecycle_status_before_review: reviewing
- lifecycle_status_after_review: completed
- code_touched: no (QA is read-only; ST-1..ST-5 already applied and committed)
- verdict: pass_with_warnings
- completion_eligible: true
- final_review_checkpoint_id: n/a — no closeout decision needed beyond noting residual info-tier items
- final_review_decision_id: n/a
- reported_at: "2026-08-23T03:05:00Z"

## Review History

| Review Id | Mode | Reviewed Scope | Verdict | Reported At | Next Action |
|---|---|---|---|---|---|
| qa-1 | final | full-change | pass_with_warnings | "2026-08-23T03:05:00Z" | complete |

## Review Context

- proposal_spec_reviewed: yes — proposal.md, spec.md (revision 2, 17 ACs, D1/D2/D3)
- design_plan_reviewed: yes — design.md (D-1..D-7), plan.md (ST-1..ST-4 original + ST-5 fix stage)
- execution_log_reviewed: yes — all 5 stage entries, including ST-2's mutation proofs and ST-5's R4-001 mutation proof
- previous_qa_report_reviewed: n/a (first QA pass for this change)
- changed_scope_reviewed: yes — full `git diff --stat <merge-base>..HEAD -- src/`, 11 files, independently re-derived (not trusted from execution-log.md's stated merge-base)
- quality_commands_considered: `npm run check` (biome+tsc+depcruise), `npm test` (vitest) — both re-run fresh for this review
- review_trigger: ST-5 fix stage complete, review-ledger.md verdict `pass_with_warnings` with 0 open severe findings
- review_notes: Every claim in execution-log.md and state.yaml was independently re-derived rather than trusted: fresh `npm run check`/`npm test`, a fresh `git merge-base origin/main HEAD` (confirmed `8c080cb...`, matching the log's stated base), a fresh `git diff --stat` for both AC-15's protected-file scope and the full 11-file story scope, a fresh `grep -rn "execa" src/core/`, and a full independent read of all 7 source files plus all 4 test files (not a diff skim).

## Review Evidence

- review_ledger_path: sdd-lite/openspec/changes/e5-f1-h1-process-runner/review-ledger.md
- review_mode: 4r
- ledger_verdict: pass_with_warnings
- ledger_counts: confirmed=0 suspect=0 escalated=0 info=6
- open_severe_findings: 0
- ledger_findings_reused_instead_of_reanalyzed: true
- notes: R4-001 (the sole CRITICAL) was fixed in ST-5 and independently mutation-proven (fix reverted, the new/extended regression tests failed for the exact claimed reason, fix restored, suite re-verified clean). Consumed as settled evidence, not re-derived — but spot-checked directly: `ExecaLikeResult` in `classify-execa-result.ts` does carry `command`/`args`/`cwd`, `process-runner-exec.ts` does populate all three from `request`, and the dedicated regression test (`classify-execa-result.test.ts:128-155`) asserts `cause` via `toMatchObject` and `message` via `toContain`, not a loose existence check. The 6 `info` rows (R4-002, R1-001, R2-001, R3-001, R3-002, R3-003) are non-blocking per the severity floor and are carried forward as optional follow-up.

## Validation Plan And Results

| Check Id | Category | Source | Planned Check | Outcome | Notes |
|---|---|---|---|---|---|
| V-1 | command | config | `npm run check` (biome + tsc + depcruise) | passed | Fresh run: 114 files checked, 0 lint/format errors, 0 type errors, 0 dependency-cruiser violations (80 modules, 164 deps) |
| V-2 | command | config | `npm test` (vitest) | passed | Fresh run: 26 test files, 401/401 tests passed |
| V-3 | repo-state | spec (AC-15) | `git diff --stat <merge-base>..HEAD -- src/core/run/run-review.ts src/adapters/driven/git src/adapters/driven/engines` is empty | passed | Empty output. Merge-base independently re-derived via `git merge-base origin/main HEAD` = `8c080cb2112382dbd04c3074c6c2ff7b54beab57`, matching execution-log.md's stated base rather than trusted from it |
| V-4 | repo-state | spec (AC-15) | `grep -rn "execa" src/core/` shows only doc-comment mentions, no imports | passed | 2 matches, both prose in doc comments (`index.ts` header, `process-runner.ts` field doc) — zero import statements |
| V-5 | repo-state | design | Full story diff confined to `src/core/run/{ports/process-runner.ts,process-run-request.ts,run-errors.ts,index.ts,__test__/process-run-request.test.ts}` and `src/adapters/driven/exec/**` | passed | `git diff --stat <merge-base>..HEAD -- src/` lists exactly 11 files (997 insertions, 3 deletions), all within those two trees; no `src/main/` file, no adapter other than `exec` |
| V-6 | repo-state | workflow contract | Branch is `claude/e5-f1-h1-process-runner`; commits are conventional and story-scoped | passed | `git branch --show-current` confirms; `git log` shows 11 commits, all `[E5.F1.H1]`-tagged, conventional-commit types (`docs`, `feat`, `test`, `fix`), no stray commits |
| V-7 | repo-state | hygiene | No `TODO`/`FIXME`/`XXX` in the diff; no `.skip`/`.todo` tests | passed | Both greps empty |
| V-8 | artifact | review-ledger | 0 open severe findings | passed | R4-001 `status: fixed`, mutation-proven; spot-checked directly (see Review Evidence) |
| V-9 | behavior | spec (AC-1..AC-17) | Verify each AC against its actual source and test, by direct read (not trusting execution-log.md) | passed | See AC Coverage Check below |

### AC Coverage Check (spec.md revision 2, 17 ACs)

| AC | Covered By | Verified |
|---|---|---|
| AC-1 (real reaping, load-bearing) | `process-runner-exec.test.ts:44-70` — `SIGTERM`-trapping child, pid parsed from stdout, `waitUntil` polls `process.kill(pid, 0)` for `ESRCH` | yes |
| AC-2 (resolves with `timedOut: true`, output preserved) | `process-runner-exec.test.ts:86-96` (real) + `classify-execa-result.test.ts:208-228` (unit, AC-17 overlap) | yes |
| AC-3 (no false positive) | `process-runner-exec.test.ts:72-84`; `classify-execa-result.test.ts:230-249` (signal before budget elapses → `timedOut: false`) | yes |
| AC-4 (byte-exact stdout incl. trailing newline) | `process-runner-exec.test.ts:99-111` — asserts `"a\n\n"` exactly; `stripFinalNewline: false` present in the pinned option bag (`process-runner-exec.ts:69`) | yes |
| AC-5 (stderr separate, never merged) | `process-runner-exec.test.ts:113-131` — cross-checked no bleed either direction | yes |
| AC-6 (per-budget truncation, resolves not fails) | `classify-execa-result.test.ts:157-206` — stdout-only, stderr-only, both-overflow cases | yes |
| AC-7 (per-stream independence, not global `isMaxBuffer`) | Same block; `classify-execa-result.ts:74-75` derives each flag independently by length comparison, never passes `isMaxBuffer` straight through | yes |
| AC-8 (exit code, zero and non-zero) | `classify-execa-result.test.ts:12-31,33-52`; `process-runner-exec.test.ts:72-84` (0), `ProcessRunner.contract.ts:29-38` (1) | yes |
| AC-9 (signal populated, `exitCode` absent via `in` check) | `classify-execa-result.test.ts:54-70` — asserts `"exitCode" in classified === false`, matching `exactOptionalPropertyTypes: true` (confirmed in `tsconfig.json`) | yes |
| AC-10 (non-zero exit resolves, never rejects) | `classify-execa-result.ts:80` (conditional spread, no throw for `exitCode` present); `ProcessRunner.contract.ts:29-38`; `classify-execa-result.test.ts:33-52` | yes |
| AC-11 (`cwd` honored) | `process-runner-exec.test.ts:133-148` — both sides `realpathSync`-normalized | yes |
| AC-12 (no shell, args verbatim) | `process-runner-exec.test.ts:150-172` — `; touch <marker>` arrives verbatim in `argv`, no file created; `shell: false` explicit in the option bag | yes |
| AC-13 (pre-spawn validation, before any spawn) | `process-run-request.test.ts` — 10-case table (empty/blank command, empty cwd, `timeoutMs` ≤0/non-finite ×2, `maxOutputChars` ≤0/non-finite ×3), plus the deliberate non-check of relative `cwd` (D-2) proven by an explicit passing case | yes |
| AC-14 (never-ran → `ProcessSpawnError` w/ `cause`) | `classify-execa-result.test.ts:72-126` (ENOENT, EACCES, no-`code` cases) + `process-runner-exec.test.ts:174-234` (real EACCES via `chmod 600`, real missing `cwd`) — R4-001 fix confirmed present at both layers | yes |
| AC-15 (architecture guards, protected files untouched) | V-1, V-3, V-4 above — independently re-derived, not trusted | yes |
| AC-16 (`failed` never used as the signal) | `ExecaLikeResult` has no `failed` field at all — a stronger, compile-time guarantee than a runtime mutation (execution-log.md's own characterization, confirmed by direct read of the interface at `classify-execa-result.ts:20-37`); `classify-execa-result.test.ts:33-52` exercises exit-1 resolving cleanly | yes |
| AC-17 (truncation must not mask timeout) | `classify-execa-result.test.ts:208-228` (unit, `isMaxBuffer: true` + `signal` set + elapsed≥timeout → `timedOut: true`) + `process-runner-exec.test.ts:237-254` (real flood-and-hang) | yes |

All 17 ACs verify clean against current source, independently read — not merely against execution-log.md's narrative.

## Findings

New findings from this fresh read, beyond the review ledger's 6 info-tier rows:

| Finding Id | Severity | Summary | Scope | Blocking | Recommended Action |
|---|---|---|---|---|---|
| QA-101 | low | `AC-2`'s validation hint calls for a case asserting the pre-termination output line is preserved in `stdout` after a timeout; the real-child AC-2 test (`process-runner-exec.test.ts:86-96`) only asserts `timedOut: true`, not that output produced before the kill survives. Coverage exists indirectly (AC-1's reaping test does capture a pre-kill stdout line), so the AC is not left unproven, just not proven by its most literally-matching test. | test | no | Optional: add an explicit "prints then hangs, output preserved" case to `process-runner-exec.test.ts` in a future pass. Does not weaken confidence in AC-2 given AC-1's incidental coverage. |
| QA-102 | low | Confirms review-ledger R3-001 still holds on this fresh read: no test anywhere (contract, classifier unit, or real-child) exercises the adapter's own relative-`cwd` rejection path (`process-runner-exec.ts:52-56`) — only the "does NOT reject at the core layer" side of D-2 is tested. Already recorded as `info`/non-blocking in review-ledger.md; re-confirmed independently rather than re-derived as new. | test | no | Carried forward per the ledger's own disposition — optional follow-up, not required for this story. |

Both are low-severity, non-blocking, and do not change the verdict from what the review ledger already established. No new medium/high-severity issue was found in this pass.

## Evidence Log

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` — 2026-08-23T03:00Z | 114 files, 0 errors, depcruise 80 modules/164 deps clean |
| command | `npm test` — 2026-08-23T03:01Z | 401/401 passed, 26 test files |
| command | `git merge-base origin/main HEAD` | `8c080cb2112382dbd04c3074c6c2ff7b54beab57` |
| command | `git diff --stat <merge-base>..HEAD -- src/core/run/run-review.ts src/adapters/driven/git src/adapters/driven/engines` | empty |
| command | `grep -rn "execa" src/core/` | 2 matches, both doc-comment prose, zero imports |
| command | `git diff --stat <merge-base>..HEAD -- src/` | 11 files, 997 insertions / 3 deletions, matches plan.md's ST-1..ST-5 scope exactly |
| command | `git log --oneline <merge-base>..HEAD` | 11 commits, all `[E5.F1.H1]`-tagged, conventional types, on `claude/e5-f1-h1-process-runner` |
| command | TODO/FIXME/XXX + `.skip`/`.todo` greps | both empty |
| artifact | review-ledger.md | verdict `pass_with_warnings`, 0 open severe, 6 info, R4-001 `status: fixed` with mutation-proof notes |
| artifact | execution-log.md | 5 stage entries, all quick checks green, mutation proofs for ST-2 and ST-5 |
| source | all 7 production files + 4 test files | read in full, independently, not via diff skim |

## Verdict Rationale

- All 17 ACs verify clean against a fresh, independent read of current source and tests — not against execution-log.md's or review-ledger.md's narrative claims alone.
- `npm run check` and `npm test` are both fresh-green (114 files / 401 tests).
- AC-15 holds: the correct merge-base was independently re-derived (`git merge-base origin/main HEAD`), the protected-file diff is empty, and `execa` appears nowhere under `src/core/**` except in doc-comment prose.
- The full story diff is exactly the 11 expected files, with nothing under `src/main/` and no adapter other than `exec` touched.
- The review ledger's evidence was consumed, not re-derived, per instructions — but R4-001's fix was spot-checked directly in current source (both `ExecaLikeResult`'s shape and the adapter's population of it) rather than taken purely on the ledger's word.
- Verdict is `pass_with_warnings`, not a clean `pass`: two new low-severity, non-blocking observations surfaced (QA-101, QA-102), and the review ledger's 6 info-tier findings remain open as optional follow-up. None of these are material — no AC is unproven, no guard is violated, no test is disabled — but the warnings tier is the honest classification per the verdict rules given their presence.

## Mode-Specific Closeout Notes

- `final` mode, verdict `pass_with_warnings` → `lifecycle_status: completed` is applied; the residual info-tier items (ledger's 6 + this report's QA-101/QA-102) are recorded as optional follow-up, not blockers.

## Next Recommended Action

- Change is complete. Per workflow contract rule 6, `[E5.F1.H1]` unblocks `[E5.F1.H2]` (#32), the only remaining required E5 story after it — the epic is not yet fully in open/merged PRs, so the epic-summary-and-STOP rule does not trigger yet.
- Write the mandatory `history-log` entry before closing this session.
- Offer to open the PR (`Closes #31`) only on explicit user instruction, per CLAUDE.md's PR-creation gate — do not open one proactively.
- Downstream constraint reminder for `[E5.F1.H2]` (already recorded in spec.md, restated here for closeout visibility): it must (1) define the declared-validation string → `(command, args)` conversion without a shell, (2) route `InvalidProcessRequestError` into `run-review.ts`'s `"validation-failed"` branch and decide where `ProcessSpawnError` belongs, and (3) own the secret-exposure boundary for output reaching the prompt.

## State Sync Notes

- `state.yaml`'s `sddl-qa-review` stage should be set to `completed`, `lifecycle_status` to `completed`, and `next_action` updated to reflect PR-opening as the remaining human-gated step. `qa_summary` should carry this report's verdict (`pass_with_warnings`), AC count (17/17 verified), and the two new low-severity findings (QA-101, QA-102) alongside the ledger's existing 6 info-tier rows.

## Budget Notes

- Final review for a 5-stage change (4 planned + 1 fix stage), 997 changed lines across 11 files. Comparable in scope to `[E5.F2.H2]`'s final QA; this pass additionally independently re-derived the merge-base rather than trusting a hardcoded SHA, per this review's explicit instructions.
