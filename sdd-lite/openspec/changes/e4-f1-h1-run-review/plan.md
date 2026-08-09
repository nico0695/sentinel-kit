# Plan

## Execution Digest

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- digest_summary: Six stages, strictly sequential, inside-out. Three code stages build the module from its leaves (errors/verdict → timeout seam/extraction → use case + public index), two test stages add the fixtures and the AC suite, one read-only stage records the whole-diff properties. `design.md` already fixes every file's content; this plan only fixes the order, the per-stage exit check, and the traps that make a green test meaningless.
- stage_plan_digest: ST-1 leaf types · ST-2 timeout seam + extraction · ST-3 `run-review.ts` + `index.ts` · ST-4 fixtures + terminal-state suite · ST-5 cleanup + seam suite · ST-6 whole-diff verification.
- validation_digest: ST-1..ST-3 exit on `npm run check` green with `npm test` still at 163/163 (no new tests yet). ST-4/ST-5 exit on `npx vitest run --project core` plus `npm run check`. ST-6 exits on `npm run check` + `npm test` + `git diff --stat` + an `index.ts` export grep.

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

The build order is dictated by the import graph, which is a chain: `verdict.ts`/`run-errors.ts` have no dependencies, `engine-timeout.ts` imports the errors, `builtin-verdict-extraction.ts` imports `Verdict`, `run-review.ts` imports all four, and the tests import `run-review.ts`. Every stage therefore leaves the tree green: no orphan rule exists in `.dependency-cruiser.cjs` and `tsconfig.json` sets no `noUnusedLocals`, so an exported-but-not-yet-imported leaf file passes `npm run check` on its own.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Run-domain leaf types: the error family and the verdict domain type | — | `src/core/run/run-errors.ts` (new: `RunError` + `InvalidRunRequestError`, `EngineInvocationError`, `EngineTimeoutError`), `src/core/run/verdict.ts` (new: `Verdict`, `VerdictParser`) | `npm run check`; `npm test` still 163/163. Partial AC-15/AC-17 | yes | yes | pending |
| ST-2 | The two behavioural leaves: the cancellable timeout race and the naive verdict extraction | ST-1 | `src/core/run/engine-timeout.ts` (new: `TimeoutScheduler`, `defaultTimeoutScheduler`, `runEngineWithTimeout`), `src/core/run/builtin-verdict-extraction.ts` (new: `extractBuiltInVerdict`) | `npm run check`; `npm test` still 163/163. Behaviour proven later through `runReview` (ST-4/ST-5), by design — no standalone test file exists for these | yes | yes | pending |
| ST-3 | The use case and the public surface | ST-2 | `src/core/run/run-review.ts` (new: request/deps/result types, `runReview`, `executePipeline`, `classifyFailure`, `performCleanup`), `src/core/run/index.ts` (append-only export block) | `npm run check` — `tsc` proves the strict-mode result shape, `depcruise src` proves AC-15 on production files. AC-16 by inspecting the new `index.ts` block. `npm test` still 163/163 | yes | yes | pending |
| ST-4 | Fixtures + terminal-state coverage: all five states reachable, nothing escapes | ST-3 | `src/core/run/__test__/run-review-fixtures.ts` (new), `src/core/run/__test__/run-review.test.ts` (new) — AC-1, AC-2, AC-3(a/b), AC-4(a/b), AC-5, AC-6 (8 cases), AC-11, AC-12 | `npx vitest run --project core`, then `npm run check`; narrow with `npx vitest run -t "<case>"` while iterating. Then `npm test` for the full suite | yes | yes | pending |
| ST-5 | Cleanup contract + the two seams | ST-4 | `src/core/run/__test__/run-review.test.ts` (extended), fixtures extended if needed — AC-7, AC-8, AC-9, AC-10, AC-13, AC-14, plus the timer-hygiene case (`cancelCount === 1` on the happy path) | `npx vitest run --project core`, then `npm run check` and `npm test` | yes | yes | pending |
| ST-6 | Whole-diff verification and PR readiness | ST-5 | No files changed. Record evidence in `execution-log.md` | `npm run check` and `npm test` both green with 163 + new tests (AC-18); `git diff --stat` shows only `src/core/run/**` (AC-17); `grep -E "extractBuiltInVerdict\|defaultTimeoutScheduler\|runEngineWithTimeout\|classifyFailure" src/core/run/index.ts` returns nothing (AC-16); `depcruise src` clean (AC-15) | no | no | pending |

## Validation Strategy

