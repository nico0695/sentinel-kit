# QA Report

## Closeout Digest

- change_name: e5-f1-h2-declared-validations
- review_mode: final
- reviewed_scope: full-change (ST-1..ST-4)
- verdict: pass_with_warnings
- blocking_findings_digest: none — 0 open severe findings in review-ledger.md, 0 failing checks, all 21 ACs verify against fresh code at `53370f8`
- residual_risk_digest: risk-006 (process-group kill, consciously inherited, routed to E5 closing summary), risk-007 (no secret redaction — R1-001 in review-ledger.md matched this and was closed `wont-fix`/info after explicit user ratification at `cp-review-gate-r1-001`), risk-008 (silent skip when `deps.processRunner` absent, mitigated only by documentation for E6), plus review-ledger.md's two open `info` rows (R3-001 no standalone `MAX_TIMEOUT_MS` guard in `runValidations` itself; R4-001 no cap on declaration count / aggregate stage duration). All accepted, documented, non-blocking.
- next_action_digest: change eligible for `completed`; recommend opening the PR (`Closes #32`) only on explicit user instruction, per CLAUDE.md's PR-creation gate; the epic-E5 closing summary (workflow contract rule 6) should carry risk-006 and risk-008 as named follow-ups

## Summary

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- review_mode: final
- reviewed_scope: full-change
- target_stage_id: n/a (full change)
- lifecycle_status_before_review: reviewing
- lifecycle_status_after_review: completed
- code_touched: no (QA is read-only; ST-1..ST-4 already applied and committed, plus one documentation-only commit ratifying R1-001's closure)
- verdict: pass_with_warnings
- completion_eligible: true
- final_review_checkpoint_id: `cp-review-gate-r1-001` (already resolved, option A ratified by the user prior to this stage)
- final_review_decision_id: n/a — no new closeout decision required by this review
- reported_at: "2026-08-23T18:10:00Z"

## Review History

| Review Id | Mode | Reviewed Scope | Verdict | Reported At | Next Action |
|---|---|---|---|---|---|
| qa-1 | stage | ST-1..ST-3 | pass | "2026-08-23T00:00:00Z" | continue to ST-4 |
| qa-2 | final | full-change | pass_with_warnings | "2026-08-23T18:10:00Z" | complete |

## Review Context

- proposal_spec_reviewed: yes — spec.md revision 2, 21 acceptance criteria, all four ratified B-level decisions (dec-001..dec-004) plus D5/D6/D7 and the eight revision-2 corrections (R2-1..R2-8)
- design_plan_reviewed: yes — design.md's D-1..D-7 and plan.md's ST-1..ST-4 stage boundaries, dependencies, and validation strategy
- execution_log_reviewed: yes — all four stage entries, including ST-2's three mutation-testing rounds and ST-3's two, plus the recorded finding that adding `ProcessSpawnError` to `classifyFailure`'s branch is structurally inert (already caught one layer down)
- previous_qa_report_reviewed: yes — the ST-1..ST-3 stage-mode QA (verdict `pass`, zero findings, already independently re-verified against `391f7d3`); this final review extends it to ST-4 and the full change rather than copying it, and independently re-derives every claim against current `HEAD` (`53370f8`) rather than trusting either the stage QA or execution-log.md's self-report
- changed_scope_reviewed: yes — fresh `git diff --stat beb5d48..HEAD -- src/`, independently re-run (see Validation Plan) — identical to the stage QA's 11-file, 1593+/8- result; nothing changed since ST-4 or since the stage QA ran
- quality_commands_considered: `npm run check` (biome + `tsc --noEmit` + `depcruise src`), `npm test` (full vitest suite, all three projects — core/adapters/e2e) — both re-run fresh for this review
- review_trigger: `sddl-code-review` full-4r protocol complete, `review-ledger.md` verdict `pass_with_warnings` with 0 open severe findings, R1-001 closed by explicit user ratification; this is the closeout QA pass
- review_notes: HEAD confirmed at `53370f8` on branch `claude/e5-f1-h2-declared-validations`, one commit beyond the review-ledger's target (`b7376e6`) — that one commit is `docs(sddl): ratify risk-007, close R1-001`, a documentation-only change to `state.yaml`/`review-ledger.md`, confirmed by `git diff --stat beb5d48..HEAD -- src/` showing no drift from the stage-mode QA's file list, line counts, or content. Every specific contract this handoff flagged for re-verification (AC-1's no-op, AC-9..AC-13's terminal-state mapping, AC-20's file pin, AC-21's determinism) was independently re-read from current source and current test bodies, not from any prior report's narrative — see Validation Plan And Results.

## Review Evidence

- review_ledger_path: sdd-lite/openspec/changes/e5-f1-h2-declared-validations/review-ledger.md
- review_mode: 4r
- ledger_verdict: pass_with_warnings
- ledger_counts: confirmed=0 suspect=0 escalated=0 info=4
- open_severe_findings: 0
- ledger_findings_reused_instead_of_reanalyzed: true
- notes: R1-001 (the sole CRITICAL candidate) was independently corroborated by the orchestrator via direct code reading (`REJECTED_SHELL_CHARS`/`isRejectedChar` in `run-validations.ts`), matched against the already-accepted, proposal-stage `risk-007` (severity `low`), raised to the user as `review_gate` checkpoint `cp-review-gate-r1-001`, and closed `wont-fix`/info on explicit user ratification of option A — "risk-007 stands as already-decided and correctly scoped." This is a **closed, user-ratified disposition**, not an open gap: re-litigating it here would contradict the user's own decision. R1-002 was reconciled as spec-conformant (not a defect) against AC-14's exact text, independently confirmed by this review's own read of `formatOutcomeElement`'s `truncated` computation (`run-validations.ts:260-264`), which matches AC-14's clause verbatim: `true` when either capture flag was set or D6's window elided anything — a per-line character cut is neither, exactly as R1-002's reconciliation states. R3-001 and R4-001 remain open `info`-tier, non-blocking, and are carried forward as documented residuals (see Findings below) rather than re-derived from scratch, since neither is a correctness gap against a pinned AC — both are honest scope observations the review already reasoned through correctly.

## Validation Plan And Results

| Check Id | Category | Source | Planned Check | Outcome | Notes |
|---|---|---|---|---|---|
| V-1 | command | config | `npm run check` (biome + `tsc --noEmit` + `depcruise src`) | passed | Fresh run at `53370f8`: `Checked 118 files in 113ms. No fixes applied.` / `tsc --noEmit` clean (no output) / `✔ no dependency violations found (81 modules, 170 dependencies cruised)` |
| V-2 | command | config | `npm test` (full vitest suite, all three projects) | passed | Fresh run: `Test Files 28 passed (28)`, `Tests 494 passed (494)` |
| V-3 | repo-state | handoff item (blast-radius reconfirmation) | `git diff --stat beb5d48..HEAD -- src/` confined to the same 11 files as ST-4/the stage QA, unchanged since | passed | Identical to the stage-mode QA's result: 11 files, 1593 insertions / 8 deletions — `run-metadata-schemas.ts` (+1), `repos/__test__/config-schemas.test.ts` (new, 91), `repos/ports/config-schemas.ts` (+10), `run/__test__/fake-process-runner.ts` (new, 108), `run/__test__/run-review-fixtures.ts` (+13), `run/__test__/run-review.test.ts` (+283), `run/__test__/run-validations.test.ts` (new, 647), `run/index.ts` (+8), `run/run-errors.ts` (+15), `run/run-review.ts` (+94/-8), `run/run-validations.ts` (new, 331). Nothing under `src/adapters/**`, `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, or `src/core/run/ports/process-runner.ts`. The one commit between the ledger's target (`b7376e6`) and `HEAD` (`53370f8`) is confirmed documentation-only (`state.yaml`/`review-ledger.md` ratifying R1-001's closure) — it touches nothing under `src/` |
| V-4 | grep | AC-1's provenance clause + hygiene | `grep -niE "package\.json\|makefile"`, TODO/FIXME/XXX, and `.skip(`/`.todo(` over the full story diff | passed | All three greps empty — zero hits |
| V-5 | code-read | AC-1's byte-identical no-op (re-verified fresh) | Read `run-review.ts:357-365,424-425` and the three no-op tests at `run-review.test.ts:675-706` | passed | Both call sites gate on the identical, once-computed boolean `deps.processRunner !== undefined && declarations.length > 0` — structurally unreachable when false, not merely test-green. The three tests assert `runner.calls` has length `0` for (a) `validations` absent, (b) `validations: []`, (c) `processRunner` absent with `validations` declared — and additionally assert `result.prompt` does **not** contain `<validation-output>`, a stronger check than the stage-mode QA ran |
| V-6 | code-read | AC-9..AC-13's terminal-state mapping (re-verified fresh) | Read `classifyFailure` (`run-review.ts:496-517`) and the corresponding tests | passed | `classifyFailure`'s `validation-failed` branch lists exactly `InvalidValidationDeclarationError` and `InvalidProcessRequestError`, with a comment explaining `ProcessSpawnError`'s deliberate absence. `run-validations.ts:317-327`'s catch confirms `ProcessSpawnError` is the only class caught and never rethrown — everything else propagates. Test at `run-review.test.ts:798-814` asserts the escapee path directly: an `Error("boom")` thrown by the fake runner yields `state === "engine-error"`, `failure.stage === "validations"`, `failure.error.message === "boom"` — a real, specific assertion, not a loose existence check. AC-11 (non-zero exit) and AC-13 (timeout) both resolve normally as evidence per direct read of `formatOutcomeElement`, which never throws |
| V-7 | code-read | AC-20's untouched-file pin (re-verified fresh) | Cross-check V-3's diff list against spec.md's AC-20 pinned-untouched set | passed | Exactly the 11 named files; `src/core/repos/` touched only at `ports/config-schemas.ts` and the new `__test__/config-schemas.test.ts`; `src/core/history/` touched only at the one `RUN_STAGES` line + comment in `ports/run-metadata-schemas.ts`; `src/core/run/ports/process-runner.ts` untouched (consumed via import only, confirmed by `run-validations.ts:18-22`) |
| V-8 | code-read | AC-21's determinism (re-verified fresh) | Read `formatOutcomeElement`/`formatSpawnFailureElement` for any wall-clock, pid, or timestamp field; read the determinism test | passed | Neither formatter references `Date`, `Date.now()`, `process.pid`, `os.hostname()`, or any duration field — confirmed by direct read of `run-validations.ts:250-282`, which contains only `entry`, `result.exitCode`, `result.signal`, `result.timedOut`, `truncated`, and the windowed stream text. `run-validations.test.ts:602-631`'s test runs `runValidations` twice over freshly-built (not shared/mutated) fakes and asserts `resultA` `toEqual` `resultB`, plus a regex assertion that no ISO-8601 timestamp appears anywhere in the joined output |
| V-9 | artifact | review-ledger | 0 open severe findings; R1-001's `wont-fix` closure carries an explicit, dated user ratification | passed | `review-ledger.md`'s Findings Ledger: R1-001 `status: wont-fix`, closed at `cp-review-gate-r1-001` with `selected_option_id: A`; R1-002 `status: info`, reconciled; R3-001 and R4-001 both `status: info`, open but non-blocking per the severity floor (neither is `introduced`/`behavior-activated`/`worsened` at a blocking severity) |

## Findings

No new findings from this fresh, independent pass beyond what `review-ledger.md` already carries. The two open `info`-tier ledger rows are restated here for closeout visibility, not as new discoveries:

| Finding Id | Severity | Summary | Scope | Blocking | Recommended Action |
|---|---|---|---|---|---|
| R3-001 (ledger) | low (WARNING, deterministic, `info`) | `runValidations`/`validateProcessRunRequest` never enforce Node's `MAX_TIMEOUT_MS` (`setTimeout`'s 32-bit ceiling) themselves — only `run-review.ts`'s stage-1 call site does. A future standalone caller of `runValidations` (AC-18's own use case) that skips replicating that guard could pass an overflowing `timeoutMs` straight through to `validateProcessRunRequest`, which would reject it there instead, one layer later than the pipeline caller gets. | design/robustness | no | Optional follow-up: either duplicate the range guard inside `runValidations` itself, or document explicitly that standalone callers must apply it. Not required for this story — `runReview`, the only shipped caller, already guards correctly (AC-4 verified above). |
| R4-001 (ledger) | low (WARNING, deterministic, `info`) | No cap exists on declaration count or aggregate validation-stage duration — `n` declared scripts can hold `runReview` for up to `n × timeoutMs`, exactly as spec.md's Out Of Scope table states was deliberately deferred ("Parallel execution, retries, an aggregate budget across all scripts"). | scope | no | Not a defect — an explicitly deferred scope item, correctly recorded in both spec.md and the ledger. No action required for this story; a candidate for a future hardening pass if aggregate budgets become a real operational concern. |

