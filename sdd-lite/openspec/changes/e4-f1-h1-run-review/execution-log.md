# Execution Log

## Handoff Digest

- change_name: e4-f1-h1-run-review
- route: continue-lite
- latest_stage_id: ST-4
- latest_stage_status: completed
- latest_files_changed: `src/core/run/__test__/run-review-fixtures.ts` (new, 229 lines), `src/core/run/__test__/run-review.test.ts` (new, 339 lines)
- latest_check_result: `npx vitest run --project core` 129/129 (11 files); `npm run check` green; `npm test` 182/182 (15 files) — 163 baseline + 19 new; `git status` shows only the two new test files
- latest_next_action: request `stage_approval` for ST-5 (cleanup contract + the two seams: AC-7..AC-10, AC-13, AC-14, timer hygiene, the R1-001 escape-hatch pin)

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- lifecycle_status: implementing
- current_stage_id: ST-4
- execution_source: plan-stage-table
- qa_handoff_policy: recommend `sddl-qa-review` when a completed stage needs structured review before continuing
- git_side_effects: none

## Stage Overview

| Stage Id | Goal | Touches Code | Approval Status | Execution Status | Last Updated | Notes |
|---|---|---|---|---|---|---|
| ST-1 | Run-domain leaf types: error family + verdict domain type | yes | approved (`cp-st1-approval`) | completed | 2026-08-09 | Two new leaf files, no importers yet (expected) |
| ST-2 | Cancellable timeout race + naive verdict extraction | yes | approved (`cp-st2-approval`) | completed | 2026-08-09 | Riskiest stage per `plan.md`; behaviour unverified by the repo suite until ST-4/ST-5 |
| ST-3 | `run-review.ts` use case + append-only `index.ts` export block | yes | approved (`cp-st3-approval`) | completed | 2026-08-09 | Largest stage; behaviour still unverified by the suite until ST-4/ST-5 |
| ST-3b | Review-driven doc corrections + `timeoutMs` upper bound (R2-001..R2-004, R3-004) | yes | granted (review_gate) | completed | 2026-08-09 | Amendment stage inserted after the full-4r review of 03bd7cf; comment-only except one validation condition |
| ST-4 | Fixtures + terminal-state coverage | yes | approved (`cp-st4-approval`) | completed | 2026-08-09 | 19 new tests; all five terminal states now proven reachable, incl. the 9 AC-6 cases |
| ST-5 | Cleanup contract + the two seams | yes | pending | pending | — | — |
| ST-6 | Whole-diff verification and PR readiness | no | pending | pending | — | Read-only evidence gate |

## Execution Rules

- Execute one approved stage per invocation.
- Use `plan.md` as the source of truth for stage order, expected scope, and validation.
- Keep prior stage history visible; do not erase earlier entries.
- Use this artifact as the execution ledger and resume anchor for implementation progress.
- Record contradiction, scope drift, and blast-radius findings explicitly when they occur.

## Stage Log

### Stage `ST-1`

- stage_digest: Run-domain leaf types — `run-errors.ts` (`RunError` base + `InvalidRunRequestError`, `EngineInvocationError`, `EngineTimeoutError`) and `verdict.ts` (`Verdict`, `VerdictParser`). No imports, no importers, no tests.
- approval_checkpoint_id: `cp-st1-approval`
- approval_decision_id: user-approved ST-1 at `cp-st1-approval` (recorded in the orchestrator handoff)
- planned_scope: `src/core/run/run-errors.ts` (new), `src/core/run/verdict.ts` (new)
- actual_files_changed: `src/core/run/run-errors.ts` (new, 75 lines), `src/core/run/verdict.ts` (new, 22 lines)
- touches_code: yes
- quick_check_status: passed
- qa_review_status: not_applicable
- execution_status: completed
- next_action: request `stage_approval` for ST-2

#### Planned Work

- Create the run-domain error family mirroring `src/core/workspace/workspace-errors.ts` and `src/core/review/ports/harness-errors.ts`: `Error` suffix, a `RunErrorOptions` type, `cause?: unknown` stored conditionally via `if ("cause" in options)`.
- Create the `Verdict` union (`approve | request-changes | comment`, PRD §9) and the `VerdictParser` seam type (`(output: string) => Verdict | null`).
- Do not touch `index.ts` (ST-3), do not create any other file, do not write tests, do not modify existing files.

#### Preconditions And Sync Checks

- Working tree clean at stage start (`git status --porcelain` empty), branch `claude/validar-e1-preparar-e4-m1xkhl`.
- `src/core/run/` contained exactly `index.ts`, `terminal-state.ts`, `worktree-ref.ts`, `ports/review-engine.ts` — matching `design.md`'s "Affected Areas" assumption that both ST-1 files are new.
- House error pattern re-verified against `workspace-errors.ts` and `git-port-errors.ts` before writing; both use the same base + conditional-`cause` shape.
- `design.md` and `plan.md` agree on ST-1 content; no contradiction found.

#### Changes Applied

- `src/core/run/run-errors.ts`
  - `RunErrorOptions { readonly cause?: unknown }`.
  - `RunError extends Error` — sets `this.name`, stores `cause` only when the key is present.
  - `InvalidRunRequestError extends RunError` — `constructor(message: string)`, no options, mirroring `InvalidWorktreeRequestError` (the pre-flight fault is an expected domain outcome with no underlying cause).
  - `EngineInvocationError extends RunError` — `constructor(message: string, options?: RunErrorOptions)`, preserves the raw rejection in `cause`.
  - `EngineTimeoutError extends RunError` — `constructor(timeoutMs: number, options?: RunErrorOptions)`, exposes `readonly timeoutMs: number`, generates the message internally. Call-site compatible with `design.md`'s `new EngineTimeoutError(timeoutMs)`.
  - Module doc-comment records that the ST-3 classifier keys on the concrete subclasses only, never on the `RunError` base.