- **Per stage.** ST-1..ST-3 are pre-test stages: the only available proof is `npm run check`, and the standing obligation is that the 163 existing tests keep passing untouched. ST-4/ST-5 run `npx vitest run --project core` first (fast loop), then the full `npm run check` + `npm test` before the stage is reported done.
- **AC ownership, no orphans.** AC-1..AC-6, AC-11, AC-12 → ST-4. AC-7..AC-10, AC-13, AC-14 → ST-5. AC-15 is enforced by `depcruise src` at ST-1, ST-2 and ST-3 and re-confirmed at ST-6. AC-16 is fixed at ST-3 (what the append-only block does *not* export) and re-confirmed by grep at ST-6. AC-17 is checked with `git diff --stat` at the end of every stage and confirmed at ST-6. AC-18 is the ST-6 exit gate.
- **Traps that make a green test worthless** — the executor must assert these deliberately, not assume them:
  - `addError`/`removeError` fixtures must be `GitWorktreeError` instances. `createReviewWorktree` and `cleanupWorktree` wrap *only* that class and rethrow anything else raw, so any other error type sends AC-4(b), AC-9 and AC-10 down the fall-through path where they pass while proving nothing.
  - `loadHarnesses` returns a `Map` and does **not** throw on an unknown harness type. The AC-6 "unknown harness" case and AC-11 depend on `runReview` raising its own `HarnessNotFoundError` on the lookup miss at stage 2.
  - AC-5 must assert both halves: `state: "timeout"` *and* that the run resolves without touching the wall clock (manual scheduler, `fireImmediately`), plus `calls[0].ms === timeoutMs` and `timeoutMs` forwarded into the engine's `ReviewRequest`.
- **Cross-boundary test imports are legal and must not be "fixed".** `.dependency-cruiser.cjs` line 91 sets `exclude: { path: "(^|/)__test__/" }`, so `depcruise src` never cruises the run tests, while `tsc --noEmit` still typechecks them (`include: ["src"]`). Importing `createFakeEngine` from `src/adapters/driven/engines/fake/` and the git fake from `src/core/workspace/__test__/` is sanctioned (`r-test-fake-cross-boundary`).

## Dependencies And Sequencing

- Strict chain: ST-1 → ST-2 → ST-3 → ST-4 → ST-5 → ST-6. No stage may start before its predecessor is green; nothing here parallelises across stages.
- Inside ST-2 the two files are mutually independent (`engine-timeout.ts` ← `run-errors.ts`; `builtin-verdict-extraction.ts` ← `verdict.ts`), so they can be written in either order.
- `index.ts` is deliberately in ST-3, not a stage of its own: the export block is meaningless without the use case it exposes, and pairing them keeps "what is public" in the same reviewable unit as "what it does".

### Executor notes (fix these once, avoid re-deriving them)

1. `defaultTimeoutScheduler` and `runEngineWithTimeout` need a **file-level `export`** — `run-review.ts` imports them. "Module-private" in `design.md` means *not re-exported from `index.ts`* (AC-16), never *not exported from its own file*. Same for `extractBuiltInVerdict`.
2. `setTimeout`/`clearTimeout` are used as globals and **never imported** — `node:timers` and bare `timers` are both banned specifiers under `core-no-io-libs`. `Date.now()` in `create-review-worktree.ts` is the standing precedent.
3. No `finally` around `executePipeline`. Cleanup runs sequentially after it returns, and annotates only (`r-cleanup-on-error`, resolved: annotate, never override, never rethrow — AC-9/AC-10 test exactly the hazard a `finally` would reintroduce).
4. `exactOptionalPropertyTypes: true` forbids `{ field: undefined }` — the wide result is assembled with conditional spreads, as written in `design.md`.
5. `index.ts` is append-only: add to the existing export block, do not reorder or rewrite the current exports.

### Rollback and recovery

- **ST-2 is the riskiest stage** (the only concurrency in the core: a promise race, a no-op late-rejection handler, and a `finally { cancel(); }`). It has no importers until ST-3, so `git checkout -- src/core/run/engine-timeout.ts` reverts it with zero blast radius. If the race cannot be made to satisfy both AC-5 and timer hygiene, **STOP and route back** — do not fall back to vitest fake timers, which is a settled and rejected design alternative.
- **ST-3 is the largest stage.** If strict mode forces a change to any *public* type in `design.md`'s interface block, that is a design deviation: report it and stop rather than widening the public shape silently. Purely internal adjustments (`RunDraft`, local narrowing) are A-level and just get logged.
- ST-4/ST-5 are additive test files; reverting either is a file delete and leaves the tree green at the previous stage.

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this plan is execution-ready and `sddl-plan` is not terminal here.
- The route is `continue-lite`, so no `macro-plan.md` is produced.

## Approval Notes

- Five code-touching stages, each gated by its own `stage_approval` before the executor writes anything.
- ST-6 touches no code and is a read-only evidence-recording gate; it feeds `sddl-qa-review` (final mode) rather than replacing it.
- All eleven `state.yaml` risks are carried forward unchanged. Two shape this plan directly: `r-test-fake-cross-boundary` (documented above so review does not re-litigate it) and `r-engine-not-cancellable` (inert in H1, flagged forward to E4.F2 / #28-30).
- No settled decision is reopened: `d-harness-resolution` (Option A), `d-validation-failed-preflight`, `d-dec004-scope` and `d-change-scope` all stand as recorded.

## Budget Notes

- Above the 300–500 word target. The overage sits in the stage table's validation column and in the "traps" list — both exist so the executor and QA can check a stage without re-reading `design.md`, which was itself deliberately over-budget for the same reason.