Neither finding contradicts a pinned acceptance criterion, weakens a guard, or leaves a test disabled. Both are honest, already-recorded scope boundaries.

## AC Coverage Table (all 21)

| AC | Discharged By | Verified |
|---|---|---|
| AC-1 | `run-review.ts:362-365,424-425` (shared, once-computed gate) + `run-review.test.ts:675-706` (3 no-op cases, incl. `<validation-output>` absence) | yes (V-5) |
| AC-2 | `run-validations.ts:307-328` (sequential `for…of`, one `await`) + `fake-process-runner.ts`'s `inFlight` overlap guard + `run-review.test.ts:708-732` | yes |
| AC-3 | `run-review.ts:430` (`cwd: worktree.path`) + `run-review.test.ts` asserting `cwd === worktreePath`, `!== repoPath` | yes |
| AC-4 | `run-validations.ts:305` (default `120_000`) + `run-review.ts:365-382` (stage-1 range guard, finite/`>0`/`≤2^31-1`) + `run-review.test.ts` (0, 2^31, valid-forwarded cases) | yes |
| AC-5 | `config-schemas.ts:31,48` (additive `z.number().optional()`, no `.default()`, both schemas) + `repos/__test__/config-schemas.test.ts` (7 tests: pre-story parse, field-preserved parse, no-default assertion, `validations` unwidened) | yes |
| AC-6 | `run-validations.ts:139-162` (`tokenizeDeclaration`), table-driven tests | yes |
| AC-7 | `run-validations.ts:79-117` (literal `Set` + codepoint predicate, tab exempted) — mutation-proven in execution-log.md ST-2, independently spot-read here | yes |
| AC-8 | `run-validations.ts:154-158` (zero-token rejection after trim/split) | yes |
| AC-9 | `run-review.ts:496-517` (`classifyFailure`, `InvalidValidationDeclarationError` + `InvalidProcessRequestError` only, no `ProcessSpawnError`) | yes (V-6) |
| AC-10 | `run-review.ts:357-382` hoist gated on `validationsWillRun`; `run-validations.ts:304` unconditional re-check for standalone callers | yes |
| AC-11 | `formatOutcomeElement` never throws for a runtime exit; `run-review.test.ts` (`exitCode: 1` → `state: "ok"`, evidence in prompt) | yes |
| AC-12 | `run-validations.ts:317-327` (`ProcessSpawnError` only catch, never rethrown) + `run-review.test.ts` spawn-fail-then-continue case | yes (V-6) |
| AC-13 | `formatOutcomeElement` records `timedOut` as evidence, never throws; `run-review.test.ts:793-796` (`timedOut=true`, partial output preserved) | yes |
| AC-14 | `run-validations.ts:246-282` (`terminated()` concatenation, exact format both paths) — exact-string (`toBe`) tests in `run-validations.test.ts`, mutation-proven (execution-log.md ST-2) | yes |
| AC-15 | `run-validations.ts:203-234` (`windowStream`, R2-4 line semantics: split on `\n` only, trailing-newline artifact excluded) — 300-line/3-line, 250-line, and 200-line-with-trailing-newline boundary tests | yes |
| AC-16 | `run-review.ts:437` (`[...(request.validationOutput ?? []), ...computed]`, caller entries first) + `assemble-prompt.ts`'s unmodified `join` + a dedicated ordering test | yes |
| AC-17 | `assemble-prompt.ts:80-87` unmodified; `run-review.test.ts` asserts `<validation-output>` present with `$ ` headers | yes |
| AC-18 | `run-validations.test.ts`'s own import list (`run-errors.js`, `run-validations.js`, local fake only, confirmed by header comment and file read) | yes |
| AC-19 | `run-metadata-schemas.ts:43` (exactly one `RUN_STAGES` entry + comment) + `run-review.ts:151` (`RunStage` union) + `tsc --noEmit` green in V-1 | yes |
| AC-20 | V-3, V-4, V-7 above — full blast-radius pin re-confirmed fresh, identical to ST-4's and the stage QA's result | yes |
| AC-21 | `run-validations.ts:250-282` (no `Date`/pid/duration field anywhere, confirmed by direct read) + `run-validations.test.ts:602-631` (`toEqual` across two independent runs, plus a no-ISO-timestamp regex assertion) | yes (V-8) |

