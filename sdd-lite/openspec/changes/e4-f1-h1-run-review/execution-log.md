# Execution Log

## Handoff Digest

- change_name: e4-f1-h1-run-review
- route: continue-lite
- latest_stage_id: ST-3
- latest_stage_status: completed
- latest_files_changed: `src/core/run/run-review.ts` (new), `src/core/run/index.ts` (modified, append-only)
- latest_check_result: `npm run check` green; `npm test` 163/163 (14 files) — unchanged baseline; AC-16 grep returns nothing
- latest_next_action: request `stage_approval` for ST-4 (`run-review-fixtures.ts` + the terminal-state half of `run-review.test.ts`)

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- lifecycle_status: implementing
- current_stage_id: ST-3
- execution_source: plan-stage-table
- qa_handoff_policy: recommend `sddl-qa-review` when a completed stage needs structured review before continuing
- git_side_effects: none

## Stage Overview

| Stage Id | Goal | Touches Code | Approval Status | Execution Status | Last Updated | Notes |
|---|---|---|---|---|---|---|
| ST-1 | Run-domain leaf types: error family + verdict domain type | yes | approved (`cp-st1-approval`) | completed | 2026-08-09 | Two new leaf files, no importers yet (expected) |
| ST-2 | Cancellable timeout race + naive verdict extraction | yes | approved (`cp-st2-approval`) | completed | 2026-08-09 | Riskiest stage per `plan.md`; behaviour unverified by the repo suite until ST-4/ST-5 |
| ST-3 | `run-review.ts` use case + append-only `index.ts` export block | yes | approved (`cp-st3-approval`) | completed | 2026-08-09 | Largest stage; behaviour still unverified by the suite until ST-4/ST-5 |
| ST-4 | Fixtures + terminal-state coverage | yes | pending | pending | — | — |
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
