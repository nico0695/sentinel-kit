# Execution Log

## ST-1 — Core surface: `ProcessRunner` port, pre-flight, errors, barrel

- **Status**: completed
- **Scope**: `src/core/run/ports/process-runner.ts` (new), `src/core/run/process-run-request.ts` (new), `src/core/run/run-errors.ts` (edit), `src/core/run/index.ts` (edit), `src/core/run/__test__/process-run-request.test.ts` (new)
- **What landed**:
  - `ProcessRunner` port + `ProcessRunRequest`/`ProcessRunResult` types, matching spec.md's Scope Boundary shapes exactly. Doc comments cite D1 (provenance is `[E5.F1.H2]`'s job) and D3 (resolve-not-reject) directly in the port file.
  - `validateProcessRunRequest`: one guard clause per rule (empty/blank `command`, empty `cwd`, non-finite/non-positive `timeoutMs`, invalid `maxOutputChars`), mirroring `run-review.ts`'s pre-flight style exactly. Deliberately does not check `cwd` absoluteness (D-2) — the module doc comment cites `run-review.ts`'s identical precedent for `repoPath`.
  - `InvalidProcessRequestError` (no `cause`, mirrors `InvalidRunRequestError`) and `ProcessSpawnError` (carries `cause`, mirrors `EngineInvocationError`) appended to `run-errors.ts` in the existing one-class-per-subclass style.
  - Barrel (`index.ts`) updated: new port types, `validateProcessRunRequest`, both new errors. Header comment updated to name `[E5.F1.H1]`/#31 as the current story, no caller yet.
- **Validation**:
  - `npm run check`: green — 109 files checked (biome), `tsc --noEmit` clean, `depcruise src` 0 violations (78 modules, 156 dependencies) — independently re-run and confirmed by the orchestrator, not merely trusted from the executor's report.
  - `npm test`: `process-run-request.test.ts` 13/13 passing, independently re-run in isolation.
  - Diff scope: `git status --porcelain` confirmed exactly the 5 named files touched (plus this change's own `state.yaml`, which the orchestrator owns) — independently verified, not trusted from the executor's self-report.
- **Test coverage proof for D-2**: `process-run-request.test.ts` includes an explicit case, `"does NOT reject a relative cwd (D-2: absoluteness is the adapter's job)"`, proving the omission was deliberate rather than an oversight — exactly the proof plan.md's Validation Strategy asked for.
- **Deviations**: none. One cosmetic note from the executor: biome's `useExportType`/`organizeImports` rules required the port-type export block in `index.ts` to use a grouped `export type { ProcessRunner, ProcessRunRequest, ProcessRunResult }` form (alphabetized) rather than individually-prefixed type exports — no scope or behavior change.