All 21 acceptance criteria verify clean against a fresh, independent read of current production code and current test bodies — not against any prior report's narrative.

## Evidence Log

| Kind | Reference | Notes |
|---|---|---|
| command | `git log --oneline -1` | `53370f8` on `claude/e5-f1-h2-declared-validations`, confirming HEAD matches the handoff's expected commit |
| command | `npm run check` | 118 files, 0 lint/format errors, 0 type errors, depcruise 81 modules/170 deps clean |
| command | `npm test` | 494/494 passed, 28 test files |
| command | `git diff --stat beb5d48..HEAD -- src/` | 11 files, 1593/-8, identical to ST-4's and the stage-mode QA's result — no drift since |
| command | `grep -niE "package\.json\|makefile"`, TODO/FIXME/XXX, `.skip(`/`.todo(` greps over the diff | all empty |
| source | `run-validations.ts` (read in full, 331 lines) | tokenizer, rejection set, window, formatters, use case body all re-read directly |
| source | `run-review.ts` (relevant sections: stage-1 hoist, stage-5 wiring, `classifyFailure`, `RunStage`) | re-read directly, not paraphrased |
| source | `run-metadata-schemas.ts` (`RUN_STAGES` array) | one-line-plus-comment diff confirmed |
| source | `config-schemas.ts`, `config-schemas.test.ts` | additive field and its 7 tests confirmed |
| source | `run-review.test.ts` (AC-1, AC-9, AC-19 relevant sections), `run-validations.test.ts` (AC-21 relevant section) | read for real, specific assertions — not just test names |
| artifact | `review-ledger.md` | verdict `pass_with_warnings`, 0 open severe, R1-001 closed `wont-fix` with dated user ratification at `cp-review-gate-r1-001`, R1-002 reconciled, R3-001/R4-001 open `info` |
| artifact | `state.yaml` | `checkpoints[cp-review-gate-r1-001].response` confirms `selected_option_id: A`, matching `risk-007`'s recorded, proposal-stage acceptance |

