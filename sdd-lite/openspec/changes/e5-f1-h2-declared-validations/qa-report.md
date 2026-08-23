# QA Report

## Closeout Digest

- change_name: e5-f1-h2-declared-validations
- review_mode: stage
- reviewed_scope: ST-1..ST-3 (ST-4 closing gate not yet run)
- verdict: pass
- blocking_findings_digest: none — 0 findings of any severity
- residual_risk_digest: risk-006 (process-group kill, consciously inherited), risk-007 (no secret redaction, accepted), risk-008 (silent skip when `deps.processRunner` absent — now empirically exercised by a test) all remain as documented, accepted exposures per spec.md; none discovered fresh by this review
- next_action_digest: proceed to ST-4 (closing gate) — the code, tests and gate are already in the state ST-4 expects to verify

## Summary

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- review_mode: stage
- reviewed_scope: ST-1..ST-3
- target_stage_id: ST-3 (latest completed; reviews ST-1, ST-2 as prerequisite context)
- lifecycle_status_before_review: reviewing
- lifecycle_status_after_review: reviewing (stage mode never sets `completed`)
- code_touched: no (read-only review; `qa-report.md` is the only file written)
- verdict: pass
- completion_eligible: n/a (stage mode cannot close the change)
- reported_at: "2026-08-23T00:00:00Z"

## Review History

| Review Id | Mode | Reviewed Scope | Verdict | Reported At | Next Action |
|---|---|---|---|---|---|
| qa-1 | stage | ST-1..ST-3 | pass | "2026-08-23T00:00:00Z" | continue to ST-4 |

## Review Context

