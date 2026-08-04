# Plan

## Execution Digest

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- digest_summary: Two-stage execution -- implement the function and its tests in parallel, then wire the re-exports and run the quality gate.
- stage_plan_digest: S1 creates source and test files; S2 wires index re-exports and runs `npm run check` + `npm test`.
- validation_digest: Snapshot and unit tests via `npx vitest run --project core`; architecture guards via `npm run check`.

## Summary

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Create `assemble-prompt.ts` with public function, input type, and 5 private renderers; create test file with all 11 test cases | -- | `src/core/review/assemble-prompt.ts` (new, ~120 lines), `src/core/review/__test__/assemble-prompt.test.ts` (new, ~200 lines) | `npx vitest run --project core -t "assemblePrompt"` passes; all 11 test cases green | yes | yes | pending |
| S2 | Add re-exports to `src/core/review/index.ts`; run full quality gate | S1 | `src/core/review/index.ts` (modify, +2 export lines) | `npm run check` passes (biome + tsc + depcruise); `npm test` passes | yes | no | pending |

## Validation Strategy

- After S1: run `npx vitest run --project core -t "assemblePrompt"` to verify all 11 test cases pass. This covers AC-1 through AC-9.
- After S2: run `npm run check` to confirm lint, type-check, and architecture guards (depcruise) pass. This validates AC-10 (exports visible), AC-11 (no forbidden imports), and AC-12 (cross-module import via workspace index). Then run `npm test` for full suite regression.

## Dependencies And Sequencing

- S1 is self-contained: the new file and its test have no dependency on the index re-export.
- S2 depends on S1: re-exports reference `assemble-prompt.ts` which must exist first.
- No external dependencies. All consumed types (`ResolvedHarness`, `Skill`, `ReviewDiff`, `DiffFileEntry`, `DiffWarning`, `DiffTruncatedWarning`) already exist and are exported from their respective modules.

## Planner Stop Note

- Objective is `new-feature`, not `planner`. Execution proceeds after stage approval.

## Approval Notes

- S1 requires `stage_approval` before execution because it creates new code files.
- S2 is a trivial two-line re-export append and quality gate run; no separate approval needed.
- No open questions or blockers. All design decisions are A-level and finalized.

## Budget Notes

- Artifact is approximately 350 words plus tables, within target.