## Verdict Rationale

- All 21 acceptance criteria verify clean against a fresh, independent read of current production code and current test bodies at `53370f8` — not against execution-log.md's, the stage QA's, or the review-ledger's narrative alone.
- `npm run check` and `npm test` are both fresh-green (118 files / 494 tests), matching every prior self-report exactly.
- The blast radius is unchanged since ST-4: exactly the same 11 files, same line counts, nothing under `src/adapters/**`, `src/main/**`, `src/core/review/**`, or `src/core/workspace/**`. The one commit landed since the review-ledger's target (`b7376e6`) is confirmed documentation-only.
- The four specific contracts this handoff flagged for a fresh re-check — AC-1's byte-identical no-op, AC-9..AC-13's terminal-state mapping, AC-20's untouched-file pin, and AC-21's determinism — were each independently re-verified by direct code and test-body reading, not assumed from a prior pass.
- `review-ledger.md`'s sole CRITICAL finding, R1-001, is a **closed, user-ratified item**: it matched an already-accepted, documented risk (`risk-007`, recorded during the proposal stage at "low" severity) and the user explicitly ratified that disposition at `cp-review-gate-r1-001`. This review does not reopen it; it is accounted for as accepted-and-documented residual exposure, consistent with the project's decision protocol (Level C-adjacent security call, made consciously by the user rather than defaulted).
- Two `info`-tier ledger findings (R3-001, R4-001) remain open but are honest, non-blocking scope observations — neither is a correctness defect against a pinned AC, and R4-001 restates a deferral spec.md's own Out Of Scope table already states deliberately.
- Verdict is `pass_with_warnings`, not a clean `pass`: the ledger's two open `info` rows and the three consciously-accepted risks (risk-006, risk-007, risk-008) are real, documented residuals that a closeout review should surface rather than silently absorb — but none is a blocker, no AC is unproven, no guard is violated, and no test is disabled.

