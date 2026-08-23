# Plan

## Execution Digest

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    4 executor stages. ST-1 lands the additive config field in isolation (no code depends on it
    yet, but it is fully self-contained and unblocks nothing else — first purely for narrative
    order). ST-2 lands the entire pure-function surface — the use case, the tokenizer, the
    rejection set, the D6 window, the two formatters, the new error class, the shared
    `ProcessRunner` fake, and the barrel exports for all of it — provable with zero dependency on
    `runReview`. ST-3 is the wiring stage: `run-review.ts`'s two request fields, the optional
    `deps.processRunner`, the stage-1 hoisted guard, the stage-5 call, and the `RunStage` +
    `RUN_STAGES` cross-module pair land together (design's constraint 1 — typecheck is red
    between them), consuming ST-2's fake and evidence format (design's constraint 2). ST-4 is the
    closing gate: full `npm run check` + `npm test`, AC-20's pinned-untouched-files verification
    against the frozen base, and AC-1's package.json/Makefile grep.
- stage_plan_digest: >-
    ST-1 core/repos/ports/config-schemas.ts (edit) + core/repos/__test__/config-schemas.test.ts
    (new) -> ST-2 core/run/run-validations.ts (new) + core/run/run-errors.ts (edit) +
    core/run/index.ts (edit, run-validations exports only) +
    core/run/__test__/fake-process-runner.ts (new) + core/run/__test__/run-validations.test.ts
    (new) (no dependency on ST-1) -> ST-3 core/run/run-review.ts (edit) +
    core/history/ports/run-metadata-schemas.ts (edit) + core/run/__test__/run-review-fixtures.ts
    (edit) + core/run/__test__/run-review.test.ts (edit) (depends on ST-2 for the fake and the
    evidence format; constraint 1 binds run-review.ts and run-metadata-schemas.ts into this one
    stage) -> ST-4 closing gate, no new files (depends on ST-1, ST-2, ST-3).
- validation_digest: >-
    Per stage: targeted `npx vitest run --project core -t "<name>"` on the stage's own test
    file(s), plus `npm run check` whenever the stage's diff can affect typecheck-wide state (ST-2
    and ST-3, both of which touch `index.ts`/`run-review.ts`/`run-metadata-schemas.ts`). ST-2
    additionally proves the AC-7 rejection set and the AC-14/AC-15 formatter/window by mutation
    (revert a rule, confirm the specific test fails, revert back). ST-4 re-runs the full gate and
    checks the exact diff shape.

