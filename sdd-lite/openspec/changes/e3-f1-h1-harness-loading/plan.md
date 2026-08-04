# Plan

## Execution Digest

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- total_stages: 3
- stage_summary: S1 core domain (ports + types + use case + unit tests) → S2 fs adapter + contract tests → S3 module exports + quality gate
- planner_terminal: false
- execution_ready: true

## Summary

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- plan_status: approved
- planner_terminal: false
- execution_ready: true

## Stage Plan

| Stage | Goal | Files | Depends On | Validation | Status |
|---|---|---|---|---|---|
| S1 | Core domain: port, types, errors, use case, pure function, fake, unit tests | `src/core/review/ports/harness-schemas.ts`, `src/core/review/ports/harness-loader.ts`, `src/core/review/ports/harness-errors.ts`, `src/core/review/resolve-harness-skills.ts`, `src/core/review/load-harnesses.ts`, `src/core/review/__test__/fake-harness-loader.ts`, `src/core/review/__test__/resolve-harness-skills.test.ts`, `src/core/review/__test__/load-harnesses.test.ts` | none | `tsc --noEmit` passes; `npx vitest run --project core` passes; depcruise confirms no I/O imports in core/review/ | pending |
| S2 | Storage adapter: fs adapter + contract test suite + adapter test binding | `src/adapters/driven/storage/harness-loader-fs.ts`, `src/adapters/driven/storage/__test__/HarnessLoader.contract.ts`, `src/adapters/driven/storage/__test__/harness-loader-fs.test.ts` | S1 | `npx vitest run --project adapters` passes; contract suite covers all 9 expected-behavior scenarios from spec | pending |
| S3 | Module exports + quality gate | `src/core/review/index.ts` (public API), `src/adapters/driven/storage/index.ts` (add export) | S1, S2 | `npm run check` passes (biome + tsc + depcruise); `npm test` passes (all projects) | pending |

## Validation Strategy

- **After S1**: run `tsc --noEmit` and `npx vitest run --project core` to confirm type safety and unit test green. Run `depcruise src` to verify core/review/ has no forbidden imports (AC-4, AC-9).
- **After S2**: run `npx vitest run --project adapters` to confirm contract suite passes against the fs adapter (AC-5). Verify the contract suite covers: valid harness with all files, minimal harness, missing harness.md error, invalid YAML error, missing base dir graceful handling.
- **After S3**: full `npm run check` + `npm test`. Verify public API exports match AC-8. Verify all 9 ACs from spec are covered.

## Dependencies And Sequencing

```
S1 (core domain) ──→ S2 (adapter + contract tests) ──→ S3 (exports + gate)
```

Linear dependency: S2 imports core types from S1; S3 wires the exports and validates the full chain. No parallelization opportunity within a single executor.

## Approval Notes

- User indicated automatic advancement — skipping checkpoint
- 3 stages following the natural core → adapter → integration boundary
- Each stage is self-contained and independently validatable
- `stage_approval` required before each code-touching stage (S1, S2, S3)
- No open risks or questions remain
