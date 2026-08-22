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

## ST-2 — The pure classifier: `classifyExecaResult`

- **Status**: completed
- **Scope**: `src/adapters/driven/exec/classify-execa-result.ts` (new), `src/adapters/driven/exec/__test__/classify-execa-result.test.ts` (new)
- **What landed**: `classifyExecaResult(result, budget, timeoutMs, elapsedMs)`, a pure function with no `execa`/`child_process`/I/O import, implementing design.md's four rules in the required priority order: (1) never-ran detection via `exitCode`/`signal` both absent, checked first, throwing `ProcessSpawnError` with `cause: result` (AC-14); (2) `timedOut` derived from `signal !== undefined && elapsedMs >= timeoutMs`, never from an execa-style `timedOut` field (D-4, fixes R5's overflow-then-hang misreport, AC-17); (3) per-stream truncation by length-vs-budget comparison against `isMaxBuffer`, never a single shared flag (D-6, AC-6/AC-7); (4) `exitCode`/`signal` via `exactOptionalPropertyTypes`-safe conditional spreads (AC-9). The `ExecaLikeResult` input type is self-contained (no execa import), which keeps the test file execa-free too.
- **Validation**:
  - `npm run check`: green — 111 files (biome), `tsc --noEmit` clean, `depcruise src` 0 violations (79 modules, 158 dependencies) — independently re-run by the orchestrator.
  - `npm test`: `classify-execa-result.test.ts` 11/11 passing, independently re-run in isolation. Full suite: 386 tests green.
  - Diff scope: confirmed via `git status --porcelain` — exactly the 2 named files (plus this change's own `state.yaml`) — independently verified.
- **Mutation proofs** (performed by the executor, each reverted afterward, diff confirmed byte-identical to the correct version):
  1. Never-ran via a `failed`-style heuristic — not runtime-testable, since `ExecaLikeResult` has no `failed` field at all: a classifier keyed on one would fail to compile. Recorded as a stronger (compile-time) guarantee than a runtime mutation, not skipped.
  2. Both truncation flags derived from a single `isMaxBuffer` value instead of per-stream length comparison — mutated, the stdout-only and stderr-only tests failed exactly as predicted (`false` expected, `true` observed), reverted.
  3. `timedOut` derivation with the `elapsedMs >= timeoutMs` condition dropped (simulating a naive passthrough of an execa-style `timedOut` field) — mutated, the AC-17 overflow-then-hang test failed exactly as predicted (`true` expected, `false` observed), reverted.
- **Deviations (ST-2)**: none.

## ST-3 — Impure adapter shell + `ProcessRunner.contract.ts`

- **Status**: completed
- **Scope**: `src/adapters/driven/exec/process-runner-exec.ts` (new), `src/adapters/driven/exec/index.ts` (edit — real barrel), `src/adapters/driven/exec/__test__/ProcessRunner.contract.ts` (new, the sixth contract suite), `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` (new, thin driver)
- **What landed**: `createExecProcessRunner()` — `validateProcessRunRequest` (ST-1) → `isAbsolute` check via `node:path`, throwing the core-owned `InvalidProcessRequestError` on a relative `cwd` (D-2, matching `git-cli.ts`'s precedent) → `execa(...)` called with the EXACT option bag spec.md pins (`reject: false`, `shell: false`, `timeout`, `killSignal: "SIGTERM"`, `forceKillAfterDelay: 2000` — sourced verbatim from the `claude-code` engine seam for consistency, `maxBuffer` in per-fd form, `stripFinalNewline: false`, `env` passed only when present via a conditional spread) → self-measured `elapsedMs` via `Date.now()` bracketing the call (not `execa`'s `durationMs`) → `classifyExecaResult` (ST-2) does the rest. `DEFAULT_MAX_OUTPUT_CHARS = 1_000_000` is a new adapter-owned constant (design.md D-7), documented as UTF-16 characters (execa's unit, not bytes — spec R2). The `exec/index.ts` placeholder is replaced with real exports. `ProcessRunner.contract.ts` is the sixth portable contract suite (alongside `ReviewEngine`/`GitPort`/`ConfigStore`/`HarnessLoader`/`RunStore`), imports no concrete adapter, covering resolve-not-reject on non-zero exit (AC-10), typed `InvalidProcessRequestError` (AC-13) and `ProcessSpawnError` (AC-14) rejections, and basic stdout capture — deliberately thin per plan.md, leaving the execa-specific and real-child proofs to ST-2 and ST-4.
- **Validation**:
  - `npm run check`: green — 114 files (biome), `tsc --noEmit` clean, `depcruise src` 0 violations (80 modules, 164 dependencies) — independently re-run.
  - `npm test`: `process-runner-exec.test.ts` (driving the contract suite against real `node -e` children) 4/4 passing, independently re-run in isolation. Full suite: 390 tests green.
  - Diff scope: confirmed via `git status --porcelain` — exactly the 4 named files (plus this change's own `state.yaml`/`execution-log.md`) — independently verified. Source of `process-runner-exec.ts` read in full and confirmed to match spec.md's pinned option bag and design.md's flow verbatim.
- **Deviations (ST-3)**: none. `DEFAULT_MAX_OUTPUT_CHARS` (1,000,000) and `FORCE_KILL_AFTER_DELAY_MS` (2000, reused from the `claude-code` engine seam) are new adapter-owned numeric choices, explicitly anticipated and licensed by design.md D-7 ("the adapter owns the two numeric defaults as module constants") — not a scope deviation.