## Summary

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Additive config field: `validationTimeoutMs: z.number().optional()` on **both** `GlobalConfigSchema` and `RepoEntrySchema`, deliberately no `.default()`; `RepoEntry.validations` left exactly `z.array(z.string()).optional()`, unwidened. New schema unit-test file proving pre-story documents still parse (field `undefined`) and a document carrying the field parses with the value preserved (D-none — R2-6's only legal home for AC-5's tests, since `src/adapters/**` stays zero-diff this story). Discharges AC-5. | — | `src/core/repos/ports/config-schemas.ts` (edit), `src/core/repos/__test__/config-schemas.test.ts` (new) | `npx vitest run --project core -t "config-schemas"`; then `npm run check` (biome + tsc + depcruise) to confirm the additive field compiles cleanly and depcruise sees no new violation | yes | yes | pending |
| ST-2 | The entire pure-function surface, self-contained: `runValidations` use case + `validateValidationDeclarations` (D-2, the pre-flight *is* the tokenizer, run twice defined once) + `tokenizeDeclaration` with the pinned rejection set (D-3, literal `Set` + codepoint predicate, never a regex) + `windowStream`/`formatOutcomeElement`/`formatSpawnFailureElement` (D-5 windowing inside the formatter, D-6 explicit concatenation via `terminated()`, never `join`) + the four module-private constants, all in one file (D-1) — plus `InvalidValidationDeclarationError extends RunError` in `run-errors.ts`, the shared `ProcessRunner` fake in its own file (D-7, kept out of `run-review-fixtures.ts` per AC-18's import restriction), and the barrel exports for exactly this surface (`runValidations`, its 3 types, `validateValidationDeclarations`, the new error — nothing from `run-review.ts` yet). Discharges AC-2, AC-4 (default-timeout half only — the stage-1 guard half is ST-3), AC-6, AC-7, AC-8, AC-14, AC-15, AC-18, AC-21. | — (no dependency on ST-1: `runValidations` consumes an already-resolved `timeoutMs` number, never the config schema directly) | `src/core/run/run-validations.ts` (new), `src/core/run/run-errors.ts` (edit), `src/core/run/index.ts` (edit — run-validations exports only), `src/core/run/__test__/fake-process-runner.ts` (new), `src/core/run/__test__/run-validations.test.ts` (new) | `npx vitest run --project core -t "run-validations"` covering AC-2/4/6/7/8/14/15/18/21 table-driven and exact-string; then `npm run check` since `index.ts` is a shared barrel | yes | yes | pending |
| ST-3 | Wiring stage, landed as one unit per design's constraint 1 (typecheck is red between the `RunStage` edit and the `run-review.ts` edit — AC-19's exhaustiveness guard). `RunReviewRequest` gains `validations?`/`validationTimeoutMs?`; `RunReviewDeps` gains `processRunner?`; stage 1 gains the hoisted block (D-4: declarations + AC-4's timeout range guard, conditional on `processRunner !== undefined && declarations.length > 0`, byte-identical no-op otherwise); stage 5 replaces the comment placeholder with the `runValidations` call over the worktree `cwd`; `RunStage` gains `"validations"` between `"diff"` and `"prompt"`; `RUN_STAGES` in `run-metadata-schemas.ts` gains the matching entry + comment clause (exactly one array entry + one comment, nothing else); `classifyFailure` gains the `InvalidValidationDeclarationError`/`InvalidProcessRequestError` branch, deliberately omitting `ProcessSpawnError`. `run-review-fixtures.ts` wires ST-2's fake into `buildDeps`' override surface, keeping every existing caller's `processRunner`-absent default valid. `run-review.test.ts` gains the stage-5/never-abort/hoist cases. Discharges AC-1, AC-3, AC-4 (stage-1 guard half), AC-9, AC-10, AC-11, AC-12, AC-13, AC-16, AC-17, AC-19. | ST-2 (consumes `runValidations`, the formatter/evidence format, and the fake) | `src/core/run/run-review.ts` (edit), `src/core/history/ports/run-metadata-schemas.ts` (edit), `src/core/run/__test__/run-review-fixtures.ts` (edit), `src/core/run/__test__/run-review.test.ts` (edit) | `npx vitest run --project core -t "runReview"` covering the stage-5 wiring, the three never-abort paths (AC-11/12/13), the hoisted-guard cases (AC-4/AC-10), AC-1's byte-identical cases, AC-16's ordering, AC-17's prompt-visibility grep; then the full `npm run check` (tsc's `_AllRunStagesCovered` `Expect<Exclude<...>>` guard over `RUN_STAGES` is a whole-program check, not a per-file one) | yes | yes | pending |
| ST-4 | Closing gate. No new production files. Full `npm run check` + `npm test`. AC-20's pinned-untouched-files verification: `git diff --stat` against the frozen story base must show changes to exactly the 11 files this plan names and nothing under `src/adapters/**`, `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, `src/core/repos/` beyond `ports/config-schemas.ts` and `__test__/config-schemas.test.ts`, `src/core/history/` beyond the one line in `ports/run-metadata-schemas.ts`, or `src/core/run/ports/process-runner.ts`. AC-1's "no `package.json`/`Makefile`/`scripts` inspection" verified by grepping the full story diff, expecting zero hits outside test fixtures. | ST-1, ST-2, ST-3 | none (verification only) | `npm run check` (biome + `tsc --noEmit` + `depcruise src` at 0 violations); `npm test` (full suite, all three vitest projects); `git diff --stat <story-base>..HEAD` reviewed against the pinned list above; `git diff <story-base>..HEAD \| grep -niE "package\.json\|makefile\|scripts"` outside test fixtures | no (verification-only stage; still requires `stage_approval` to run since it is a gate before the change can be marked complete) | yes | pending |

