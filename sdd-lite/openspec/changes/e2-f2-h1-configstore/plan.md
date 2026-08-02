# Plan

## Execution Digest

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- digest_summary: ConfigStore driven port with zod schemas, typed errors, yaml storage adapter, and contract tests
- stage_plan_digest: P0 preflight, S1 core types (schemas + port + errors + re-exports), S2 adapter + contract tests, S3 post-executor validation, S4 4R code review, S5 QA (9 ACs), S6 close
- validation_digest: Each code stage gates on npm run check + npm test; S3 full depcruise + diff perimeter; S5 AC-1..AC-9

## Summary

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: approved

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| P0 | Preflight: verify green baseline | none | `npm ci`, `npm run check`, `npm test` all pass | exit 0 on all three commands | no | no | pending |
| S1 | Core types: schemas, port, errors, re-exports | P0 | Create `config-schemas.ts`, `config-store.ts`, `config-store-errors.ts` in `src/core/repos/ports/`; update `src/core/repos/index.ts` re-exports; update `src/core/review/index.ts` placeholder comment | `npm run check` passes (tsc + biome + depcruise) | yes | yes | pending |
| S2 | Adapter + contract tests | S1 | Install `yaml` (eemeli); create `config-store-yaml.ts` in `src/adapters/driven/storage/`; create `ConfigStore.contract.ts` + `config-store-yaml.test.ts` in `__test__/`; update `src/adapters/driven/storage/index.ts` exports | `npm run check` + `npm test` -- all contract tests pass | yes | yes | pending |
| S3 | Post-executor validation | S2 | Full diff perimeter check: only expected files touched; hermeticity re-run (`npm run check` + `npm test`); `npx depcruise src` zero violations | All commands exit 0; diff limited to declared affected areas | no | no | pending |
| S4 | 4R code review | S3 | Parallel reliability + readability lenses on the executor diff | Both lenses report no blocking findings | no | no | pending |
| S5 | QA: AC-1 through AC-9 | S4 | Verify each acceptance criterion against shipped code and test output | All 9 ACs validated green | no | yes | pending |
| S6 | Close: history, branch, PR | S5 | Write history entry; push branch; open PR with `Closes #13` | PR created, CI green | no | no | pending |

## Validation Strategy

- **Gate per code stage**: every code-touching stage (S1, S2) ends with `npm run check` (biome lint + tsc --noEmit + depcruise) and, when tests exist, `npm test`. No stage advances on a red gate.
- **Architecture guard enforcement**: `depcruise src` must show zero violations after each code stage. Core files import only `zod`; adapter files never imported by core; no cross-adapter imports.
- **AC coverage**: S5 maps each AC to concrete evidence (test output, grep, or `npm ls`). The contract test suite covers AC-1 (validation error), AC-2 (roundtrip), AC-4 (missing file), AC-6 (error translation), AC-9 (harness pattern). AC-3 (z.infer only) and AC-5 (no I/O imports in port) verified by code inspection + depcruise. AC-7 (re-exports) verified by import check. AC-8 verified by `npm ls yaml`.
- **Diff perimeter**: S3 confirms the changeset touches only the 8 files listed in the design affected areas table, plus `package.json` and lockfile.

## Dependencies And Sequencing

- S1 before S2: the adapter imports port types and schemas; core must compile first.
- S2 before S3: validation runs against the complete changeset.
- S3 before S4: code review operates on a validated, green codebase.
- S4 before S5: QA confirms the reviewed code meets all ACs.
- S5 before S6: PR is opened only after QA sign-off.
- No stages can be parallelized: each depends on the prior stage's output.

## Approval Notes

- S1 and S2 are code-touching stages and require approval before advancing.
- S5 (QA) requires approval to confirm all ACs are met before closing.
- All patterns follow established GitPort conventions -- no new architectural decisions needed.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
