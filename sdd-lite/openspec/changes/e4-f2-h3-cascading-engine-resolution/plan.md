# Plan

## Execution Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    3 executor stages, strictly ordered by import dependency: ST-1 extracts
    `EngineNameSchema` in the `repos` module (pure refactor); ST-2 adds
    `resolveEngine` + `UnknownEngineError` in the `run` module (imports
    `EngineName` from ST-1); ST-3 adds the `engineName` echo field to
    `run-review.ts` (independent of ST-2, sequenced last for a single
    closing gate). Each stage includes its own tests — no separate test-only
    stage, proportional to the change's small, fully core-only surface.
- stage_plan_digest: >-
    ST-1 config-schemas.ts + repos/index.ts (schema refactor + regression
    tests) -> ST-2 resolve-engine.ts + run-errors.ts + run/index.ts (new
    function/error + precedence-matrix tests) -> ST-3 run-review.ts echo
    field (2-field diff + echo tests + closing gate).
- validation_digest: >-
    Per stage: `npm run check` (biome + tsc + depcruise) and `npm test`
    green, diff scoped to the stage's named files only. ST-3 additionally
    re-verifies AC-9 (`git diff` on `run-review.ts` shows no stage/
    control-flow changes) and AC-6 (grep confirms `EngineNameSchema` has
    exactly one definition).

## Summary

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Extract `EngineNameSchema`/`EngineName` in `repos/ports/config-schemas.ts`; reference it from `GlobalConfigSchema.defaultEngine` and `RepoEntrySchema.defaultEngine`; re-export from `repos/index.ts` | — | `src/core/repos/ports/config-schemas.ts` (edit), `src/core/repos/index.ts` (edit) | `npm run check` + `npm test` green; existing `ConfigStore.contract.ts` and `repos/__test__/*` unmodified and passing (regression proof the refactor is behavior-preserving, AC-6) | yes | yes | pending |
| ST-2 | Add `resolveEngine` (pure function) and `UnknownEngineError` implementing the run > repo > global precedence and unknown-name validation | ST-1 | `src/core/run/resolve-engine.ts` (new), `src/core/run/run-errors.ts` (edit), `src/core/run/index.ts` (edit), `src/core/run/__test__/resolve-engine.test.ts` (new) | `npm run check` + `npm test` green; new test file covers AC-1..AC-5 (precedence matrix incl. shadowed-invalid-value case, unknown-name at each level, error message content) | yes | yes | pending |
| ST-3 | Add `engineName?: string` to `RunReviewRequest`/`RunReviewResult`; one conditional spread in `runReview`'s return construction; closing gate | ST-1 (independent of ST-2, sequenced last) | `src/core/run/run-review.ts` (edit), `src/core/run/__test__/run-review.test.ts` (edit) | `npm run check` + `npm test` green; new cases for AC-7/AC-8 (echo present, echo absent via `"engineName" in result`); `git diff -- src/core/run/run-review.ts` reviewed to confirm only the 2-field diff (AC-9); full-story diff confined to the 6 files listed across ST-1..ST-3 | yes | yes | pending |

## Validation Strategy

- Each stage runs `npm run check` (biome + `tsc --noEmit` + `depcruise src`) and `npm test` before being reported complete — both must stay green throughout, matching the H1/H2 precedent.
- ST-1's regression proof is negative: no existing test file changes, only passes against the refactored schema.
- ST-2's test file is the primary AC evidence (AC-1 through AC-5) — no fixtures needed, `resolveEngine` is pure and deterministic.
- ST-3 is also the story's closing gate: after its diff, verify the full story diff (`git diff <pre-story-merge-base>...HEAD -- src/`) touches exactly the 6 files named above, `src/core/repos/ports/config-schemas.ts` change is additive-only (no removed exports), and no adapter or `src/main/` file appears in the diff (this story is core-only per its own scope boundary).
- No manual/human-in-the-loop verification is needed anywhere in this plan (unlike H1/H2's AC-24) — everything is a pure function or a data-shape change, fully testable in CI.

## Dependencies And Sequencing

- ST-2 depends on ST-1 for the `EngineName` type import (`resolveEngine`'s `globalDefault: EngineName` parameter).
- ST-3 does not depend on ST-2 at the code level (the echo field is orthogonal to `resolveEngine`), but is sequenced last so the stage plan converges on one final closing-gate check rather than two.
- No stage depends on any adapter, `src/main/`, or external CLI — the full plan is executable without the `opencode`/`claude` CLIs being installed or authenticated (unlike `[E4.F2.H1]`/`[E4.F2.H2]`'s AC-24).

## Planner Stop Note

- Not applicable: `objective` is `new-feature`, not `planner`. This plan is execution-ready; `sddl-executor` runs stages ST-1 through ST-3 one at a time, each gated by its own `stage_approval` checkpoint.

## Approval Notes

- User approved design.md ("si, avanza con el plan") and this plan proceeds under the same advancement. Per the workflow contract, each stage still requires its own explicit `stage_approval` before `sddl-executor` touches code — this plan being "approved" does not pre-authorize ST-1..ST-3 execution.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