## Validation Strategy

- Each stage runs its targeted `vitest -t` first (fast feedback on the ACs it discharges), then `npm run check` whenever the stage's diff touches a shared compile surface (`index.ts` in ST-2; `run-review.ts` + `run-metadata-schemas.ts` together in ST-3, where the `_AllRunStagesCovered` guard is whole-program). ST-1 is narrow enough that its own `npm run check` run is sufficient proof.
- ST-2 mutation-testing note (load-bearing pure functions, per the predecessor's precedent — revert a rule, confirm the right test fails, revert back):
  - AC-7's rejection set: temporarily replace the literal `Set` + codepoint predicate with a regex that also rejects `=`; confirm the `--foo=bar` accept-case test fails; revert.
  - AC-14/AC-15's formatter/window: temporarily replace the `terminated()` concatenation with `parts.join("\n")`; confirm the exact-string assertion on a body already ending in `\n` fails (a spurious blank line appears before `--- stderr ---`); revert. Separately, temporarily drop the `elided` flag from `truncated`'s computation; confirm the 300-line-stdout test's `truncated=true` assertion fails; revert.
- ST-3 mutation-testing note: temporarily remove the `RUN_STAGES` entry for `"validations"` while leaving the `RunStage` union member; confirm `tsc --noEmit` fails on `_AllRunStagesCovered` (AC-19's guard doing its job); revert. Temporarily add `ProcessSpawnError` to `classifyFailure`'s new branch; confirm AC-12's "review continues to `state: \"ok\"`" test fails; revert.
- ST-4 is the story's only full-suite, full-gate, diff-shape-verifying stage — deliberately last and adding no new logic, so any failure here means a wiring/scope mistake, not an unproven pure function.

## Dependencies And Sequencing

- ST-1 has no code dependents inside this story (the `validationTimeoutMs` cascade is E6's, per design's Interface Notes) — it is ordered first purely so the additive schema field is proven and out of the way before the more interesting stages, not because anything downstream reads it yet.
- ST-2 has no dependency on ST-1: `runValidations` consumes an already-resolved `timeoutMs` number and never touches `config-schemas.ts`.
- ST-3 depends on ST-2: it calls `runValidations`, imports the shared fake for its own tests, and reuses ST-2's evidence-element format in its assertions on `result.prompt`.
- ST-3 bundles the `RunStage`/`RUN_STAGES` edit with the `run-review.ts` edit by construction — the design explicitly flagged this as the one hard sequencing constraint that cannot be split (typecheck is red between them).
- ST-4 depends on all three prior stages and adds no new production code, matching the closing-gate precedent from `e5-f1-h1-process-runner`'s ST-4.
- No stage touches `src/adapters/**`, `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, or `src/core/run/ports/process-runner.ts` — enforced by construction (no stage's Expected Scope lists any of them) and re-verified as an explicit checked assertion in ST-4.

## Planner Stop Note

- Not applicable: `objective` is `new-feature`. This plan is execution-ready; `sddl-executor` runs ST-1 through ST-4 one at a time, each gated by its own `stage_approval` checkpoint.

## Approval Notes

- Design was reached with zero blocking open technical questions and no ratified decision reopened; this plan carries every pinned constant, format, and signature from `design.md` verbatim rather than re-deriving them.
- Stage boundaries follow design's two explicit sequencing flags: constraint 1 (the `RunStage`/`run-review.ts` pair lands together, in ST-3) and constraint 2 (the pure-function stage, ST-2, precedes the wiring stage, ST-3).
- ST-1 (config schema) is placed first for narrative order only — it has no forward dependency and could equally run in parallel with ST-2 under a multi-agent executor; under this plan's single-threaded execution it is simply first.
- Each stage still requires its own explicit `stage_approval` before `sddl-executor` touches code, including ST-4 despite being verification-only, since it is the gate that can mark the change complete.
