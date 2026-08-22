# Execution Log

## Execution Digest

- change_name: e5-f2-h1-run-store
- last_stage_executed: ST-1
- last_stage_status: completed
- digest_summary: >-
    ST-1 landed the core port surface with no fs, no adapter, and no test file (pure declarations
    plus one zod schema, exactly as planned). `npm run check` and `npm test` (295/295, unchanged)
    both green. Diff is exactly the 4 files plan.md named for ST-1; `src/core/run/**` verified
    untouched via `git diff --stat -- src/core/run` (empty).

## Stage ST-1 — Core port surface

- **Goal**: `RunStore`, `RunRecord`, `RunDiffSummary`, `RunFailureRecord`; `RunRecordPathFieldsSchema`
  (zod, validates only the two path-sensitive fields per D-1/D-2); `HistoryError` +
  `InvalidRunRecordError` + `RunAlreadyExistsError` + `RunPersistenceError` (D-3, at
  `ports/run-store-errors.ts`); real `history/index.ts` barrel replacing `export {}`.
- **Files touched**:
  - `src/core/history/ports/run-store.ts` (new) — the port and the three domain shapes.
  - `src/core/history/ports/run-store-schemas.ts` (new) — `RunRecordPathFieldsSchema`.
  - `src/core/history/ports/run-store-errors.ts` (new) — `HistoryError` hierarchy, mirroring
    `config-store-errors.ts`'s base-class-plus-subclass pattern (dec-006), `cause` stored
    conditionally for `exactOptionalPropertyTypes`.
  - `src/core/history/index.ts` (edit) — real barrel; replaced the `export {}` placeholder.
- **Deviation from plan.md, none material**: `history/index.ts`'s three export blocks were
  reordered alphabetically by import path after running `npx biome check --write`, matching the
  exact same mechanical fix `[E4.F2.H3]`'s ST-2 needed for the same reason (biome's
  `assist/source/organizeImports`). No logic change; content identical, order only.
