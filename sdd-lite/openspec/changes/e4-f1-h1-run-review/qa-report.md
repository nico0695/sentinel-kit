# QA Report

## Closeout Digest

- change_name: e4-f1-h1-run-review
- review_mode: final
- reviewed_scope: whole implemented change, ST-1..ST-6 — story diff `git diff origin/main...HEAD -- src/` (8 files, 1589+/3−, all `src/core/run/**`), artifacts at HEAD `f0d66a7`
- verdict: **pass**
- ac_results: 18/18 verified
- completion: allowed — recommend `lifecycle_status: completed`
- findings: 0 blocker · 0 major · 0 minor · 3 info
- commands_rerun_by_qa: `npm run check` (green), `npm test` (198/198), `npx vitest run --project core` (145/145), AC-16 grep (exit 1), `git diff origin/main...HEAD --stat -- src/` (8 files), index.ts full diff audit, `finally` grep on run-review.ts, GitWorktreeError-wrapping source check
- report_path: sdd-lite/openspec/changes/e4-f1-h1-run-review/qa-report.md
- reported_at: 2026-08-09T18:55:00Z
- next_action: mark the change completed and open the story PR (`[E4.F1.H1]`, `Closes #26`) per the workflow contract

## What Was Reviewed And How

Final-mode closeout of the whole change against spec.md (the 18-AC contract as amended by ST-3b), design.md (structural obligations), plan.md (stage scopes and the "traps" list), execution-log.md (ST-1..ST-6), review-ledger.md (full-4r round 1 + ST-3b), and state.yaml. Every one of the 8 diff files was read in full. The four gate commands were re-run by this review, not trusted from the log; the load-bearing test assertions (AC-5 both halves, AC-9/AC-10 direction, AC-12 identity, the 9 AC-6 producers, the R1-001 pin) were verified by reading the test source, and the fixture traps were verified against the wrapped-error source (`create-review-worktree.ts:74`, `cleanup-worktree.ts:54` wrap only `GitWorktreeError`; `createFakeEngine` rejects asynchronously, so AC-4a/AC-10's `EngineInvocationError` expectation is genuine).

Per the orchestrator's handoff, this stage wrote only this report; the `state.yaml` sync (qa_summary, lifecycle_status) is left to the orchestrator.

## AC-by-AC Verification

| AC | Proof location | Verified how | Status |
|---|---|---|---|
| AC-1 | `run-review.test.ts` "resolves the full result shape on the happy path" | Read: asserts state/verdict/worktreePath (vs the fake's recorded `addCalls[0].targetPath`)/diff/prompt sections/engineOutput/usage/failure-absent/cleanup shape. Re-ran suite: green | pass |
| AC-2 | same describe, "state describes the run, not the opinion" | Read: `ok` + `verdict: "request-changes"` — pins the PRD §5.2 distinction, not just reachability | pass |
| AC-3 | "ambiguous (AC-3)" describe, 2 tests | Read: (a) no VERDICT line, (b) two distinct conflicting verdicts; both assert `verdict` absent | pass |
| AC-4 | "engine-error (AC-4)" describe, 2 tests | Read: (a) rejection → `EngineInvocationError` at stage `engine` with `cause` identity-checked; (b) `addError: new GitWorktreeError(...)` → `WorktreeCreationError` at stage `worktree`. Trap honoured: fixture is a real `GitWorktreeError` instance | pass |
| AC-5 | "timeout (AC-5)" test | Read: hanging engine + `fireImmediately` manual scheduler; asserts state, stage, `EngineTimeoutError.timeoutMs`, elapsed << budget, `calls[0].ms === TIMEOUT_MS`, AND `timeoutMs` forwarded into the engine's own `ReviewRequest`. Second half (timer cleared) pinned by the timer-hygiene test (`cancelCount() === 1`, non-firing scheduler) | pass |
| AC-6 | "validation-failed (AC-6)" describe, 9 tests | Read: all 8 spec-enumerated producers (`timeoutMs <= 0`, upper bound with message asserting `2147483647`, empty `harnessType`, relative `repoPath`, `maxLines: 0`, unknown harness, missing skill, non-`inline` contextMode) plus design's 9th (`HarnessValidationError` loader stub). Each asserts state + `failure.stage` + error class | pass |
| AC-7 | "cleanup on every path under policy always" describe, 4 tests | Read: `removeCalls` length 1 on `ok` (path also matched to `result.worktreePath`), `ambiguous`, post-worktree `engine-error`, `timeout`; failed-add exclusion documented in a comment, pinned by AC-4b | pass |
| AC-8 | "cleanup honours the policy" describe, 5 tests | Read: `keep` never removes; `on-success` removes on `ok`, keeps on `engine-error`/`timeout`/`ambiguous` (the R2-002 literal-success pin), each with the full cleanup-shape `toEqual` | pass |
| AC-9 | "keeps state ok when only the cleanup fails" | Read: `removeError` as `GitWorktreeError`; same promise asserted `.resolves` first, then `state: "ok"`, `verdict`, `failure` absent, `cleanup-failed` + `expect.any(WorktreeCleanupError)` | pass |
| AC-10 | "does not swallow the originating engine error…" | Read: engine rejection + `removeError` → `engine-error` AND `failure.error instanceof EngineInvocationError` AND `cleanup-failed` annotation — both directions of annotate-never-override proven | pass |
| AC-11 | "no worktree on a pre-flight failure" describe, 2 tests | Read: unknown harness and `timeoutMs: 0` each assert `addCalls` AND `removeCalls` empty plus `cleanup: { attempted: false }` | pass |
| AC-12 | "never rejects (AC-12)" | Read: bare `TypeError` via `mergeBaseError`; `.resolves` pin plus `failure.error` asserted with `toBe` (identity — preserved, not wrapped) at stage `diff` | pass |
| AC-13 | "E5 validation seam pass-through" describe, 2 tests | Read: `<validation-output>` present with content when supplied, absent when omitted | pass |
| AC-14 | "parse seam injectable" | Read: recording stub returns `comment` against output the built-in reads as `approve`; asserts the override won and the stub received the raw output | pass |
| AC-15 | depcruise inside `npm run check` | **Re-run by QA**: "no dependency violations found (56 modules, 104 dependencies cruised)". Production imports inspected: cross-module only via `../repos|review|workspace/index.js`; timers as globals, never imported | pass |
| AC-16 | grep on `src/core/run/index.ts` | **Re-run by QA**: `grep -E "extractBuiltInVerdict\|defaultTimeoutScheduler\|runEngineWithTimeout\|classifyFailure"` → no match, exit 1. `index.ts` read: doc-comment names the exclusions in prose only | pass |
| AC-17 | `git diff origin/main...HEAD --stat -- src/` | **Re-run by QA**: exactly 8 files, all `src/core/run/**`, 1589+/3−. Full index.ts diff audited: the 3 deletions are the ST-3 doc-comment truth fix; every pre-existing export line survives verbatim (append-only holds in substance) | pass |
| AC-18 | full gate | **Re-run by QA**: `npm run check` green (biome 78 files, tsc clean, depcruise clean); `npm test` 198/198 across 15 files (163 baseline + 35 story tests, counted: 19 ST-4 + 16 ST-5) | pass |

## Contract Fidelity

- **Failure→state mapping**: every row of spec.md's table walked against `classifyFailure` + `executePipeline`. `EngineTimeoutError` → `timeout`; the seven enumerated pre-flight classes → `validation-failed`; `WorktreeCreationError`, `GitMergeBaseError`/`GitDiffError`, `EngineInvocationError`, and bare throwables all reach `engine-error` via the fall-through because the chain tests no base class (confirmed: no `instanceof RunError|WorkspaceError|HarnessError` anywhere). Parse: one distinct match → `ok`+verdict, `null` → `ambiguous`. Exhaustive and faithful.
- **Result contract**: the assembly in `runReview` matches the table field for field — `state` and `cleanup` unconditionally, everything else via conditional spread from `draft`/`outcome` (so `verdict` only on `ok`, `failure` only from the catch, `engineOutput` present on parse-stage faults per the R2-003-corrected row).
- **Cleanup semantics**: `performCleanup` returns `{ attempted: false }` iff `draft.worktreePath` is unset; `reviewSucceeded` is `state === "ok"` (ambiguous-keeps documented at the call site per R2-002 and pinned by the fifth AC-8 test); any throwable becomes the `cleanup-failed` annotation; nothing in it can reach `state` — annotate-never-override holds structurally and behaviourally (AC-9/AC-10).
- **Timeout semantics**: `runEngineWithTimeout` races against a private symbol sentinel, rethrows `EngineTimeoutError` unwrapped (the R1-001 escape hatch, pinned by identity in ST-5), wraps all other rejections with `cause`, attaches the no-op late-rejection handler, and clears the timer in `finally { cancel(); }` on every path. Deterministic via the injected scheduler; no repository test touches the wall clock.

## Design Obligations

All verified against source: non-throwing `executePipeline` with mandatory `TerminalState` in `PipelineOutcome` (compile-time obligation) — yes; single exhaustive `catch (error: unknown)` at one call site — yes (line 378); zero `finally` control flow in `run-review.ts` — grep confirms the only two hits are the doc-comment explaining its absence (the one `finally` in `engine-timeout.ts` is the design-mandated timer cancel); cleanup sequential after the pipeline — yes; `classifyFailure` keyed on error class alone, no base-class test — yes; harness resolution hoisted ahead of worktree creation with `runReview` owning the Map-miss `HarnessNotFoundError` — yes; five-file layout + append-only `index.ts` — yes (diff audited).

## Test Quality

No vacuous test found. The plan's trap list was honoured deliberately: `addError`/`removeError` fixtures are `GitWorktreeError` instances (the only class the workspace use cases wrap — verified in workspace source, so AC-4b/AC-9/AC-10 exercise the wrapped path, not the raw fall-through); the unknown-harness case genuinely exercises `runReview`'s own Map-miss throw; AC-5 asserts both halves plus the forwarded budget; AC-12 and R1-001 use identity (`toBe`), the strongest form. Assertions are on concrete values and whole shapes (`toEqual` on `cleanup`), not mere truthiness.

## Risk Closeout Audit

All CLOSED/RESOLVED/DOWNGRADED claims in `state.yaml` are supported by evidence this review located independently:

- `r-st3-behaviour-unverified`, `r-st2-behaviour-unverified` — CLOSED: 35 story tests re-run green by QA; every claimed coverage point (rejection wrap, race, timer hygiene, escape hatch, extraction via AC-2/AC-3) exists in the suite.
- `r-timeout-overflow-clamp` — CLOSED: `MAX_TIMEOUT_MS` constant + rejection in code; AC-6 test asserts the message names the bound.
- `r-review-doc-drift` — CLOSED: all four corrected doc surfaces read in code (R2-001 `RunCleanupOutcome`, R2-002 call-site comment, R2-003 `engineOutput`/`failure`, R2-004 fourth outcome) plus the matching spec rows.
- `r-dependency-surface`, `r-parse-seam`, `r-cleanup-on-error`, `r-terminal-state-coverage`, `r-validation-failed-semantics`, `r-e5-validation-seam` — closed by spec/design decisions whose artifacts and pinning tests all exist.

Legitimately remaining open, forward-looking with recorded owners — none blocks this change and I agree none should: `r-timeout-budget-precedence` (medium, E4.F2 #28-30; escape hatch pinned here), `r-verdict-provenance` (medium, raise with #27/E3), `r-orphan-sweeper-blind-spot` (medium, E2/E6), `r-harness-load-eager` (medium, E3), `r-unbounded-nonengine-awaits` (medium, git adapter), `r-infrastructure-as-engine-error` (medium, revisit at E6), `r-sync-throw-unwrapped` (low, E4.F2), `r-cleanup-races-abandoned-engine` (low, E4.F2), `r-catchall-masks-bugs` (low, accepted). The remaining plan-time entries (`r-st2-concurrency-stage`, `r-st3-strict-mode-pressure`, `r-test-fake-cross-boundary`, `r-timeout-seam-surface`) are inert now that execution completed without their hazards materializing.

## Review Evidence (ledger)

review-ledger.md consumed: full-4r round 1 on 03bd7cf, verdict `pass_with_warnings`, counts confirmed=0 suspect=0 escalated=0 info=15, **zero open severe findings**. The ST-3b fix round addressed R2-001..R2-004 + R3-004 (verified in code by this review); the remaining info rows are the promoted open risks above. Nothing in the ledger blocks closeout.

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | info | The empty-`repoPath`/`baseRef`/`targetRef` pre-flight producers (run-review.ts:280-291) have no dedicated test — AC-6 as amended does not enumerate them (only empty `harnessType` among the empties), so this is not an AC gap, but three of the six `InvalidRunRequestError` messages are unexercised. Cheap ST-4-style additions if H2 touches this file. |
| 2 | info | Timer-hygiene (`cancelCount() === 1`) is asserted on the happy path only; on the timeout path cancel-after-fire is exercised but not counted. The scheduler contract declares cancel idempotent/safe-after-fire, so nothing is untested that the contract promises — recorded for completeness. |
| 3 | info | `state.yaml` still shows `current_stage: sddl-executor` / `lifecycle_status: implementing` with `sddl-qa-review: in_progress`; per the handoff, this stage did not write state.yaml — the orchestrator must sync `qa_summary`, `stages.sddl-qa-review`, and `lifecycle_status: completed` on accepting this verdict. |

Language and conventions: everything persisted is English; error naming (`Error` suffix, module-owned), no `services/`/`utils/`, ports named by domain role, runtime-agnostic globals only — all hold across the 8 files.

## Verdict

**pass** — the reviewed scope is fully supported by evidence this review reproduced itself: 18/18 acceptance criteria verified (gate commands re-run, not trusted), contract and design obligations hold literally, the test suite is non-vacuous on every trap the plan named, the ledger carries zero open severe findings, and every risk-closeout claim survived audit. Final mode + clean pass: the change may be marked `lifecycle_status: completed`.

## Next Action

Orchestrator: sync state.yaml (qa_summary, `sddl-qa-review: completed`, `lifecycle_status: completed`, `next_action.kind: complete`), then open the story PR — title `[E4.F1.H1] runReview use case`, body referencing `Closes #26` — per workflow contract rules 2 and 4 (both gate commands re-verified green by this review).
