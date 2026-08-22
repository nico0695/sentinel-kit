# Plan

## Execution Digest

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    4 executor stages, matching design.md's own recommended sequencing. ST-1 lands the core
    surface: port extension (`RunSummary`/`RunStatus`, `list`/`get` on `RunStore`),
    `RunMetadataSchema` with its two-direction compile-time drift guards, three new errors
    (`InvalidRunQueryError`/`RunNotFoundError`/`RunCorruptedError`) plus the broadened
    `RunPersistenceError` doc comment, the two use cases (`listRuns`/`getRun`), and the barrel —
    pure types/schema/use-case delegation, no fs. ST-2 lands the pure adapter functions
    (`parseRunTimestamp`, `classifyRunDirEntry`) with their own fs-free unit tests, proving D8/D9's
    classification rule before any I/O exists to obscure it. ST-3 lands the impure `list()`/`get()`
    flows in `run-store-fs.ts` plus the thickened `RunStore.contract.ts` (the portable read
    assertions design flagged as closing `[E5.F2.H1]`'s `risk-004`). ST-4 adds the fs-specific
    planted-state tests (partial/corrupt/stray-entry/dedupe/injection) and is the story's closing
    gate, re-verifying AC-15.
- stage_plan_digest: >-
    ST-1 core/history/ports/{run-store,run-metadata-schemas,run-store-errors,run-store-schemas}.ts
    + core/history/{list-runs,get-run}.ts + core/history/index.ts (barrel) -> ST-2
    adapters/driven/storage/run-layout.ts (extend) + its test (extend) (depends on ST-1's
    RunMetadata/RunSummary types) -> ST-3 adapters/driven/storage/run-store-fs.ts (extend) +
    RunStore.contract.ts (extend) (depends on ST-1, ST-2) -> ST-4
    adapters/driven/storage/__test__/run-store-fs.test.ts (extend) + closing gate (depends on ST-3).
- validation_digest: >-
    Per stage: `npm run check` (biome + tsc + depcruise) and `npm test` green, diff scoped to the
    stage's named files only. ST-4 additionally re-verifies AC-15 (empty diff over src/core/run
    for the whole story) and the architecture guards.

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Core surface: `RunStatus`/`RunSummary` and `list`/`get` added to `RunStore` (`ports/run-store.ts`); `RunMetadataSchema` + literal-array drift guards (`ports/run-metadata-schemas.ts`, new); `InvalidRunQueryError`/`RunNotFoundError`/`RunCorruptedError` + broadened `RunPersistenceError` doc (`ports/run-store-errors.ts`); `RunQueryFieldsSchema` alongside the existing path-fields schema (`ports/run-store-schemas.ts`); `listRuns`/`getRun` use cases (new files); real barrel update | — | `src/core/history/ports/run-store.ts` (edit), `src/core/history/ports/run-metadata-schemas.ts` (new), `src/core/history/ports/run-store-errors.ts` (edit), `src/core/history/ports/run-store-schemas.ts` (edit), `src/core/history/list-runs.ts` (new), `src/core/history/get-run.ts` (new), `src/core/history/index.ts` (edit), `src/core/history/__test__/list-runs.test.ts` (new), `src/core/history/__test__/get-run.test.ts` (new) | `npm run check` green (`tsc` proves the drift guards compile — a deliberate broken guard should fail typecheck, sanity-checked during the stage; `depcruise` proves `RunMetadataSchema` imports only `zod` + `run`'s types via barrel); `npm test` green with the two new use-case test files (in-memory fake `RunStore`, delegation only — no fs) | yes | yes | pending |
| ST-2 | Pure adapter functions: `parseRunTimestamp` (inverse of `formatRunTimestamp`, verified round-trip) and `classifyRunDirEntry` (D9's three-way rule: ts-dir → final, `.partial-<ts>` → partial, anything else → other) in `run-layout.ts` | ST-1 | `src/adapters/driven/storage/run-layout.ts` (edit), `src/adapters/driven/storage/__test__/run-layout.test.ts` (edit) | `npm run check` + `npm test` green; unit tests, no fs/temp dir: round-trip for `parseRunTimestamp` (AC-2), rejection of malformed names, all three `classifyRunDirEntry` branches including the `.partial-` prefix stripping (AC-5, AC-12) | yes | yes | pending |
| ST-3 | Impure `list()`/`get()` flows in `run-store-fs.ts` per design's two flows (validate → scan/classify → parse+validate metadata → dedupe/sort for `list`; validate → resolve id → read metadata+bodies for `get`); thicken `RunStore.contract.ts` with the portable read assertions (ordering, empty-repo, ok-entry field mapping, get round-trip, not-found) | ST-1, ST-2 | `src/adapters/driven/storage/run-store-fs.ts` (edit), `src/adapters/driven/storage/__test__/RunStore.contract.ts` (edit) | `npm run check` + `npm test` green; contract suite covers AC-1, AC-3, AC-8, AC-9, AC-10 (the criteria observable through the port alone, portable across any future `RunStore`) | yes | yes | pending |
| ST-4 | fs-specific planted-state tests: `.partial-<ts>` inclusion and final-wins dedupe (AC-4), minimal partial shape (AC-5), 4 corrupt-metadata cases incl. `version: 2` (AC-6), mixed ok+partial+corrupt listing (AC-7), partial/corrupt `get()` rejection (AC-11), stray file/non-ts-dir silently ignored (AC-12), path-traversal rejection with no-fs-access proof (AC-13), raw fs failure translation via `vi.doMock("node:fs/promises")` (AC-14, precedent from `[E5.F2.H1]`'s ST-4); **closing gate** | ST-3 | `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (edit) | `npm run check` + `npm test` green; **closing gate additionally verifies**: (a) `git diff <story base>..HEAD -- src/core/run` is empty (AC-15); (b) `depcruise src` confirms all four architecture guards hold; (c) full story diff confined to the 9 files named across ST-1..ST-4 | yes | yes | pending |

## Validation Strategy

- Each stage runs `npm run check` and `npm test` before being reported complete, matching the `[E5.F2.H1]` precedent.
- ST-1 introduces the story's only genuinely novel typecheck risk (the `satisfies` + `Expect<Exclude<...>>` drift guards): the stage's validation includes confirming the guard actually catches a deliberately-broken case during development (e.g. temporarily dropping a union member from the literal array and observing a typecheck failure), then reverting — analogous to `[E5.F2.H1]`'s mutation-testing discipline but applied to a compile-time guard instead of a runtime assertion.
- ST-2 is where the design's D8/D9 classification rule gets its cheapest proof: `classifyRunDirEntry` is a pure string function, so all three branches and the edge case (prefix stripping) are ordinary unit tests with no temp directory.
- ST-3's contract additions are deliberately scoped to what's observable through `save`+`list`+`get` alone (no on-disk assertions) — matching `[E5.F2.H1]`'s stated split between the portable contract and the fs-specific test.
- ST-4 reuses the exact `vi.doMock("node:fs/promises")` injection technique `[E5.F2.H1]`'s ST-4 precedented, rather than inventing a new failure-injection mechanism.
- ST-4 is the story's closing gate: after its diff, verify the full story diff touches exactly the 9 files named across ST-1..ST-4, `src/core/run/**` is untouched (AC-15), and no adapter other than `storage` or any `src/main/` file appears in the diff.
- No manual/human-in-the-loop verification anywhere in this plan — the whole story is filesystem I/O against a temp directory plus pure functions, fully testable in CI.

## Dependencies And Sequencing

- ST-2 depends on ST-1 for the `RunMetadata`/`RunSummary` type shapes `classifyRunDirEntry`'s return type and `run-store-fs.ts` will reference.
- ST-3 depends on ST-1 (the port signatures it implements, the schema it validates through, the errors it throws) and ST-2 (`parseRunTimestamp`/`classifyRunDirEntry`, which `run-store-fs.ts` calls rather than reimplementing inline).
- ST-4 depends on ST-3 existing to have `list()`/`get()` implementations to test against; it adds no new production code, matching `[E5.F2.H1]`'s ST-4 precedent for a tests-only closing stage.
- No stage touches `src/core/run/**` — design's central claim (AC-15), enforced by construction: no stage's Expected Scope lists a `run` file, and ST-4's closing gate makes the empty diff an explicit checked assertion.
- No stage touches `save()`, `deriveRunPaths`, or `serializeRunMetadata` — this plan is additive-only over `[E5.F2.H1]`'s write-side code.

## Planner Stop Note

- Not applicable: `objective` is `new-feature`. This plan is execution-ready; `sddl-executor` runs ST-1 through ST-4 one at a time, each gated by its own `stage_approval` checkpoint.

## Approval Notes

- User approved design.md ("si, avanza con el plan") and this plan proceeds under the same advancement. Each stage still requires its own explicit `stage_approval` before `sddl-executor` touches code.
- Sequencing follows design.md's own recommendation verbatim (core-first, then pure layout functions, then fs read flows plus contract thickening, then planted-state tests as the closing gate).