- proposal_spec_reviewed: yes — spec.md revision 2, 21 ACs, all four ratified decisions plus D5/D6/D7 and the eight revision-2 corrections
- design_plan_reviewed: yes — design.md's D-1..D-7, plan.md's ST-1..ST-4 stage boundaries and validation strategy
- execution_log_reviewed: yes — all three stage entries, including both stages' mutation-testing rounds and ST-3's recorded finding that `classifyFailure`'s round-2 mutation is provably inert given `runValidations`'s own catch
- previous_qa_report_reviewed: n/a (first QA pass for this change); `e5-f1-h1-process-runner/qa-report.md` read as a structural precedent only, per the handoff
- changed_scope_reviewed: yes — full `git diff --stat beb5d48..HEAD -- src/` independently re-derived, not trusted from execution-log.md's self-report
- quality_commands_considered: `npm run check` (biome + tsc --noEmit + depcruise), `npm test` (full vitest suite, all three projects) — both re-run fresh for this review, not paraphrased from the log
- review_trigger: ST-3 (wiring stage) complete; user/orchestrator requested a stage review before the ST-4 closing gate
- review_notes: Every specific claim in the handoff (AC-1 no-op reachability, the `ProcessSpawnError`/`classifyFailure` invariant, AC-16's ordering, AC-19's lockstep, AC-20's blast radius) was independently verified by reading the actual production code and re-deriving the diff, not trusted from execution-log.md's narrative. The merge-base used for AC-20 is `beb5d48` (the `e5-f1-h1-process-runner` PR merge, the correct predecessor base per this branch's history), independently confirmed as an ancestor of `8c080cb` — the hash named in the handoff turned out to be an earlier, unrelated merge (`e5-f2-h2-query-history`) still in this branch's ancestry, not the story's actual predecessor; `beb5d48` was used instead as the evidently correct base and the diff against it matches plan.md's 11-file scope exactly.

## Review Evidence

- review_ledger_path: n/a — no `sddl-code-review`/`sddl-judgment-day` protocol has run for this change yet (no `review-ledger.md` exists in this change directory)
- review_mode: n/a
- notes: This stage review is the first structured review pass on this change; findings below are original to this review, not reused from a ledger.

## Validation Plan And Results

| Check Id | Category | Source | Planned Check | Outcome | Notes |
|---|---|---|---|---|---|
| V-1 | command | config | `npm run check` (biome + tsc --noEmit + depcruise) | passed | Fresh run: `Checked 118 files in 113ms. No fixes applied.` / `tsc --noEmit` clean (no output) / `✔ no dependency violations found (81 modules, 170 dependencies cruised)` |
| V-2 | command | config | `npm test` (full vitest suite) | passed | Fresh run: `Test Files 28 passed (28)`, `Tests 494 passed (494)` |
| V-3 | repo-state | handoff item 5 (AC-20 blast radius sanity check) | `git diff --stat beb5d48..HEAD -- src/` confined to the 11 files plan.md names | passed | Exactly 11 files, 1593 insertions / 8 deletions: `run-metadata-schemas.ts` (+1), `repos/__test__/config-schemas.test.ts` (new, 91), `repos/ports/config-schemas.ts` (+10), `run/__test__/fake-process-runner.ts` (new, 108), `run/__test__/run-review-fixtures.ts` (+13), `run/__test__/run-review.test.ts` (+283), `run/__test__/run-validations.test.ts` (new, 647), `run/index.ts` (+8), `run/run-errors.ts` (+15), `run/run-review.ts` (+94/-8), `run/run-validations.ts` (new, 331). Nothing under `src/adapters/**`, `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, or `src/core/run/ports/process-runner.ts` |
| V-4 | code-read | handoff item 1 (AC-1 byte-identical, structural) | Read the stage-1 hoist and stage-5 gate in `run-review.ts`, confirm structural no-op when `deps.processRunner` undefined or `declarations` empty | passed — see finding-free note below | Both sites gate on the identical expression `deps.processRunner !== undefined && declarations.length > 0` (`run-review.ts:363-364` and `:425`), computed once (`declarations`, line 362) and reused, never recomputed. When false, the stage-1 block's `if` body (lines 365-382) never executes — zero calls, zero allocation beyond the `?? []` — and stage 5's block (426-438) never executes either, leaving `validationOutput = request.validationOutput` (line 422-423) untouched and `stage` never reassigned away from `"diff"`. This is a single shared boolean gating both sites, not merely "the test still passes" — structurally unreachable, confirmed by direct read |
| V-5 | code-read | handoff item 2 (`ProcessSpawnError`/`classifyFailure` invariant) | Read `run-validations.ts`'s catch block; confirm `ProcessSpawnError` is caught and never rethrown | passed | `run-validations.ts:317-327`: `catch (error: unknown) { if (error instanceof ProcessSpawnError) { elements.push(...); continue; } throw error; }` — the only path that reaches `continue` (never rethrows) is `ProcessSpawnError`; every other throwable (including `InvalidProcessRequestError` from the just-preceding `validateProcessRunRequest` call) is rethrown. `classifyFailure` in `run-review.ts:496-517` has no `ProcessSpawnError` branch and a comment explaining why. Confirmed: `ProcessSpawnError` cannot reach `classifyFailure` |
| V-6 | code-read | handoff item 3 (AC-16 ordering) | Read the stage-5 code that builds the array handed to `assemblePrompt` | passed | `run-review.ts:437`: `validationOutput = [...(request.validationOutput ?? []), ...computed];` — caller-supplied entries spread first, computed entries second, literally in source order. `assemble-prompt.ts:80-87`'s `renderValidationOutput` renders the array via `lines.join("\n")` without reordering. A dedicated test (`run-review.test.ts:910-930`) asserts `preIndex < computedIndex` on the actual rendered prompt string |
| V-7 | compile-check | handoff item 4 (AC-19 lockstep) | Confirm `RUN_STAGES` and `RunStage` in lockstep and `tsc --noEmit` clean | passed | `run-review.ts:146-154`'s `RunStage` union and `run-metadata-schemas.ts:38-47`'s `RUN_STAGES` array both list `"validations"` between `"diff"` and `"prompt"`, in the same order; the `_AllRunStagesCovered` exhaustiveness guard (line 55-57) is part of the whole-program `tsc --noEmit` that passed clean in V-1 |
| V-8 | grep | AC-1's provenance clause | `grep -rniE "package\.json|makefile" src/core/run/run-validations.ts src/core/run/run-review.ts` | passed | Zero hits — no auto-detection of any kind in the production diff |

## Findings

None. Zero findings of any severity surfaced in this review.

## AC Coverage Table (15 in-scope ACs for ST-1..ST-3, plus ST-2's own 6)

| AC | Discharged By | Verified |
|---|---|---|
| AC-1 | `run-review.ts:362-364,425` (shared gate) + `run-review.test.ts:675-706,838-851` (3 no-op cases) | yes |
| AC-2 | `run-validations.ts:308-328` (sequential `for…of`, one `await`) + `fake-process-runner.ts`'s `inFlight` overlap guard + `run-review.test.ts:708-732` | yes |
| AC-3 | `run-review.ts:430` (`cwd: worktree.path`) + `run-review.test.ts:728-731` (`call.cwd === result.worktreePath`, `!== repoPath`) | yes |
| AC-4 | `run-validations.ts:305` (default) + `run-review.ts:366-380` (stage-1 range guard) + `run-review.test.ts:853-907` (0, 2^31, valid-forwarded cases) | yes |
| AC-5 | `config-schemas.ts:23-49` (additive, no `.default()`) + `repos/__test__/config-schemas.test.ts` (7 tests) | yes |
| AC-6 | `run-validations.ts:139-162` (`tokenizeDeclaration`) — table-driven in `run-validations.test.ts` | yes |
| AC-7 | `run-validations.ts:79-117` (literal `Set` + codepoint predicate) — mutation-proven in execution-log.md ST-2, independently spot-read | yes |
| AC-8 | `run-validations.ts:154-158` (zero-token rejection) | yes |
| AC-9 | `run-review.ts:496-517` (`classifyFailure`, no `ProcessSpawnError` branch) | yes |
| AC-10 | `run-review.ts:357-382` hoist, conditional on `validationsWillRun`; `run-validations.ts:304` unconditional re-check | yes |
| AC-11 | `run-validations.ts` never throws for a runtime exit; `run-review.test.ts:736-752` (`exitCode: 1` → `state: "ok"`) | yes |
| AC-12 | V-5 above; `run-review.test.ts` spawn-fail-then-continue case | yes |
| AC-13 | `formatOutcomeElement` records `timedOut` as evidence; never a throw path | yes |
| AC-16 | V-6 above | yes |
| AC-17 | `assemble-prompt.ts:80-87` unmodified; `run-review.test.ts:933-949` | yes |
| AC-18 | `run-validations.test.ts`'s own import list (`run-errors.js`, `run-validations.js`, local fake only) | yes |
| AC-19 | V-7 above | yes |
| AC-21 | ST-2's determinism test (execution-log.md); no wall-clock field anywhere in `formatOutcomeElement`/`formatSpawnFailureElement` (confirmed by direct read — no `Date`, no `now`, no duration field) | yes |

AC-14, AC-15 (ST-2's byte-exact format and D6 window) were spot-read in `run-validations.ts:250-282` and `195-234` and match spec.md's pinned format and R2-4's line semantics exactly; not re-tabulated line-by-line here since they were the deepest part of ST-2's own mutation-testing round (execution-log.md), independently spot-checked rather than fully re-derived given this stage review's proportionate scope. AC-20 is ST-4's formal gate; V-3 above is this stage's sanity check of it, not its final verification.

## Evidence Log

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` | 118 files, 0 lint/format errors, 0 type errors, depcruise 81 modules/170 deps clean |
| command | `npm test` | 494/494 passed, 28 test files |
| command | `git log --oneline -15` | confirms HEAD at `391f7d3`, ST-1..ST-3 commits present in order |
| command | `git merge-base 8c080cb HEAD` and `git merge-base 8c080cb beb5d48` | established `beb5d48` (not the handoff's suggested `8c080cb`) as the correct predecessor-story base — `8c080cb` is an earlier, unrelated ancestor merge (`e5-f2-h2-query-history`) |
| command | `git diff --stat beb5d48..HEAD -- src/` | 11 files, 1593/-8, matches plan.md's ST-1..ST-3 scope exactly |
| source | `run-validations.ts`, `run-review.ts`, `run-errors.ts`, `config-schemas.ts`, `run-metadata-schemas.ts` (relevant excerpt), `assemble-prompt.ts`, `index.ts` | read in full, independently |
| source | `run-review.test.ts` (relevant sections), `run-validations.test.ts` (assertion-density spot check: 56 `toBe`/`toEqual`/`toContain`/`toThrow` calls) | read for real assertions, not just test names |

## Verdict Rationale

- All 15 ACs claimed by ST-1..ST-3 (plus AC-14/AC-15/AC-6/AC-7/AC-8 from ST-2) verify clean against a fresh, independent read of current production code — not against execution-log.md's narrative alone.
- `npm run check` and `npm test` are both fresh-green, matching the execution log's self-report exactly (494 tests, 0 gate violations).
- The three specific seams the handoff flagged as bug-prone in a wiring story were each independently confirmed by direct code read: AC-1's no-op is structurally unreachable (not merely test-green), the `ProcessSpawnError`/`classifyFailure` invariant holds exactly as ST-3's execution-log entry described, and AC-16's ordering is literal source order, not an assumption.
- AC-20's blast radius (sanity-checked, not formally closed — that is ST-4's job) is exactly the 11 files plan.md names, using the correctly-identified predecessor base (`beb5d48`, not the `8c080cb` hash suggested in the handoff, which is an unrelated ancestor commit still reachable on this branch).
- No defect, contradiction, or gap was found. Zero findings.
- Verdict is a clean `pass`: nothing here should block proceeding to ST-4.

## Mode-Specific Closeout Notes

- `stage` mode: this review does NOT close the change and does NOT set `lifecycle_status: completed`. `lifecycle_status` stays `reviewing`.
- Recommended routing: proceed directly to ST-4 (the closing gate) — no fix stage, no replanning, no `sddl-plan` detour needed. ST-4's own AC-20 verification should use `beb5d48` as the base, per this review's correction of the handoff's suggested hash.

## Next Recommended Action

- Run ST-4 (closing gate): full `npm run check` + `npm test` (both already fresh-green as of this review) and the formal AC-20/AC-1-grep verification per plan.md, using `beb5d48` as the pre-story base.
- No fix routing required — this review found nothing to route back through `sddl-plan`.

## State Sync Notes

- `state.yaml`'s `sddl-qa-review` stage should record this stage review's verdict (`pass`) and scope (`ST-1..ST-3`) without setting `lifecycle_status: completed`. `open_risks` unchanged (risk-006/007/008 remain accepted, documented, unaffected by this review).

## Budget Notes

- Stage review over 3 completed stages (11 changed files, 1593 inserted lines), reusing execution-log.md's mutation-testing results as consumed evidence for AC-7/AC-14/AC-15 rather than re-running mutations, per the stage-mode "smallest meaningful validation set" rule — all six items the handoff specifically flagged for independent verification were checked by direct code read rather than trusted.