- **Validation**:
  - `npm run check`: `biome check .` clean (96 files) / `tsc --noEmit` clean / `depcruise src`:
    "no dependency violations found (70 modules, 134 dependencies cruised)" — confirms the new
    files import only `zod` and `../../run/index.js`, nothing from `src/adapters/**` or
    `src/main/**` (AC-21's core-only half).
  - `npm test`: 295/295 passed, unchanged from before this stage — expected, since ST-1 adds no
    test file (pure declarations + one schema, no behavior to unit-test in isolation yet; ST-2
    exercises the schema and the record shape together via `serializeRunMetadata`).
  - `git status --short`: exactly `M src/core/history/index.ts` + the new `ports/` directory —
    matches plan.md's ST-1 file list with no extra files touched.
  - `git diff --stat -- src/core/run`: empty. AC-3's central claim holds after ST-1.
- **AC coverage this stage**: AC-1 (port shape), AC-2 (`RunRecord` field set — all backlog
  metadata fields present, `startedAtEpochMs`/`durationMs` as numbers per the codebase's
  `now(): number` clock convention), AC-3 (empty `run` diff, verified above), AC-16
  (`RunFailureRecord` is `{ stage: RunStage; message: string }`, reusing the pipeline's own
  `RunStage` union rather than a loose `string` — structurally excludes a raw exception), AC-19
  (schema rejects empty/separator-bearing/leading-dot `repoName` and non-finite/negative/
  non-integer `startedAtEpochMs` — enforcement wiring lands in ST-3, but the rule itself is fixed
  here). Runtime behavior (the schema actually rejecting bad input, the serializer actually
  producing the declared JSON shape) is proven in ST-2/ST-3/ST-4, not here — this stage proves the
  shapes compile and import cleanly.
- **Status**: completed.

## Stage ST-2 — Pure layout module

- **Goal**: `formatRunTimestamp`, `deriveRunPaths`, `serializeRunMetadata` in a pure module with no
  fs dependency, proving AC-4/AC-9/AC-10/AC-14 (timestamp half)/AC-18 before any I/O exists to
  obscure them.
- **Files touched**:
  - `src/adapters/driven/storage/run-layout.ts` (new).
  - `src/adapters/driven/storage/__test__/run-layout.test.ts` (new, 14 tests).
- **Deviation from plan.md, none material**: same mechanical biome long-line reformat (`--write`)
  as ST-1 and as `[E4.F2.H3]`'s ST-2 needed — no logic change.
- **Non-vacuity proof (mutation)**: added `_leak: record.prompt` into `serializeRunMetadata`'s
  returned object, ran only the AC-18 decoy test — it failed for the right reason (`serialized`
  contained the decoy token via the injected leak field, visible in the diff output). Reverted;
  `git diff -- src/adapters/driven/storage/run-layout.ts` empty afterward; full suite re-verified
  clean (309/309).
- **Validation**:
  - `npm run check`: biome clean (98 files) after one mechanical reformat / `tsc --noEmit` clean /
    `depcruise src`: "no dependency violations found (71 modules, 136 dependencies cruised)" —
    confirms `run-layout.ts` imports only `node:path` (adapter layer, permitted) and
    `../../../core/history/index.js`, nothing from other adapters (`adapters-isolated` guard).
  - `npm test`: 309/309 (295 + 14 new). All 14 new tests are in `run-layout.test.ts`; no existing
    test file changed.
  - `git status --short`: exactly the 2 files plan.md named for ST-2.
  - `git diff --stat -- src/core/run`: empty. AC-3 still holds after ST-2.
- **AC coverage this stage**: AC-4 (exact field set, verified by `Object.keys` equality and by
  three omitted-vs-present cases), AC-9 (lexicographic-equals-chronological, verified across a
  millisecond/day/month/year boundary, not just two adjacent timestamps), AC-10 (`RunDiffSummary`
  serializes to exactly its five fields — a structural proof, since the serializer's parameter
  type has no per-file `content` field to leak, not merely a content check), AC-14's determinism
  half (`formatRunTimestamp` proven pure; `deriveRunPaths` proven to name the same staging
  directory for the same `ts`, which is what makes ST-3's same-timestamp retry-clearing safe),
  AC-18 (decoy token in `prompt`/`engineOutput`/`validationOutput` never appears in serialized
  output; a parallel test documents that `failure.message` is deliberately excluded from the
  decoy set, per the AC's own carved-out exception, so a reader doesn't mistake the omission for
  an oversight).
- **Status**: completed.

## Stage ST-3 — Impure fs adapter and portable contract suite

- **Goal**: `createRunStoreFsAdapter(runsRoot): RunStore` wiring design.md's 10-step `save()` flow
  verbatim; the portable `RunStore.contract.ts`; the storage barrel export.
- **Files touched**:
  - `src/adapters/driven/storage/run-store-fs.ts` (new).
  - `src/adapters/driven/storage/__test__/RunStore.contract.ts` (new, 9 tests).
  - `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (new — see deviation below).
  - `src/adapters/driven/storage/index.ts` (edit, one export line).
- **Deviation from plan.md, flagged rather than silent**: plan.md's ST-3 file list named
  `RunStore.contract.ts` but not a driver file to actually execute it (the contract suite is a
  parameterized `describe` block — nothing runs it without a harness wiring a concrete adapter,
  same as `ConfigStore.contract.ts` needs `config-store-yaml.test.ts`). Without one, ST-3's own
  validation bar ("`RunStore.contract.ts` covers: ...") could not be checked. Created
  `run-store-fs.test.ts` now as that driver, reusing the exact filename plan.md's ST-4 already
  targeted for fs-specific tests — ST-4 extends this same file rather than creating a new one, so
  no file is created twice and no filename changes.
- **Design refinement caught during implementation, not silent**: design.md's step-4 pseudocode
  didn't address a `stat` failure for a reason other than "not found" (e.g. `EACCES`) during the
  collision pre-check. Wrapped that path in `RunPersistenceError` too, consistent with AC-20
  ("every raw fs failure is translated") — the pre-check is fs I/O like any other step.
- **Non-vacuity proof (mutation)**: disabled the step-4 collision check (`if (false && ...)`), ran
  only the AC-13 "rejects a second save" test — it still failed, but instructively: with the
  pre-check bypassed, the second `save()` reaches the `rename` step, which fails with `ENOTEMPTY`
  against the real already-populated `finalDir` and surfaces as `RunPersistenceError` — not
  `RunAlreadyExistsError`. The test caught this precisely (`toBeInstanceOf(RunAlreadyExistsError)`
  failed against the wrong error class), which is itself a live demonstration of `risk-005` (the
  TOCTOU backstop engaging exactly as design.md described). Reverted;
  `git diff -- src/adapters/driven/storage/run-store-fs.ts` empty afterward; full suite
  re-verified clean (318/318).
- **Validation**:
  - `npm run check`: biome clean (101 files) after mechanical reformats / `tsc --noEmit` clean /
    `depcruise src`: "no dependency violations found (72 modules, 142 dependencies cruised)" —
    confirms `run-store-fs.ts` imports `node:fs/promises`, `node:path`, `zod` (type-only), the
    `history` barrel and `./run-layout.js` only — no other adapter (`adapters-isolated` guard).
  - `npm test`: 318/318 (309 + 9 new, all in the contract suite via its driver).
  - `git status --short`: the 4 files above, matching plan.md's ST-3 list plus the flagged
    driver-file deviation.
  - `git diff --stat -- src/core/run`: empty. AC-3 still holds after ST-3.
- **AC coverage this stage**: AC-1 (`save` resolves with the created path), AC-13 (`RunAlreadyExistsError`
  on a genuine collision; the rename-failure backstop path proven live by the mutation above),
  AC-15 (first save into an empty `runsRoot` succeeds via the contract suite's setup), AC-19
  (schema rejection wired end-to-end: empty/separator/leading-dot `repoName`, non-integer/
  negative/non-finite `startedAtEpochMs`, all rejecting before any directory is created), AC-20
  (every fs failure — including the collision pre-check itself — translated to `RunPersistenceError`
  with `cause` preserved). AC-2/AC-5/AC-6/AC-7/AC-8/AC-11/AC-12/AC-14/AC-16/AC-17/AC-18's on-disk
  and determinism halves are ST-4's job (they need fs-level assertions this stage's contract suite
  deliberately does not make, per `risk-004`).
- **Status**: completed.

## Stage ST-4 — fs-specific tests and closing gate

- **Goal**: on-disk file set/omissions, byte-for-byte content, zero-padded validation logs,
  atomicity via mid-staging failure injection, clockless determinism, the
  pre-existing-directory-unmodified half of AC-13, the decoy-token test observed on disk; the
  story's closing gate.
- **Files touched**: `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (edit — extended,
  not created, per the ST-3 deviation note above; +224/-7 lines, 8 new tests across 3 new
  `describe` blocks). No production file changed.
- **Non-vacuity proof (mutation), three separate mutations, each targeted so it would only be
  caught by the specific test it was meant to stress**:
  1. **AC-11 (atomicity)**: removed the best-effort staging-directory cleanup from the failure
     `catch` block. The atomicity test's load-bearing assertion (`finalDir` absent) still passed —
     correctly, since that assertion doesn't depend on cleanup — but its secondary assertion
     (`stagingDir` absent) failed with a clear diff (`expected true to be false`), proving that
     assertion is live, not vacuous. Reverted.
  2. **AC-14 (clockless)**: changed `formatRunTimestamp(record.startedAtEpochMs)` to
     `formatRunTimestamp(Date.now())` — i.e. made the adapter read the wall clock. The determinism
     test failed immediately: `expected .../20991231T235959999Z to be .../20200101T000000000Z` —
     the exact two fake-timer values from the test, proving the assertion genuinely exercises
     clock independence rather than passing by coincidence. Reverted.
  3. A red herring worth recording rather than hiding: an initial mutation attempt (leaving a
     stray directory behind after a *successful* rename) did not fail any test, because the
     mutated code path is unreachable from the atomicity test's *failure*-injection scenario.
     Recognized this as testing the wrong path, discarded it, and moved to mutation #1 above
     instead of counting the non-result as a pass.
  - All three reverted; `git diff -- src/adapters/driven/storage/run-store-fs.ts` empty after each
    revert; full suite re-verified clean (326/326) after the final revert.
- **AC-17 inspection** (no automated test, per design.md's explicit deferral — an absence isn't
  observable through the port): `grep -rn "process\.env" src/core/history
  src/adapters/driven/storage/run-store-fs.ts src/adapters/driven/storage/run-layout.ts
  src/adapters/driven/storage/index.ts` — **zero matches**. Recorded here as the evidence, not
  merely asserted.
- **Validation**:
  - `npm run check`: biome clean (101 files) after one mechanical reformat / `tsc --noEmit` clean /
    `depcruise src`: "no dependency violations found (72 modules, 142 dependencies cruised)" —
    unchanged from ST-3, confirming ST-4 added no new import edge.
  - `npm test`: 326/326 (318 + 8 new).
  - **Closing gate**:
    - `git diff --stat -- src/core/run`: empty. **AC-3 holds across the entire story.**
    - Full story diff (`git diff 628e72b~1..HEAD -- src/` plus the ST-4 working-tree delta):
      10 files — exactly `src/core/history/index.ts` (edit) + 3 new files under
      `src/core/history/ports/` + `src/adapters/driven/storage/index.ts` (edit) + 2 new files under
      `src/adapters/driven/storage/` + 3 new files under `src/adapters/driven/storage/__test__/`.
      No file outside `src/core/history/**` and `src/adapters/driven/storage/**`. No adapter other
      than `storage`. No `src/main/` file. Matches plan.md's ST-1..ST-4 file lists plus the two
      explicitly flagged deviations (ST-1's biome reorder, ST-3's driver-file creation), and
      nothing else.
    - `depcruise src` (rerun standalone above): confirms `src/core/history/**` imports nothing from
      `src/adapters/**`/`src/main/**`, and `src/adapters/driven/storage/**` imports no other
      adapter (`adapters-isolated` guard) — **AC-21 holds.**
- **AC coverage this stage**: AC-4 (on-disk field presence, cross-checked against ST-2's
  string-level proof), AC-5/AC-6 (byte-for-byte `result.md`/`prompt.md`), AC-7 (zero-padded
  `validations/NNN.log`, in order), AC-8 (omission of each optional artifact), AC-11/AC-12
  (atomicity, mutation-proven), AC-13's pre-existing-directory-unmodified half (implicit in the
  contract suite's ST-3 test, re-confirmed here at the fs level), AC-14 (clockless determinism,
  mutation-proven, plus the same-timestamp stale-staging-remnant retry clause), AC-17 (inspection,
  zero `process.env` hits), AC-18 (decoy token confirmed on disk: present in `prompt.md`/
  `result.md`/`validations/001.log`, absent from `metadata.json`), AC-21 (architecture guards,
  depcruise). **All 21 acceptance criteria from spec.md revision 2 are now covered by this
  story.**
- **Status**: completed. This is the story's closing gate; `sddl-executor`'s plan.md is fully
  executed. Recommended next: `sddl-code-review` (4R protocol) before `sddl-qa-review`.
