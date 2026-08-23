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

## ST-4 — Real-child test suite, closing gate

- **Status**: completed
- **Scope**: `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` (edit only — appended `describe` blocks to the existing thin driver; no new production code)
- **What landed**: 8 real-process test groups (14 tests) using `createExecProcessRunner()` directly against real `node -e` children, deliberately not repeating anything `ProcessRunner.contract.ts` already covers:
  1. **AC-1, the load-bearing reaping proof**: a `SIGTERM`-trapping child prints its own pid as stdout's first line (the port exposes no pid field), is run with a short `timeoutMs`; asserts `signal: "SIGKILL"`, then polls (`waitUntil`, 20×50ms) for `process.kill(pid, 0)` to throw `ESRCH` rather than asserting liveness once.
  2. AC-2/AC-3: cooperative child → `timedOut: false`; a hanging child → `timedOut: true`.
  3. AC-4: `"a\n\n"` captured byte-exactly — the direct regression test for spec's R4 finding (`stripFinalNewline: false`).
  4. AC-5: stdout/stderr captured independently, cross-checked for no bleed.
  5. AC-11: `cwd` honored against a fresh `mkdtemp` dir, both sides `realpathSync`-normalized.
  6. AC-12: an arg containing `; touch <marker>` arrives verbatim in the child's `argv` and creates no file — the direct regression test for the no-shell invariant.
  7. AC-14, the two real spawn-failure shapes the contract suite does not cover: a `chmod 600` non-executable file (EACCES) and an absolute `cwd` that does not exist on disk — both `ProcessSpawnError` with `cause` populated.
  8. AC-17 real corroboration: a child flooding stdout past a 4096-char budget while ignoring `EPIPE` and never exiting — asserts `timedOut: true` **and** a truncation flag `true` together, the real-process counterpart to ST-2's hand-built unit test.
- **Validation**:
  - `npm run check`: green — 114 files (biome), `tsc --noEmit` clean, `depcruise src` 0 violations (80 modules, 164 dependencies) — independently re-run.
  - `npm test`: `process-runner-exec.test.ts` 14/14 passing (up from ST-3's 4, all real children), independently re-run in isolation.
  - **AC-15 closing-gate check**: `git diff --stat 8c080cb..HEAD -- src/core/run/run-review.ts src/adapters/driven/git src/adapters/driven/engines` is empty — independently re-run against the correct merge-base with `origin/main` (`8c080cb`, the post-[E5.F2.H2]-merge commit; the executor worker's own diff computation used a stale pre-merge base and was re-derived correctly here). `grep -rn "execa" src/core/` returns only two doc-comment mentions of the word, zero import statements — confirmed no `execa` import anywhere under `src/core/**`.
  - **Full-story diff**: `git diff --stat 8c080cb..HEAD -- src/` shows exactly 11 files (680 insertions, 3 deletions) — the 5 ST-1 files, 2 ST-2 files, 3 new + 1 edited ST-3 files, 1 edited ST-4 file — matching plan.md's stage plan file-for-file, nothing from `src/main/` or any adapter other than `exec`.
- **Deviations (ST-4)**: none in test content. One process correction made by the orchestrator (not the executor): the executor's own AC-15/full-story-diff computation used `main` as the comparison base, which predates the `[E5.F2.H2]` merge (`8c080cb`) and so spuriously included that already-merged story's files in the reported diff; the orchestrator re-ran both checks against the correct merge-base (`origin/main` at `8c080cb`) and confirmed the true scope is exactly this story's 11 files.

## ST-5 — Fix stage: review-ledger R4-001 (CRITICAL)

- **Status**: completed
- **Scope**: `src/adapters/driven/exec/classify-execa-result.ts` (edit), `src/adapters/driven/exec/process-runner-exec.ts` (edit), `src/adapters/driven/exec/__test__/classify-execa-result.test.ts` (edit), `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` (edit)
- **What landed**: `ExecaLikeResult` grows three required fields (`command`, `args`, `cwd`); `process-runner-exec.ts` populates them straight from `request` when building the object handed to `classifyExecaResult` (all three always present on `request`, so no conditional spread needed); the "never ran" branch's thrown `ProcessSpawnError` message now interpolates `result.command` (e.g. `"process failed to spawn: nonexistent-binary-xyz (ENOENT)"`), and `cause: result` carries the full context by construction now that the type includes it. New regression test in `classify-execa-result.test.ts` (`"populates ProcessSpawnError's cause and message with command/args/cwd (R4-001)"`) asserting both `cause` (via `toMatchObject`) and `message` (via `toContain`) carry the identifying context. Both ST-4's real-process EACCES and bad-`cwd` tests in `process-runner-exec.test.ts` extended with the same `cause` assertion at the real spawn boundary, not just the pure classifier — closing the gap between "the classifier is correct" and "the adapter actually wires real request data into it."
- **Validation**:
  - `npm run check`: green — 114 files (biome), `tsc --noEmit` clean, `depcruise src` 0 violations (80 modules, 164 dependencies) — independently re-run.
  - `npm test`: `src/adapters/driven/exec/` suite 26/26 passing, independently re-run in isolation. Full suite: 401 tests green.
  - Diff scope: confirmed via `git status --porcelain` — exactly the 4 named files — independently verified. Source of both production files read in full; the regression test's assertions read directly and confirmed to actually exercise the fixed fields (`toMatchObject({ command, args, cwd })`, not a loose existence check).
- **Mutation proof** (performed by the executor, reverted afterward, `npm run check`/`npm test` re-confirmed clean): temporarily removed the `command`/`args`/`cwd` fields from `process-runner-exec.ts`'s object construction — the new/extended regression tests failed for exactly the claimed reason (`cause` missing the three fields), then restored.
- **Scoped re-review against the frozen `review-ledger.md`**: R4-001's fix delta touches only the two production files it was scoped to plus their direct test files; no spill into R4-002 (`risk-007`, deliberately deferred) or any of the five info-tier findings (R1-001, R2-001, R3-001, R3-002, R3-003), all left exactly as recorded in the ledger. R4-001 status: `open` → `fixed`.
- **Deviations (ST-5)**: none.