- `src/core/run/verdict.ts`
  - `export type Verdict = "approve" | "request-changes" | "comment";`
  - `export type VerdictParser = (output: string) => Verdict | null;`
  - Doc-comments state the state/verdict distinction (PRD §5.2) and the H2 (#27) replacement path.
- No imports in either file — guard 2 (`core-no-io-libs`) and guard 3 (cross-module `index` imports) are trivially satisfied.

#### Scope And Blast Radius Notes

- `git status --porcelain` after the stage lists exactly the two new files; `git diff --stat` is empty (no tracked file modified). No scope drift, no blast-radius expansion.
- Both files are currently orphans (no importers until ST-2/ST-3). Confirmed green: `.dependency-cruiser.cjs` declares no `orphan` rule and `tsconfig.json` sets no `noUnusedLocals`.
- `index.ts` deliberately untouched — the run module's public surface is unchanged by this stage (AC-16 stays an ST-3 concern).

#### Quick Check

- checks_planned: `npm run check`; `npm test` still 163/163; `git diff --stat` + untracked review
- checks_run:
  - `npm run check` → passed (biome: 73 files checked, no fixes; `tsc --noEmit`: clean; `depcruise src`: no dependency violations, 53 modules / 88 dependencies cruised)
  - `npm test` → passed, 14 test files, 163/163 tests, 0 failures (baseline unchanged, as planned for a pre-test stage)
  - `git status --porcelain` / `git diff --stat` → only the two new untracked files
- checks_skipped: none. No stage-specific vitest run exists — ST-1 adds no tests by design; behaviour is proven through `runReview` at ST-4/ST-5.
- findings_summary: no warnings, no failures, no deviations.
- continue_recommendation: continue

#### Evidence

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` | biome 73 files clean · tsc clean · depcruise 53 modules / 88 deps, 0 violations |
| command | `npm test` | 14 files / 163 tests passed — identical to the pre-stage baseline |
| command | `git status --porcelain` | `?? src/core/run/run-errors.ts`, `?? src/core/run/verdict.ts` only |
| file | `src/core/run/run-errors.ts` | Mirrors `workspace-errors.ts` / `git-port-errors.ts` conditional-`cause` pattern |
| file | `src/core/run/verdict.ts` | `Verdict` per PRD §9; `VerdictParser` is the H2 seam |
| reference | `src/core/workspace/workspace-errors.ts` | Pattern source read before writing |

#### Decisions And Blockers

- **A-level (internal, logged):** `EngineTimeoutError` takes `(timeoutMs, options?)` and builds its own message rather than `(message, options?)`. `design.md` fixes only the call form `new EngineTimeoutError(timeoutMs)` and the `readonly timeoutMs` field; both hold. `options?` is additive and unused at the design's call site.
- **A-level (internal, logged):** the shared options type is named `RunErrorOptions`, matching `WorkspaceErrorOptions` / `GitErrorOptions` / `HarnessErrorOptions`.
- **A-level (internal, logged):** doc-comment wording and file-level module comments follow the `git-port-errors.ts` / `worktree-ref.ts` house style. No public type or signature from `design.md` was altered.
- Blockers: none. No contradiction between `design.md` and `plan.md` for this stage.

#### User-Facing Summary

- ST-1 is done: the run module now has its typed error family and the `Verdict` / `VerdictParser` domain types, written to match the existing house error pattern exactly.
- Quality gate is green and the test suite is untouched at 163/163, as planned for a pre-test stage.
- Nothing outside `src/core/run/` was touched, and `index.ts` stays unchanged until ST-3.
- Next: approve ST-2 (`engine-timeout.ts` + `builtin-verdict-extraction.ts`) — the plan flags it as the riskiest stage, being the only concurrency in the core.

### Stage `ST-2`

- stage_digest: The two behavioural leaves — `engine-timeout.ts` (`TimeoutScheduler`, `defaultTimeoutScheduler`, `runEngineWithTimeout`) and `builtin-verdict-extraction.ts` (`extractBuiltInVerdict`). Both written exactly as fixed in `design.md`. No importers until ST-3, no tests until ST-4/ST-5.
- approval_checkpoint_id: `cp-st2-approval`
- approval_decision_id: user-approved ST-2 at `cp-st2-approval` (recorded in the orchestrator handoff and in commit `25f3b62`)
- planned_scope: `src/core/run/engine-timeout.ts` (new), `src/core/run/builtin-verdict-extraction.ts` (new)
- actual_files_changed: `src/core/run/engine-timeout.ts` (new, 105 lines), `src/core/run/builtin-verdict-extraction.ts` (new, 39 lines)
- touches_code: yes
- quick_check_status: passed
- qa_review_status: recommended_before_st3 is NOT required; QA deferred to the ST-6 / final gate (the stage is additive, has no importers, and its behaviour is asserted at ST-4/ST-5)
- execution_status: completed
- next_action: request `stage_approval` for ST-3

#### Planned Work

- `engine-timeout.ts`: the cancellable timeout seam — the `TimeoutScheduler` type, a `defaultTimeoutScheduler` backed by the global `setTimeout`/`clearTimeout`, and `runEngineWithTimeout` racing the invocation against a module-private `TIMED_OUT` symbol, with `void pending.catch(() => {})` for late rejections and `finally { cancel(); }` for timer hygiene.
- `builtin-verdict-extraction.ts`: `extractBuiltInVerdict` — anchored, case-sensitive, trimmed `VERDICT: approve|request-changes|comment` scan with NO normalization (no ANSI stripping, no fence unwrapping, no case folding). Exactly one distinct match ⇒ that verdict; zero or two distinct ⇒ `null` ⇒ `ambiguous`.
- Do not touch `index.ts` (ST-3), do not create `run-review.ts` (ST-3), do not write tests (ST-4/ST-5), do not modify the ST-1 files or any other existing file.

#### Preconditions And Sync Checks

- Working tree clean at stage start (`git status --porcelain` empty); ST-1 is committed as `ec74f3f`, the ST-2 approval as `25f3b62`. Branch `claude/validar-e1-preparar-e4-m1xkhl`.
- ST-1 outputs re-read before writing: `EngineTimeoutError(timeoutMs, options?)` and `EngineInvocationError(message, options?)` match the call forms `design.md` uses; `Verdict` is the three-value union the regex enumerates.
- `ReviewResult` re-read from `src/core/run/ports/review-engine.ts` — same module, so the type-only import needs no `index.ts` hop (guard 3 applies to CROSS-module imports only).
- `design.md` (timeout seam + extraction sections) and `plan.md` (ST-2 row, executor notes 1–2, rollback note) agree on every detail of this stage. No contradiction found.
- Both files are orphans until ST-3 — re-confirmed green: `.dependency-cruiser.cjs` declares no `orphan` rule, `tsconfig.json` sets no `noUnusedLocals`.

#### Changes Applied

- `src/core/run/engine-timeout.ts`
  - `export type TimeoutScheduler = (ms: number, onElapsed: () => void) => () => void;` — the injectable, cancellable seam.
  - `export const defaultTimeoutScheduler: TimeoutScheduler` — `setTimeout` / `clearTimeout` used as runtime GLOBALS, never imported (executor note 2; `Date.now()` in `create-review-worktree.ts` is the precedent).
  - `const TIMED_OUT = Symbol("engine-timed-out")` — module-private `unique symbol`, so `Promise.race`'s winner is discriminated with no assumption about `ReviewResult`'s shape.
  - `export async function runEngineWithTimeout(invoke, timeoutMs, schedule)` — `const pending = invoke()`, `void pending.catch(() => {})`, the expiry promise whose executor runs synchronously and assigns `cancel`, then `try { race } catch { rethrow EngineTimeoutError, else wrap in EngineInvocationError with cause } finally { cancel(); }`.
  - File-level `export` on all three (executor note 1): "module-private" means not re-exported from `index.ts` (AC-16), which stays an ST-3 concern.
- `src/core/run/builtin-verdict-extraction.ts`
  - `const VERDICT_LINE = /^VERDICT:\s*(approve|request-changes|comment)$/` applied to each `output.split("\n")` line after `trim()`.
  - `extractBuiltInVerdict` collects distinct matches into a `Set<Verdict>`; returns the value only when `found.size === 1` (the `only !== undefined` guard is required by `noUncheckedIndexedAccess`).
  - Doc-comment states the Non-Goals boundary explicitly: hardening is `[E4.F1.H2]` (#27) through the `deps.parseVerdict` seam.
- Imports are intra-module only (`./run-errors.js`, `./verdict.js`, `./ports/review-engine.js`), so guards 1–5 are satisfied by construction; `depcruise src` confirms.

#### Scope And Blast Radius Notes

- `git status --porcelain` after the stage lists exactly the two new untracked files; `git diff --stat` is empty (no tracked file modified). No scope drift, no blast-radius expansion.
- `index.ts` deliberately untouched; the module's public surface is still unchanged at the end of ST-2.
- The `d-change-scope` boundary was actively defended: the extraction was NOT hardened (no ANSI/markdown/case handling), even though the temptation is one regex flag away. That work belongs to #27.

#### Quick Check

- checks_planned: `npm run check`; `npm test` still 163/163; `git status --porcelain` / `git diff --stat` scope review
- checks_run:
  - `npm run check` → passed (biome: 75 files checked, no fixes; `tsc --noEmit`: clean; `depcruise src`: no dependency violations, 55 modules / 91 dependencies cruised — up from 53/88, i.e. exactly the two new modules and their intra-module edges). Notably `depcruise` confirms no `node:timers` / `timers` import slipped in.
  - `npm test` → passed, 14 test files, 163/163, 0 failures — baseline unchanged, as planned for a pre-test stage.
  - `git status --porcelain` → `?? src/core/run/builtin-verdict-extraction.ts`, `?? src/core/run/engine-timeout.ts` only; `git diff --stat` empty.
  - Out-of-repo behavioural smoke (see "Decisions" below): 21/21 assertions PASS, no unhandled rejection.
- checks_skipped: none available in-repo. **ST-2's behaviour is NOT exercised by any repository test at this point** — by design, per the plan's ST-2 validation column: `runEngineWithTimeout` and `extractBuiltInVerdict` are proven through `runReview` at ST-4 (AC-3, AC-5) and ST-5 (timer hygiene, AC-14). This stage's green is therefore weaker than the other stages'.
- findings_summary: one biome formatting fix applied during the stage (the `TimeoutScheduler` type signature had to be broken across lines); no warnings, no failures, no design deviations.
- continue_recommendation: continue

#### Evidence

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` | biome 75 files clean · tsc clean · depcruise 55 modules / 91 deps, 0 violations |
| command | `npm test` | 14 files / 163 tests passed — identical to the pre-stage baseline |
| command | `git status --porcelain` | the two new untracked files only; `git diff --stat` empty |
| file | `src/core/run/engine-timeout.ts` | Race, sentinel symbol, late-rejection handler, `finally { cancel(); }` — as fixed in `design.md` |
| file | `src/core/run/builtin-verdict-extraction.ts` | Naive anchored scan; no normalization (Non-Goals boundary against #27) |
| smoke | scratchpad `st2-smoke.ts` (outside the repo, not committed) | 21/21 PASS: 9 extraction cases + happy path / timeout / rejection / sync-throw / late-rejection, each asserting the cancel count |

#### Decisions And Blockers

- **A-level (internal, logged):** the race sentinel is named `TIMED_OUT` with description `"engine-timed-out"`; the module doc-comment and per-symbol JSDoc follow the `create-review-worktree.ts` / `run-errors.ts` house style. No public type or signature from `design.md` was altered.
- **A-level (internal, logged):** the `TimeoutScheduler` type signature is written across three lines. Not a choice — biome's formatter rejects the single-line form from `design.md` (81 chars). Semantically identical.
- **A-level (internal, logged):** the two intentionally empty callbacks (`pending.catch`, the initial `cancel`) carry explanatory comments instead of bare `{}`, so a reader does not read them as oversights.
- **A-level (internal, logged):** because no repository test covers this stage, the code was smoke-tested out-of-repo — the four run-module files were COPIED into the session scratchpad (`.js` specifiers rewritten to `.ts` so plain `node --experimental-strip-types` resolves them) and driven by a throwaway script. Nothing was added to, or changed in, the repository; no test file was created (that is ST-4/ST-5 scope). Recorded because the "checks_run" line above cites its result.
- **Observation, not a deviation — carry to ST-3/QA:** `const pending = invoke()` sits OUTSIDE the `try`, exactly as `design.md` fixes it. Consequence: if an engine adapter throws SYNCHRONOUSLY instead of returning a rejected promise, the raw throwable escapes `runEngineWithTimeout` un-wrapped (confirmed by smoke) rather than becoming an `EngineInvocationError`. This breaks no acceptance criterion — `executePipeline`'s catch-all still yields `state: "engine-error"` with `stage: "engine"` (AC-4a, AC-12), and AC-10 asserts `EngineInvocationError` only for an async rejection, which is what `createFakeEngine` produces. Flagged so review does not read it as an accident. Also note the timer is never scheduled on that path, so timer hygiene is unaffected.
- **STOP rule outcome:** not triggered. The race satisfies both halves of the ST-2 obligation — `EngineTimeoutError` is reachable deterministically through a manual scheduler with zero wall-clock waiting (AC-5's mechanism), and `finally { cancel(); }` clears the timer on all four exit paths (success, timeout, rejection, sync-throw-before-scheduling), verified by cancel-count assertions. Vitest fake timers were not used and were never needed.
- Blockers: none.

#### User-Facing Summary

- ST-2 is done: the run module now has its cancellable timeout seam and the deliberately naive built-in verdict extraction, both written exactly as `design.md` fixes them.
- The riskiest part — the promise race — satisfies both requirements the plan set for it: a timeout is reachable without waiting on the real clock, and the timer is cleared on every exit path. No fallback to fake timers was needed.
- Quality gate is green and the suite is untouched at 163/163. Be aware that this stage adds no tests, so its behaviour is only proven once ST-4/ST-5 land; an out-of-repo smoke run (21/21) was used as an interim sanity check.
- Nothing outside `src/core/run/` was touched, and `index.ts` stays unchanged until ST-3.
- Next: approve ST-3 (`run-review.ts` + the append-only `index.ts` export block) — the largest stage in the change.

### Stage `ST-3`

- stage_digest: The use case and the module's public surface — `run-review.ts` (co-located request/deps/result types, `runReview`, and the private `executePipeline` / `classifyFailure` / `performCleanup`) plus the append-only `index.ts` export block. Written exactly to `design.md`'s interface block; no public type or signature altered.
- approval_checkpoint_id: `cp-st3-approval`
- approval_decision_id: user-approved ST-3 at `cp-st3-approval` (recorded in the orchestrator handoff)
- planned_scope: `src/core/run/run-review.ts` (new), `src/core/run/index.ts` (modified, append-only)
- actual_files_changed: `src/core/run/run-review.ts` (new, 418 lines), `src/core/run/index.ts` (modified, +30/-3 lines)
- touches_code: yes
- quick_check_status: passed
- qa_review_status: deferred to the ST-6 / final gate — ST-3's behaviour is not exercised by any repository test yet, so a structured review is more informative once ST-4/ST-5 land
- execution_status: completed
- next_action: request `stage_approval` for ST-4

#### Planned Work

- `run-review.ts`: the public shapes (`RunReviewRequest`, `RunReviewDeps`, `RunReviewResult`, `RunFailure`, `RunStage`, `RunCleanupReason`, `RunCleanupOutcome`), the public `runReview`, and the three module-private units `executePipeline`, `classifyFailure`, `performCleanup`, plus the private `RunDraft` / `PipelineOutcome`.
- `index.ts`: append the use case, its public types, `TimeoutScheduler`, the run error family and the verdict types. Do NOT export the built-in extraction, the default scheduler, the race helper or the classifier (AC-16).
- Do not write tests or fixtures (ST-4/ST-5) and do not modify any other file.

#### Preconditions And Sync Checks

- Working tree clean at stage start (`git status --porcelain` empty); ST-1 and ST-2 are committed. Branch `claude/validar-e1-preparar-e4-m1xkhl`.
- All four ST-1/ST-2 files re-read before writing. Call forms confirmed: `new InvalidRunRequestError(message)`, `new EngineTimeoutError(timeoutMs)`, `runEngineWithTimeout(invoke, timeoutMs, schedule)`, `extractBuiltInVerdict(output) => Verdict | null`.
- All five consumed use cases re-read from source, not from memory, so the composition matches reality:
  - `createReviewWorktree({ repoPath, commitish, branchLabel }, { git, worktreesDir, now? })`
  - `computeReviewDiff({ repoPath, baseRef, targetRef, limits? }, { git })`
  - `assemblePrompt({ resolvedHarness, diff, validationOutput? })`
  - `loadHarnesses(deps, extraSkills?) => Promise<Map<string, ResolvedHarness>>` — **re-verified**: it does NOT throw on an unknown harness type, so the lookup miss is `runReview`'s own responsibility (load-bearing for AC-6 and AC-11).
  - `cleanupWorktree({ repoPath, worktreePath, policy, reviewSucceeded }, { git })`
- Error constructors re-verified: `HarnessNotFoundError(type, options?)` — the one-argument call form used at the harness stage is valid.
- `design.md` and `plan.md` agree on every element of this stage. No contradiction found; the STOP rule was not triggered.

#### Changes Applied

- `src/core/run/run-review.ts`
  - **`runReview`** — creates the `RunDraft`, awaits `executePipeline`, then awaits `performCleanup` SEQUENTIALLY (no `finally`, per executor note 3), then assembles the wide result with conditional spreads (executor note 4). `reviewSucceeded` is passed as `outcome.state === "ok"`, so `on-success` keeps the worktree for `ambiguous` too.
  - **`executePipeline`** — `let stage: RunStage` reassigned before each step; one `try` over stages 1–8; one `catch (error: unknown) { return { state: classifyFailure(error), failure: { stage, error } }; }`. Its return type carries a mandatory `TerminalState`, so "exactly one terminal state" is a compile-time obligation, and the catch-all makes escape impossible.
  - Stage 1 (request): empty-string checks on `repoPath` / `baseRef` / `targetRef` / `harnessType` plus `Number.isFinite(timeoutMs) && timeoutMs > 0`. It deliberately does NOT re-validate path absoluteness — the spec maps a relative `repoPath` to the worktree/diff stage, and duplicating the rule would silently relabel the stage.
  - Stage 2 (harness) hoisted ahead of worktree creation: `loadHarnesses(deps.harnesses)` then `harnesses.get(request.harnessType)`; a miss throws `new HarnessNotFoundError(request.harnessType)`. An unknown harness therefore leaves no orphan worktree (AC-11).
  - Stage 7 (engine): `runEngineWithTimeout(() => deps.engine.review({ worktree: { path }, prompt, timeoutMs }), request.timeoutMs, deps.scheduleTimeout ?? defaultTimeoutScheduler)`. `timeoutMs` is forwarded into the `ReviewRequest` as well, so real adapters can self-enforce.
  - Stage 8 (parse): `(deps.parseVerdict ?? extractBuiltInVerdict)(output)`; `null` ⇒ `{ state: "ambiguous" }`, otherwise `{ state: "ok", verdict }`.
  - **`classifyFailure`** — total, pure, keyed on the error class ALONE. `EngineTimeoutError` ⇒ `timeout`; the seven enumerated pre-flight classes ⇒ `validation-failed`; everything else ⇒ `engine-error`. It never tests `RunError`, `WorkspaceError` or `HarnessError`, so `WorktreeCreationError` correctly falls through to `engine-error` (AC-4b).
  - **`performCleanup`** — returns `{ attempted: false }` when no worktree exists; otherwise calls `cleanupWorktree` with `policy: request.cleanupPolicy ?? "always"` and converts any throwable into `{ attempted: true, removed: false, reason: "cleanup-failed", error }`. It cannot throw, cannot rethrow, and receives `reviewSucceeded` as an already-computed read-only boolean, so it has no channel to the terminal state.
  - E5 seam: `request.validationOutput` forwarded verbatim to `assemblePrompt` via a conditional spread. No E5 import, no new machinery.
  - Cross-module imports go through public indexes only: `../repos/index.js`, `../review/index.js`, `../workspace/index.js`. Intra-module imports are relative file specifiers, which guard 3 permits.
- `src/core/run/index.ts` (append-only)
  - Added: `TimeoutScheduler`; `RunError`, `RunErrorOptions`, `InvalidRunRequestError`, `EngineInvocationError`, `EngineTimeoutError`; `runReview` plus `RunReviewRequest`, `RunReviewDeps`, `RunReviewResult`, `RunFailure`, `RunStage`, `RunCleanupOutcome`, `RunCleanupReason`; `Verdict`, `VerdictParser`.
  - Not added (AC-16): the built-in verdict extraction, the default timeout scheduler, the engine race helper and the failure classifier.
  - The three pre-existing export statements are unchanged in content and keep their relative order.

#### Scope And Blast Radius Notes

- `git status --porcelain` after the stage: `?? src/core/run/run-review.ts` and ` M src/core/run/index.ts` only. `git diff --stat` reports `src/core/run/index.ts | 33 +++---` and nothing else. AC-17 holds.
- No workspace / review / repos file, no `ReviewEngine` port, no `FakeEngine` change. No test file created. No git side effects.
- `depcruise src` grew from 55 modules / 91 dependencies (post-ST-2) to 56 / 104 — exactly the new module plus its 13 edges — with zero violations, which is AC-15 on production files.

#### Quick Check

- checks_planned: `npm run check`; `npm test` still 163/163; the AC-16 grep on `index.ts`; `git status --porcelain` / `git diff --stat` scope review
- checks_run:
  - `npm run check` → passed (biome: 76 files checked, no fixes; `tsc --noEmit`: clean; `depcruise src`: no dependency violations, 56 modules / 104 dependencies cruised)
  - `npm test` → passed, 14 test files, 163/163, 0 failures — baseline unchanged, as planned for a pre-test stage
  - `grep -E "extractBuiltInVerdict|defaultTimeoutScheduler|runEngineWithTimeout|classifyFailure" src/core/run/index.ts` → no output, exit 1 (AC-16 satisfied)
  - `git status --porcelain` → the one new file and the one modified file only; `git diff --stat` → `index.ts` only
- checks_skipped: none available in-repo. **ST-3's behaviour is still unverified by the test suite.** `npm run check` proves types, the strict-mode result shape and the architecture guards — it proves no behaviour at all. Every behavioural acceptance criterion (AC-1..AC-14) is exercised for the first time at ST-4/ST-5. Stated plainly so the green above is not over-read.
- findings_summary: two biome formatting/ordering fixes applied during the stage (see decisions); no warnings, no failures, no design deviations.
- continue_recommendation: continue

#### Evidence

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` | biome 76 files clean · tsc clean · depcruise 56 modules / 104 deps, 0 violations |
| command | `npm test` | 14 files / 163 tests passed — identical to the pre-stage baseline |
| command | AC-16 grep on `src/core/run/index.ts` | no output, exit 1 |
| command | `git status --porcelain` / `git diff --stat` | `?? run-review.ts`, ` M index.ts`; diff touches `index.ts` only |
| file | `src/core/run/run-review.ts` | Non-throwing pipeline, sequential cleanup, class-keyed total classifier |
| file | `src/core/run/index.ts` | Append-only block; AC-16 exclusions intact |
| reference | `src/core/workspace/create-review-worktree.ts`, `cleanup-worktree.ts`, `compute-review-diff.ts`, `src/core/review/assemble-prompt.ts`, `load-harnesses.ts` | Signatures re-read from source before composing |

#### Decisions And Blockers

- **A-level (internal, logged):** biome's `organizeImports` assist sorts `export … from` statements by module specifier, so the four new statements were inserted in sorted positions rather than concatenated at the end of the file. This satisfies the append-only rule as written — the three pre-existing exports are untouched and keep their relative order — while keeping `npm run check` green. Appending literally at the end fails `biome check`.
- **A-level (internal, logged):** `index.ts`'s module doc-comment was updated. The previous text said "Public API (types only in H1) … The runReview use case lands in E4.F1.x", which this stage makes false. The replacement also records the AC-16 exclusions. Comment-only; no export line was rewritten.
- **A-level (internal, logged):** that doc-comment names the four excluded units in PROSE ("the built-in verdict extraction, the default timeout scheduler, the engine race helper and the failure classifier") rather than by identifier. A first draft used the identifiers and made the AC-16 grep match its own comment — a false positive that would fail the ST-6 gate. The prose form keeps the grep authoritative.
- **A-level (internal, logged):** `RunCleanupReason` is formatted across three lines and `RunStage` one member per line — biome's formatter rejects the single-line forms from `design.md` (>80 chars). Semantically identical.
- **A-level (internal, logged):** `draft.usage` is assigned inside an `if (engineResult.usage !== undefined)` guard rather than unconditionally. `exactOptionalPropertyTypes: true` rejects assigning `ReviewUsage | undefined` to an optional property. Internal (`RunDraft` is private); the public `RunReviewResult` shape from `design.md` is unchanged.
- **A-level (internal, logged):** stage-1 validation is written inline in `executePipeline` rather than extracted into a helper, matching how `createReviewWorktree` and `computeReviewDiff` write their own pre-flight checks.
- **No deviation from `design.md`'s public interface block.** Every public type and the `runReview` signature are byte-equivalent in meaning to the design; strict mode was absorbed entirely by conditional spreads and internal guards, never by widening a public type. The deviation rule for this stage did not fire.
- **Carried forward from ST-2, unchanged:** a synchronously-throwing engine adapter escapes `runEngineWithTimeout` un-wrapped. `executePipeline`'s catch-all still yields `engine-error` with `stage: "engine"`, so no acceptance criterion is affected; AC-10 asserts `EngineInvocationError` only for an async rejection.
- Blockers: none.

#### User-Facing Summary

- ST-3 is done: `runReview` exists, and the run module's public surface now exposes it along with its request/deps/result types, the error family and the two seams.
- The two structural obligations are implemented literally: the pipeline cannot throw (its return type forces a terminal state, and one exhaustive catch absorbs everything else), and cleanup runs sequentially after it — no `finally` anywhere — so it can annotate but never override.
- Quality gate is green, the suite is untouched at 163/163, and the AC-16 grep is clean. Be clear-eyed about what that proves: types, the strict-mode result shape and the architecture guards. **No behaviour is verified yet** — every behavioural criterion first runs at ST-4/ST-5.
- Nothing outside `src/core/run/` was touched, and the three pre-existing exports in `index.ts` were left exactly as they were.
- Next: approve ST-4 (fixtures + the terminal-state half of the test suite) — the stage that finally makes the last three stages provable.

### Stage `ST-3b`

- stage_digest: Review-driven amendment stage — the four deterministic doc corrections (R2-001, R2-002, R2-003, R2-004) and the `timeoutMs` upper bound (R3-004) from the full-4r ledger of commit 03bd7cf, landed before ST-4 so tests are written against corrected contracts. Comment-only except one module-level constant and one validation condition; plus the two same-authority spec.md consistency edits (AC-6 producer, `engineOutput` row).
- approval_checkpoint_id: review_gate (post-review checkpoint after ST-3)
- approval_decision_id: user granted `stage_approval` at the review_gate for exactly this scope — the comment corrections plus the single validation condition; anything beyond is a deviation requiring STOP (recorded verbatim in `plan.md`, ST-3b stage detail)
- planned_scope: `src/core/run/run-review.ts` (doc-comments + one constant + one condition), `src/core/run/engine-timeout.ts` (doc-comment), `spec.md` (AC-6 line + `engineOutput` row)
- actual_files_changed: `src/core/run/run-review.ts` (+40/−2), `src/core/run/engine-timeout.ts` (+5/−1), `sdd-lite/openspec/changes/e4-f1-h1-run-review/spec.md` (+2/−2)
- touches_code: yes
- quick_check_status: passed
- qa_review_status: not_applicable — the stage exists BECAUSE of a structured review; each edit's authority is a ledger row
- execution_status: completed
- next_action: request `stage_approval` for ST-4

#### Planned Work

- Land the five ledger findings exactly as fixed in the ST-3b stage detail of `plan.md`: R2-001 (`RunCleanupOutcome` doc-comment), R2-002 (`reviewSucceeded` call-site comment), R2-003 (`engineOutput` / `failure` doc correction), R2-004 (`engine-timeout.ts` fourth outcome), R3-004 (`MAX_TIMEOUT_MS` constant + upper-bound rejection).
- Keep spec.md and code from drifting: add the upper-bound producer to AC-6 and apply the same R2-003 wording fix to the result-contract `engineOutput` row.
- No public type changes, no tests (the AC-6 upper-bound case is ST-4 scope), no `index.ts` change, no other file.

#### Preconditions And Sync Checks

- Working tree clean at stage start (`git status --porcelain` empty), branch `claude/validar-e1-preparar-e4-m1xkhl`; ST-3 committed as part of 03bd7cf, the review target.
- `review-ledger.md` rows R2-001..R2-004 and R3-004 re-read as the authority on what each correction must say; `plan.md`'s ST-3b stage detail re-read as the work order. No contradiction between them.
- `cleanup-worktree.ts:40-46` re-read before writing R2-001 so the doc names the real early returns and their reasons: `policy-keep` (policy `keep`) and `review-failed` (`on-success` + `!reviewSucceeded`) — both return without invoking `git.worktreeRemove`.
- spec.md Cleanup semantics (the "literal reading of success" rationale) re-read before writing the R2-002 comment so the citation is accurate.
- R3-004's proof re-checked against the ledger: `setTimeout(f, 2147483648)` → TimeoutOverflowWarning, fires ~16ms (empirically verified by the R4 lens on this machine).

#### Changes Applied

- `src/core/run/run-review.ts`
  - **R2-001** — `RunCleanupOutcome` now carries the doc-comment it lacked (it was the only public result member without one): `attempted: true` means a worktree existed and `cleanupWorktree` was consulted, INCLUDING the `keep` and `on-success`-after-a-failed-review early returns where git is never invoked — so `attempted: true, removed: false` does not by itself mean "tried and failed"; `reason` is the discriminator. `attempted: false` means no worktree was ever created.
  - **R2-002** — the `reviewSucceeded: outcome.state === "ok"` call site now states the deliberate policy: `ambiguous` counts as not-succeeded for cleanup purposes, so under `on-success` the worktree is retained for inspection; rationale cited to spec.md (Cleanup semantics — literal reading of "success"; keeping a worktree is cheap and reversible, deleting one someone wanted is not).
  - **R2-003** — the `engineOutput` doc-comment now says "present whenever the ENGINE stage succeeded, not only on `ok`/`ambiguous`: a parse-stage fault yields `engine-error` with `engineOutput` AND `failure` both set"; the neighbouring `failure` comment adds "not exclusive with `engineOutput`" so the pair no longer implies a strict partition.
  - **R3-004** — new module-level `const MAX_TIMEOUT_MS = 2_147_483_647` (doc-comment: Node's `setTimeout` upper bound; larger values overflow the signed 32-bit timer and are clamped to 1 ms). The `timeoutMs` pre-flight gains one condition, in the style of its neighbours: `request.timeoutMs > MAX_TIMEOUT_MS` ⇒ `InvalidRunRequestError` with a message naming the bound. No public type changed.
- `src/core/run/engine-timeout.ts`
  - **R2-004** — the "Outcomes:" doc-list on `runEngineWithTimeout` names the fourth outcome it previously denied: a synchronously-throwing `invoke` escapes UNWRAPPED (not as `EngineInvocationError`) because `invoke()` runs outside the `try`; referenced to the recorded risk `r-sync-throw-unwrapped` and to the sole call site's catch-all absorbing it as `engine-error`. Behaviour unchanged — only the doc gap closed.
- `sdd-lite/openspec/changes/e4-f1-h1-run-review/spec.md`
  - AC-6 producer enumeration extended with `timeoutMs > 2147483647` (Node's `setTimeout` upper bound), cited as R3-004, review-driven A-level amendment — so AC-6 now enumerates 8 producers / 9 test cases for ST-4.
  - Result-contract `engineOutput` row corrected with the same R2-003 wording: presence is "once stage 7 (engine) succeeded", meaning notes the `engine-error` + `engineOutput` + `failure` overlap. Nothing else in spec.md changed.

#### Scope And Blast Radius Notes

- `git diff --stat` after the stage: `run-review.ts`, `engine-timeout.ts`, `spec.md`, `execution-log.md` — exactly the frozen scope, nothing else. `index.ts` untouched (AC-16 grep still empty).
- The only behaviour change in the whole stage is the one new rejection: a `timeoutMs` above 2^31−1 now resolves as `validation-failed` at stage 1 instead of producing an immediate bogus `timeout` that abandons the engine and (under `always`) deletes its worktree.
- The scope-freeze was defended: R1-00x / R3-00x / R4-00x findings promoted to `state.yaml` open_risks were NOT acted on here — they are forward-looking constraints owned by E4.F2 / E5 / E6 per the ledger.

#### Quick Check

- checks_planned: `npm run check`; `npm test` still 163/163 (no new tests by design); AC-16 grep on `index.ts`; `git diff --stat` scope review
- checks_run:
  - `npm run check` → passed (biome: 76 files checked, no fixes; `tsc --noEmit`: clean; `depcruise src`: no dependency violations, 56 modules / 104 dependencies cruised — identical to post-ST-3, as expected for a stage adding no imports)
  - `npm test` → passed, 14 test files, 163/163, 0 failures — baseline unchanged; the AC-6 upper-bound case is deliberately NOT written here (ST-4 owns it)
  - `grep -nE "extractBuiltInVerdict|defaultTimeoutScheduler|runEngineWithTimeout|classifyFailure" src/core/run/index.ts` → no output, exit 1 (AC-16 satisfied)
  - `git diff --numstat` → `run-review.ts` +40/−2, `engine-timeout.ts` +5/−1, `spec.md` +2/−2, `execution-log.md` (this entry) only
- checks_skipped: none. The new rejection condition is unverified by any repository test until ST-4 — same standing caveat as ST-1..ST-3, and the reason the plan sequences ST-3b before ST-4.
- findings_summary: no warnings, no failures, no deviations. All five ledger obligations landed; the review_gate scope freeze held.
- continue_recommendation: continue

#### Evidence

| Kind | Reference | Notes |
|---|---|---|
| command | `npm run check` | biome 76 files clean · tsc clean · depcruise 56 modules / 104 deps, 0 violations |
| command | `npm test` | 14 files / 163 tests passed — identical to the pre-stage baseline |
| command | AC-16 grep on `src/core/run/index.ts` | no output, exit 1 |
| command | `git diff --numstat` | the four in-scope files only |
| file | `src/core/run/run-review.ts` | R2-001, R2-002, R2-003 doc corrections + R3-004 constant and condition |
| file | `src/core/run/engine-timeout.ts` | R2-004 fourth-outcome doc, citing `r-sync-throw-unwrapped` |
| file | `sdd-lite/openspec/changes/e4-f1-h1-run-review/spec.md` | AC-6 producer + `engineOutput` row, both citing their ledger ids |
| reference | `review-ledger.md` rows R2-001..R2-004, R3-004 | Authority for every edit's wording |
| reference | `src/core/workspace/cleanup-worktree.ts:40-46` | Early returns re-read so R2-001's wording matches reality |

#### Decisions And Blockers

- **A-level (internal, logged):** `MAX_TIMEOUT_MS` is written `2_147_483_647` with numeric separators, matching modern house style, and placed in the module's internal (non-exported) region next to `RunDraft` — it is an implementation bound, not part of the public request contract, and AC-16's spirit (no internal machinery on the public surface) extends to it.
- **A-level (internal, logged):** the upper-bound check is a SEPARATE condition with its own message rather than folded into the existing finiteness/positivity condition — each pre-flight fault names its own violated rule, matching the one-check-one-message style of the four preceding conditions.
- **A-level (internal, logged):** the rejection message interpolates the constant (`timeoutMs must not exceed 2147483647 (Node's setTimeout upper bound)`) so message and bound cannot drift.
- **A-level (review-driven, logged, cite R3-004):** spec.md AC-6 amended with the upper-bound producer — the exact one-line spec amendment the plan authorizes, so spec and code do not drift.
- **A-level (review-driven, logged, cite R2-003):** spec.md's result-contract `engineOutput` row corrected under the same authority as the code doc-comment it mirrored — leaving it stale would have re-introduced in the spec the exact contradiction the ledger row fixed in the code.
- **A-level (internal, logged):** the R2-004 amendment keeps the original three outcomes verbatim and appends the fourth as a continuation of the same list, so the diff is additive and the contract's existing guarantees are visibly unchanged.
- Blockers: none. The frozen scope was sufficient for all five findings; the STOP/rollback path was not needed.

#### User-Facing Summary

- ST-3b is done: the five cheap, deterministic review findings are landed — four documentation corrections that make the public contracts say what the code actually does, and one real fix: `timeoutMs` above Node's `setTimeout` limit (2^31−1 ms) is now rejected as `validation-failed` instead of silently becoming an instant bogus timeout that could delete a worktree.
- spec.md was kept in lockstep: AC-6 now lists the new producer (so ST-4 writes 9 validation cases, not 8) and the `engineOutput` row carries the corrected presence rule.
- Quality gate is green, the suite is untouched at 163/163, and the AC-16 grep is clean. The new rejection is first exercised by a test at ST-4, by design.
- Nothing beyond the frozen scope was touched; the deeper review findings (dual-budget precedence, orphan-recovery blind spot, etc.) remain open risks owned by later epics, exactly as the ledger assigned them.
- Next: approve ST-4 (fixtures + the terminal-state suite, including the new upper-bound case).

### Stage `ST-4`

- stage_digest: Fixtures + terminal-state coverage — `run-review-fixtures.ts` (request/deps builders over the sanctioned fakes, manual `TimeoutScheduler`, request-recording hanging engine, validation-failing harness loader) and `run-review.test.ts` (AC-1, AC-2, AC-3a/b, AC-4a/b, AC-5, the nine AC-6 producers, AC-11, AC-12). The first stage that exercises any run-module behaviour: 19 new tests, all green on first run.
- approval_checkpoint_id: `cp-st4-approval`
- approval_decision_id: user-approved ST-4 at `cp-st4-approval` (recorded in the orchestrator handoff)
- planned_scope: `src/core/run/__test__/run-review-fixtures.ts` (new), `src/core/run/__test__/run-review.test.ts` (new)
- actual_files_changed: `src/core/run/__test__/run-review-fixtures.ts` (new, 229 lines), `src/core/run/__test__/run-review.test.ts` (new, 339 lines)
- touches_code: yes
- quick_check_status: passed
- qa_review_status: not_requested — ST-5 extends the same suite next; a structured review is more informative once the full behavioural surface (AC-1..AC-14) exists
- execution_status: completed
- next_action: request `stage_approval` for ST-5

#### Planned Work

- `run-review-fixtures.ts`: shared builders — `buildRequest` / `buildDeps` / `buildGit` / `buildHarnessDeps` over `createFakeGitPort`, `FakeHarnessLoader` and `createFakeEngine`; `SAMPLE_DIFF_RESULT` (raw chunk + matching stats so `computeReviewDiff` yields a non-empty `ReviewDiff`); `createManualScheduler` (the AC-5 mechanism); plus the two seams no existing fake provides — a never-settling, request-recording engine and a `HarnessValidationError`-throwing loader pair.
- `run-review.test.ts`: the terminal-state half of the suite — AC-1 (full result shape), AC-2 (`ok`), AC-3a/AC-3b (`ambiguous`), AC-4a/AC-4b (`engine-error`), AC-5 (`timeout`, deterministic), AC-6 (nine `validation-failed` producers, including ST-3b's upper bound), AC-11 (no worktree on stage-1/2 faults), AC-12 (never rejects).
- Do not modify any production file, any other test, or `index.ts`; AC-7..AC-10, AC-13, AC-14 and the timer-hygiene case stay with ST-5.

#### Preconditions And Sync Checks

- Working tree clean at stage start (`git status --porcelain` empty); ST-1..ST-3b committed. Branch `claude/validar-e1-preparar-e4-m1xkhl`.
- All five run-module production files re-read before writing: the stage-1 pre-flight order (empty-string checks before the `timeoutMs` checks, upper bound last), `classifyFailure`'s exact class list, and `MAX_TIMEOUT_MS = 2_147_483_647` all match spec/design/plan as amended by ST-3b.
- The three sanctioned fakes re-read from source: `createFakeGitPort` exposes `addCalls`/`removeCalls`/`addError`/`mergeBaseError`/`diffResult` (all the suite needs); `FakeHarnessLoader` throws `HarnessNotFoundError`/`SkillNotFoundError` but has NO path that raises `HarnessValidationError` (hence the fixture stub, per design.md's AC-6 row); `createFakeEngine` cannot record requests or hang (hence `createHangingEngine`).
- Plan traps re-verified against source before writing: `loadHarnesses` returns a `Map` and does not throw on an unknown type (the miss is `runReview`'s own `HarnessNotFoundError`); `createReviewWorktree` wraps only `GitWorktreeError`; `.dependency-cruiser.cjs` `options.exclude.path: "(^|/)__test__/"` sanctions the cross-boundary fake imports.
- AC-6 count reconciled across artifacts (see Decisions): spec.md enumerates 8 producers; design.md's AC-6 row adds the `HarnessValidationError` stub case; plan.md's ST-4 row fixes the total at 9. The suite implements exactly those 9.

#### Changes Applied

- `src/core/run/__test__/run-review-fixtures.ts`
  - Constants: `REPO_PATH`, `WORKTREES_DIR`, `BASE_REF`, `TARGET_REF` (`feature/login`), `HARNESS_TYPE` (`pr-review`), `FIXED_TS`, and `TIMEOUT_MS = 60_000` — deliberately large so any accidental real-clock wait blows past vitest's per-test timeout instead of passing slowly.
  - `SAMPLE_DIFF_RESULT`: one-file raw diff chunk with a matching `stats` entry, served by `buildGit` as the fake port's default `diffResult`.
  - `buildRequest(overrides?)` / `buildDeps(overrides?)`: a fully valid baseline (git + approving engine + resolvable harness + fixed clock) that each test breaks in exactly one place.
  - `buildHarnessDeps({ contextMode?, harnessSkills?, registeredSkills? })`: the `{ factory, user }` pair with one `HARNESS_TYPE` harness; `contextMode: "agent"` and an unregistered `harnessSkills` entry produce the non-`inline` and missing-skill AC-6 cases.
  - `buildValidationFailingHarnessDeps()`: a `HarnessLoader` stub advertising `HARNESS_TYPE` but throwing `HarnessValidationError` on load — the ninth AC-6 producer.
  - `createHangingEngine()`: records every `ReviewRequest` and returns a promise that never settles (AC-5's forwarded-`timeoutMs` assertion needs the request; `createFakeEngine` records nothing).
  - `createManualScheduler({ fireImmediately? })`: records `{ ms }` per scheduling call, exposes `cancelCount()` and `fireAll()`; with `fireImmediately` the budget elapses synchronously at schedule time — zero wall-clock waiting. `cancelCount`/`fireAll` are unused by ST-4 and exist for ST-5's timer-hygiene case.
- `src/core/run/__test__/run-review.test.ts` — 19 tests in six describes:
  - ok (AC-1, AC-2): full-shape happy path (`state`/`verdict`/`worktreePath` = the fake's recorded `targetPath`/`diff`/`prompt` sections/`engineOutput`/`usage` passthrough/`failure` absent/`cleanup: { attempted: true, removed: true, reason: "policy-always" }`), plus `ok` + `verdict: "request-changes"` proving the state describes the run, not the opinion.
  - ambiguous (AC-3): no `VERDICT:` line, and two distinct conflicting verdicts; `verdict` absent, `failure` absent, `engineOutput` present.
  - engine-error (AC-4): (a) engine rejection → `EngineInvocationError` at `stage: "engine"` with the raw error preserved as `cause`, earlier-stage fields still populated, `engineOutput` absent; (b) `addError: new GitWorktreeError(...)` → `WorktreeCreationError` at `stage: "worktree"`, `cleanup: { attempted: false }`, `removeCalls` empty.
  - timeout (AC-5): hanging engine + `createManualScheduler({ fireImmediately: true })` → `state: "timeout"`, `EngineTimeoutError` carrying `timeoutMs`, elapsed wall time asserted far below the 60s budget, `calls[0].ms === TIMEOUT_MS`, and `timeoutMs` forwarded into the engine's own `ReviewRequest`.
  - validation-failed (AC-6), one test per producer, asserting state + `failure.stage` + error class: `timeoutMs: 0` (request), `timeoutMs: 2_147_483_648` (request; message asserted to name the bound), empty `harnessType` (request), relative `repoPath` (worktree, `InvalidWorktreeRequestError`), `limits.maxLines: 0` (diff, `DiffSizePolicyError`), unknown harness (harness, `HarnessNotFoundError`), missing skill (harness, `SkillNotFoundError`), `contextMode: "agent"` (prompt, `ContextModeNotSupportedError`), validation-failing loader (harness, `HarnessValidationError`).
  - AC-11: unknown harness and `timeoutMs: 0` each leave `addCalls` AND `removeCalls` empty with `cleanup: { attempted: false }`.
  - AC-12: `mergeBaseError: new TypeError(...)` — the same promise is asserted to resolve (never rejects) and then to carry `state: "engine-error"`, `stage: "diff"`, with `failure.error` IDENTITY-equal to the thrown `TypeError` (proving the catch-all preserves, not wraps).

#### Scope And Blast Radius Notes

- `git diff --stat` is empty (no tracked file modified); `git status --short --untracked-files=all` lists exactly the two new files under `src/core/run/__test__/`. No production file, no other test, no `index.ts` change. AC-17 holds.
- Both files sit inside a `__test__/` segment, so `depcruise src` never cruises them; the cross-boundary imports (`createFakeEngine` from adapters, the workspace git fake, the review harness fake) are the sanctioned ones (`r-test-fake-cross-boundary`, dec-005) and were not "fixed".
- The suite runs entirely on injected fakes: no filesystem, no git binary, no real timers (the only `defaultTimeoutScheduler` uses are in non-timeout tests where the race settles immediately and `finally { cancel(); }` clears the 60s timer).

#### Quick Check

- checks_planned: `npx vitest run --project core`; `npm run check`; `npm test`; `git diff --stat` + `git status --short` scope review
- checks_run:
  - `npx vitest run --project core` → passed, 11 test files, 129/129 tests (110 prior core tests + the 19 new ones), 0 failures. All 19 passed on the first full run.
  - `npm run check` → passed (biome: 78 files checked, no fixes pending; `tsc --noEmit`: clean; `depcruise src`: no dependency violations, 56 modules / 104 dependencies cruised — identical to post-ST-3b, confirming the test files are excluded from the cruise).
  - `npm test` → passed, 15 test files, 182/182 tests, 0 failures — the 163 pre-existing tests untouched plus the 19 new ones.
  - `git diff --stat` → empty; `git status --short --untracked-files=all` → `?? src/core/run/__test__/run-review-fixtures.ts`, `?? src/core/run/__test__/run-review.test.ts` only.
- checks_skipped: none. During iteration, biome required a formatting pass on the two new files and flagged three `lint/correctness/noUnsafeOptionalChaining` uses (`(result.failure?.error as X).member`); fixed by extracting the cast into a local after the `toBeInstanceOf` assertion. No production file was touched at any point.
- findings_summary: no warnings, no failures, no deviations. All five terminal states are now proven reachable, and no genuine defect surfaced in `src/core/run/**` — the blocked-return path was not needed.
- continue_recommendation: continue

#### Evidence

| Kind | Reference | Notes |
|---|---|---|
| command | `npx vitest run --project core` | 11 files / 129 tests passed (19 new) |
| command | `npm run check` | biome 78 files clean · tsc clean · depcruise 56 modules / 104 deps, 0 violations |
| command | `npm test` | 15 files / 182 tests passed — 163 baseline intact + 19 new |
| command | `git diff --stat` / `git status --short --untracked-files=all` | empty diff; only the two new `__test__/` files untracked |
| file | `src/core/run/__test__/run-review-fixtures.ts` | Builders over the sanctioned fakes + manual scheduler + hanging engine + validation-failing loader |
| file | `src/core/run/__test__/run-review.test.ts` | AC-1..AC-6, AC-11, AC-12 — 19 tests, six describes |
| reference | plan.md "Traps that make a green test worthless" | Each trap deliberately asserted: `GitWorktreeError` fixtures, `runReview`-owned `HarnessNotFoundError`, both AC-5 halves |

#### Decisions And Blockers

- **A-level (internal, logged):** the AC-6 "nine cases" reconciled across artifacts — spec.md's AC-6 row enumerates 8 producers; design.md's AC-6 test row adds a ninth case (a `HarnessLoader` stub throwing `HarnessValidationError`, closing `classifyFailure`'s last `validation-failed` row); plan.md's ST-4 row fixes the total at 9. All three agree once read together; the suite implements exactly those 9. No contradiction, so no STOP.
- **A-level (internal, logged):** two fixture-local test doubles were written where the sanctioned fakes cannot serve: `createHangingEngine` (AC-5 must assert `timeoutMs` inside the engine's `ReviewRequest`, and `createFakeEngine` neither records requests nor hangs) and the `buildValidationFailingHarnessDeps` loader stub (no `FakeHarnessLoader` path raises `HarnessValidationError`). Both live in the fixtures file, not as new shared fakes.
- **A-level (internal, logged):** `TIMEOUT_MS = 60_000`, deliberately far above vitest's per-test timeout: if any test ever awaited the real wall clock the suite would fail loudly instead of passing slowly. The AC-5 test additionally asserts measured elapsed time below the budget.
- **A-level (internal, logged):** AC-12's bare-`TypeError` producer is `git.mergeBase` (via the fake's `mergeBaseError`), which `computeReviewDiff` rethrows unwrapped — landing at `stage: "diff"` with the original preserved; the test asserts IDENTITY (`toBe`), not just class. The same promise is first asserted with `.resolves` to pin "never rejects" explicitly.
- **A-level (internal, logged):** AC-1 asserts `worktreePath === git.addCalls[0]?.targetPath` rather than a hard-coded derived path, so the suite does not couple to `createReviewWorktree`'s naming scheme (already pinned by its own tests).
- **A-level (internal, logged):** `createManualScheduler` also exposes `cancelCount()` and `fireAll()`, unused in ST-4 — the plan routes the timer-hygiene assertion (`cancelCount === 1`) to ST-5, and shipping the recording half now avoids reshaping the fixture mid-suite.
- **A-level (internal, logged):** the three `noUnsafeOptionalChaining` biome findings were fixed by extracting `result.failure?.error as X` into a local AFTER the `toBeInstanceOf` assertion (house precedent: the `as`-cast in `create-review-worktree.test.ts`), keeping the runtime-safe assertion order.
- Blockers: none. No production defect surfaced; no contradiction between spec/design/plan and observed behaviour.

#### User-Facing Summary

- ST-4 is done: the run module finally has behavioural proof. 19 new tests make all five terminal states reachable on demand — happy path, both ambiguity routes, both engine-error routes, a deterministic timeout with zero real waiting, and all nine validation-failed producers including the ST-3b upper bound.
- The two guarantees the design staked everything on now have tests: `runReview` never rejects (a bare `TypeError` from a dependency resolves as `engine-error` with the original preserved untouched), and pre-flight faults leave no worktree behind.
- Everything is green: core project 129/129, `npm run check` clean, full suite 182/182 with the 163 pre-existing tests untouched. The diff is exactly the two new test files — no production line changed.
- Next: approve ST-5 (cleanup contract, the two seams, timer hygiene, and the R1-001 escape-hatch pin), which extends this same suite.