## Mode-Specific Closeout Notes

- `final` mode, verdict `pass_with_warnings` → `lifecycle_status: completed` is applied, per this stage's own rule ("pass_with_warnings if only non-blocking observations remain"). All observations here are non-blocking: two already-reasoned-through ledger `info` rows and three consciously-accepted, documented risks — none contradicts a pinned acceptance criterion or leaves a guard unenforced.
- **Explicit statement on readiness**: this change is ready to be marked `completed`. No further fix stage, replanning, or `sddl-plan` detour is required. The only remaining human-gated step is opening the PR, per CLAUDE.md's explicit-instruction gate.

## Next Recommended Action

- Change is complete. Per workflow contract rule 6: `[E5.F1.H2]` (#32) is the last required story of milestone E5 — once this change's PR is open, the epic-E5 summary (done / pending review / blockers / suggestions for next epic) should be posted and the session should STOP. That summary must carry `risk-006` (process-group kill) and `risk-008` (silent skip when `deps.processRunner` is absent) as named follow-ups, per spec.md's downstream constraints 5 and 2.
- Write the mandatory `history-log` entry before closing this session.
- Offer to open the PR (`Closes #32`) only on explicit user instruction, per CLAUDE.md's PR-creation gate — do not open one proactively.
- Downstream constraints for E6 (already recorded in spec.md, restated here for closeout visibility): (1) implement the `validationTimeoutMs` cascade (run → repo → global → `DEFAULT_VALIDATION_TIMEOUT_MS`); (2) wire `deps.processRunner` in the composition root — omitting it silently skips all declared validations; (3) feed `request.validations` only from `RepoEntry.validations`, never re-derived; (4) surface `InvalidValidationDeclarationError`'s message directly rather than a generic "validation-failed".

## State Sync Notes

- `state.yaml`'s `sddl-qa-review` stage should be set to `completed`, `lifecycle_status` to `completed`, and `next_action` updated to reflect PR-opening as the remaining human-gated step. `qa_summary` should carry this report's verdict (`pass_with_warnings`), AC count (21/21 verified), and the residual risk digest above. `open_risks` (risk-006, risk-007, risk-008) stay recorded, unchanged — none is newly discovered or newly closed by this review beyond R1-001, which `review-ledger.md`/`cp-review-gate-r1-001` already closed prior to this stage.

## Budget Notes

- Final review for a 4-stage change (11 changed files, 1593 inserted / 8 deleted lines), reusing the review-ledger's already-corroborated R1-001/R1-002 dispositions and the stage-mode QA's already-verified AC-2/3/6/7/8/16/17/18 evidence as consumed context, while independently re-deriving from fresh source and test reads the specific contracts this handoff called out (AC-1, AC-9..AC-13, AC-20, AC-21) plus the full `npm run check`/`npm test` gate and the complete 21-AC coverage table.
