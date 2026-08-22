# Plan

## Execution Digest

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    4 executor stages, strictly ordered by import dependency, matching design.md's recommended
    sequencing: ST-1 lands the core port surface (RunStore, RunRecord, RunDiffSummary,
    RunFailureRecord, RunRecordPathFieldsSchema, the error family, and the real history barrel) —
    pure types plus one zod schema, no fs, no adapter. ST-2 lands the pure layout module
    (run-layout.ts: formatRunTimestamp, deriveRunPaths, serializeRunMetadata) with its own
    fs-free unit tests, proving AC-4/AC-9/AC-10/AC-18's serializer guarantees before any I/O
    exists to obscure them. ST-3 lands the impure fs adapter (run-store-fs.ts) plus the portable
    RunStore.contract.ts, wiring save()'s full flow from design.md's ten-step sequence. ST-4 adds
    the fs-specific adapter test (run-store-fs.test.ts) covering atomicity, determinism and the
    two techniques design.md named precedent for (vi.doMock injection, fake timers) — and is the
    story's closing gate.
- stage_plan_digest: >-
    ST-1 core/history/ports/{run-store,run-store-schemas,run-store-errors}.ts + core/history/
    index.ts (barrel) -> ST-2 adapters/driven/storage/run-layout.ts + its unit test (depends on
    ST-1's RunRecord type) -> ST-3 adapters/driven/storage/run-store-fs.ts + storage/index.ts
    export + RunStore.contract.ts (depends on ST-1, ST-2) -> ST-4 run-store-fs.test.ts + closing
    gate (depends on ST-3).
- validation_digest: >-
    Per stage: `npm run check` (biome + tsc + depcruise) and `npm test` green, diff scoped to the
    stage's named files only. ST-4 additionally re-verifies AC-3 (empty diff over src/core/run for
    the whole story) and the architecture guards (history imports run only via its barrel; no
    adapter/main import in src/core/history).

