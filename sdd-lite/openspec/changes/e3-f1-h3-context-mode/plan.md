# Plan

## Execution Digest

- change_name: e3-f1-h3-context-mode
- objective: new-feature
- route: continue-lite
- digest_summary: Single-stage execution -- all 10 file modifications are small, tightly coupled, and share one validation gate.
- stage_plan_digest: S1 modifies schema, error, guard, index, adapter, and all test files in one pass; validated by `npm run check` + `npm test`.
- validation_digest: Unit tests via `npx vitest run --project core`; contract tests via `npx vitest run --project adapters`; architecture guards via `npm run check`.

## Summary

- change_name: e3-f1-h3-context-mode
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Add `ContextMode` type and schema field, `ContextModeNotSupportedError`, guard in `assemblePrompt`, adapter wiring, index re-exports, and all test updates | -- | 6 source files modified (~50 net lines), 4 test files modified | `npm run check` passes (biome + tsc + depcruise); `npm test` passes (all projects) | yes | yes | pending |

## Stage S1 Detail

### Files modified (source)

1. `src/core/review/ports/harness-schemas.ts` -- add `ContextMode` type, extend `HarnessSkillsSchema` with `contextMode` field, add field to `Harness` interface
2. `src/core/review/ports/harness-errors.ts` -- add `ContextModeNotSupportedError` class
3. `src/core/review/assemble-prompt.ts` -- import error, add guard for `contextMode === "agent"`
4. `src/core/review/index.ts` -- re-export `ContextMode` type and `ContextModeNotSupportedError`
5. `src/adapters/driven/storage/harness-loader-fs.ts` -- import `ContextMode`, read from parsed skills.yaml, include in Harness construction

### Files modified (test)

6. `src/core/review/__test__/assemble-prompt.test.ts` -- update `buildInput` helper, add 2 test cases (agent throws, error hierarchy)
7. `src/core/review/__test__/load-harnesses.test.ts` -- update `harness()` helper with `contextMode: "inline"`
8. `src/adapters/driven/storage/__test__/HarnessLoader.contract.ts` -- add 2 contract tests (explicit agent, default inline), update 2 existing assertions

### Rollback boundary

All changes are additive modifications to existing files. Rollback = revert the single commit.

## Validation Strategy

After S1, run:

1. `npm run check` -- confirms biome lint/format, TypeScript compilation (AC4: `contextMode` is required, not optional), and depcruise architecture guards (no forbidden imports from core to adapters).
2. `npm test` -- runs all vitest projects:
   - **core**: AC1-AC3 (schema validation), AC5 (agent throws), AC6 (inline works), AC8 (error extends HarnessError)
   - **adapters**: AC7 (fs adapter produces contextMode from skills.yaml and defaults to inline)

## Dependencies And Sequencing

- Single stage, no internal sequencing needed.
- External dependency: `e3-f1-h2-prompt-assembler` (completed) -- provides `assemblePrompt` function and its test file.

## Planner Stop Note

- Objective is `new-feature`, not `planner`. Execution proceeds after stage approval.

## Approval Notes

- S1 requires `stage_approval` before execution because it modifies source code.
- No open questions or blockers. All design decisions are A-level and finalized in design.md.