## Summary

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Core port surface: `RunStore`, `RunRecord`, `RunDiffSummary`, `RunFailureRecord` (design's Interfaces section); `RunRecordPathFieldsSchema` (zod, D-1/D-2); `HistoryError`/`InvalidRunRecordError`/`RunAlreadyExistsError`/`RunPersistenceError` (D-3, at `ports/run-store-errors.ts`); real `history/index.ts` barrel replacing `export {}` | — | `src/core/history/ports/run-store.ts` (new), `src/core/history/ports/run-store-schemas.ts` (new), `src/core/history/ports/run-store-errors.ts` (new), `src/core/history/index.ts` (edit) | `npm run check` green (`tsc --noEmit` proves the shapes compile and `RunStage`/`TerminalState`/`Verdict`/`ReviewUsage` import cleanly through `run/index.js`; `depcruise` proves no forbidden import — only `zod` and `../../run/index.js`); no test file yet, this stage is types + one schema | yes | yes | pending |
| ST-2 | Pure layout module: `formatRunTimestamp` (compact ISO from `startedAtEpochMs`), `deriveRunPaths` (repoDir/finalDir/stagingDir per design's layout), `serializeRunMetadata` (hand-written field-by-field, AC-4/AC-10/AC-18's structural guarantee) | ST-1 | `src/adapters/driven/storage/run-layout.ts` (new), `src/adapters/driven/storage/__test__/run-layout.test.ts` (new) | `npm run check` + `npm test` green; unit tests, no fs/temp dir needed since the module is pure: AC-9 (lexicographic == chronological, verified for at least 3 timestamps spanning a day/month/year boundary), AC-10 (a `diff.files`-shaped decoy is never referenced — N/A at this layer since `RunRecord.diff` is already `RunDiffSummary`, so this test asserts the serializer emits exactly `fileCount/totalLines/estimatedTokens/truncated/warnings`), AC-18 (decoy token in `prompt`/`engineOutput`/`validationOutput`/`failure.message` fields of the record never appears in the serialized metadata string, except deliberately for `failure.message` which the AC excludes and the test must document why), AC-4 (parsed output has exactly the declared field set, omissions are absent keys not `null`) | yes | yes | pending |
| ST-3 | Impure fs adapter wiring the 10-step `save()` flow from design.md verbatim (validate → derive paths → collision check → mkdir → clear same-timestamp staging remnant → stage files via `run-layout.ts` → rename → catch → `RunPersistenceError`); `createRunStoreFsAdapter(runsRoot): RunStore` factory function (no class, matching `createConfigStoreAdapter`); portable `RunStore.contract.ts` mirroring `ConfigStoreContractHarness`'s shape; export from `storage/index.ts` | ST-1, ST-2 | `src/adapters/driven/storage/run-store-fs.ts` (new), `src/adapters/driven/storage/__test__/RunStore.contract.ts` (new), `src/adapters/driven/storage/index.ts` (edit, one export line) | `npm run check` + `npm test` green; `RunStore.contract.ts` covers: valid record resolves with a non-empty absolute path; `InvalidRunRecordError` for empty/separator-bearing/leading-dot `repoName` and for non-integer/negative/non-finite `startedAtEpochMs`; `RunAlreadyExistsError` on a genuine second save of the identical record (AC-13); first save into an empty `runsRoot` succeeds (AC-15) | yes | yes | pending |
| ST-4 | fs-specific adapter test: on-disk file set and omissions (AC-4..AC-8 as observed on disk, not just in the serializer string), byte-for-byte `result.md`/`prompt.md`, zero-padded `validations/NNN.log`, atomicity via `vi.doMock("node:fs/promises")` mid-staging failure injection (AC-11, precedent from `opencode-adapter.test.ts`), determinism via `vi.useFakeTimers()` across two far-apart system times on the same record (AC-14), pre-existing-directory-unmodified half of AC-13; **closing gate** | ST-3 | `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (new) | `npm run check` + `npm test` green; **closing gate additionally verifies**: (a) `git diff <this-story's-base-commit>..HEAD -- src/core/run` is empty (AC-3); (b) `depcruise src` confirms `src/core/history/**` imports nothing from `src/adapters/**`/`src/main/**` and reaches `run` types only via `../../run/index.js` (AC-21); (c) AC-17 (no `process.env` read) verified by inspection — grep `process.env` across the 6 new/edited adapter+core files, expect zero hits, recorded in the execution log per design.md's explicit deferral; (d) full story diff confined to the files named across ST-1..ST-4 | yes | yes | pending |

## Validation Strategy

- Each stage runs `npm run check` (biome + `tsc --noEmit` + `depcruise src`) and `npm test` before being reported complete — matching the H1/H2/H3 precedent. ST-1 has no new test file (pure declarations), so its bar is `npm run check` green plus confirming no existing test regresses.
- ST-2 is where the design's riskiest guarantees (AC-4, AC-10, AC-18) get their first, cheapest proof: `serializeRunMetadata` is a pure string function, so these are ordinary unit tests with no temp directory, no fs mocking, and no timing sensitivity. Proving them here means ST-3/ST-4 only need to prove the adapter *calls* the serializer correctly, not that the serializer itself is correct.
- ST-3's `RunStore.contract.ts` is deliberately thin per design's Testing Design section (a write-only port can only assert what's observable through `save`) — `risk-004` in `state.yaml` already records this as accepted, not an oversight to fix here.
- ST-4 uses two specific techniques design.md named as precedented rather than novel: `vi.resetModules()` + `vi.doMock("node:fs/promises", ...)` wrapping the real module and failing one call (verbatim pattern in `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts`), and `vi.useFakeTimers()` for AC-14's clockless proof — chosen over grepping the source for `Date.now(`, since a behavioral proof survives an unrelated refactor and a grep does not.
- AC-17 (no env reads) is the one criterion with no automated test anywhere in the plan, by design.md's own explicit call. ST-4 records the inspection (grep for `process.env`, expect zero hits across the new/edited files) in the execution log rather than silently omitting evidence.
- ST-4 is the story's closing gate: after its diff, verify the full story diff touches exactly the files named across ST-1..ST-4, `src/core/run/**` is untouched (AC-3, the single most consequential claim in the whole design — ratified at `cp-spec-approval`/`cp-design-approval`), and no adapter other than `storage` or any `src/main/` file appears in the diff.
- No manual/human-in-the-loop verification anywhere in this plan (unlike H1/H2's AC-24) — the whole story is filesystem I/O against a temp directory, fully testable in CI with no external CLI dependency.

## Dependencies And Sequencing

- ST-2 depends on ST-1 for the `RunRecord`/`RunDiffSummary`/`RunFailureRecord` type imports `serializeRunMetadata` takes as its parameter.
- ST-3 depends on both ST-1 (the port interface it implements, the schema it parses through, the errors it throws) and ST-2 (`run-layout.ts`'s three functions, which `run-store-fs.ts` calls rather than reimplementing).
- ST-4 depends on ST-3 existing to have an adapter to test against; it adds no new production code, matching the precedent `[E4.F2.H3]`'s ST-4 set for a tests-only closing stage.
- No stage depends on any adapter outside `storage`, on `src/main/`, or on an external CLI — the full plan is executable with nothing installed beyond the existing toolchain.
- No stage touches `src/core/run/**`. This is the design's central claim (AC-3) and the plan enforces it by construction: no stage's Expected Scope lists a `run` file, and ST-4's closing gate makes the empty diff an explicit, checked assertion rather than an assumption.

## Planner Stop Note

- Not applicable: `objective` is `new-feature`, not `planner`. This plan is execution-ready; `sddl-executor` runs stages ST-1 through ST-4 one at a time, each gated by its own `stage_approval` checkpoint.

## Approval Notes

- User approved design.md ("si, avanza con el plan") and this plan proceeds under the same advancement. Per the workflow contract, each stage still requires its own explicit `stage_approval` before `sddl-executor` touches code — this plan being "approved" does not pre-authorize ST-1..ST-4 execution.
- Sequencing follows design.md's own recommendation verbatim ("core-first ... then the pure layout module with its unit tests, then the fs adapter with the contract suite, then the fs-specific tests") — no deviation from the design's suggested staging was needed.
- D-3's relocation of the error module (flagged at design approval, not silently applied) is reflected in ST-1's file list as `ports/run-store-errors.ts`; if that is unwelcome, ST-1 is the only stage that changes.
