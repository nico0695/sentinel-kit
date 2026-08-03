# Plan: E2.F3.H2 — Diff with size policy

## Change ID
`e2-f3-h2-diff-size-policy`

## Execution mode
`auto` — single stage, bounded scope (3 new files, 2 modifications, 1 new test file in the existing workspace module).

---

## Stage 1 (only stage): Implement computeReviewDiff use case

### Objective
Add the fourth use case (`computeReviewDiff`) to `src/core/workspace/`: domain types, error class, use case with internal helpers (parsing, estimation, truncation), barrel re-exports, extended test fake, and 31 test scenarios.

### Files to create/modify (in implementation order)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `src/core/workspace/diff-types.ts` | create | Four readonly type definitions: `DiffFileEntry` (per-file entry with path, additions, deletions, content, truncated, diffLineCount), `DiffTruncatedWarning` (structured warning with `kind: "diff-truncated"` discriminator and metric fields), `DiffWarning` (discriminated union alias = `DiffTruncatedWarning`), `ReviewDiff` (aggregate result with files, totalLines, estimatedTokens, truncated, warnings). No imports. All fields `readonly`, arrays `readonly T[]`. ~55 lines. |
| 2 | `src/core/workspace/diff-errors.ts` | create | Single error class `DiffSizePolicyError extends WorkspaceError`. Imports `WorkspaceError` from `./workspace-errors.js`. Constructor takes `message: string` only (no `cause`, no options), sets `this.name = "DiffSizePolicyError"`. Follows `InvalidWorktreeRequestError` pattern exactly. ~15 lines. |
| 3 | `src/core/workspace/compute-review-diff.ts` | create | Main use case file. Top-to-bottom structure: imports, exported constants (`DEFAULT_MAX_LINES = 3000`, `DEFAULT_MAX_TOKENS = 50000`), exported interfaces (`ComputeReviewDiffRequest`, `ComputeReviewDiffDeps`), internal types (`ParsedFileChunk`, `WorkingFileEntry`), private helpers (`estimateTokens`, `parseRawDiff`, `truncateFiles`, `toReadonlyEntries`), exported async function `computeReviewDiff`. ~180 lines. |
| 4 | `src/core/workspace/index.ts` | modify | Append three new export groups after existing exports. Update module JSDoc to mention four use cases. New groups: (a) value + type re-exports from `./compute-review-diff.js`, (b) type-only re-exports from `./diff-types.js`, (c) value re-export of `DiffSizePolicyError` from `./diff-errors.js`. |
| 5 | `src/core/workspace/__test__/workspace-git-fake.ts` | modify | Extend with `mergeBase` and `diff` support. Add type imports for `DiffRequest`, `DiffResult`, `MergeBaseRequest` from `../../repos/index.js`. Add 4 optional fields to `FakeGitPortConfig` (`mergeBaseResult`, `mergeBaseError`, `diffResult`, `diffError`). Add 2 array fields to `FakeWorktreeState` (`mergeBaseCalls`, `diffCalls`). Replace `mergeBase`/`diff` `notImplemented` stubs with real implementations (push to tracking array, check error injection, return configured or default result). |
| 6 | `src/core/workspace/__test__/compute-review-diff.test.ts` | create | 31 test scenarios in 7 `describe` groups matching spec sections 9.1-9.7. Includes `buildRawDiff` and `buildStats` test data builders for generating realistic multi-file diffs. ~450-500 lines. |

### Files NOT modified

No changes to any file outside `src/core/workspace/`. Specifically:
- `src/core/repos/**` — unchanged. `GitPort`, `DiffRequest`, `DiffResult`, `MergeBaseRequest`, `FileStats`, `GitMergeBaseError`, `GitDiffError` are consumed, not modified.
- `src/core/run/**` — unchanged.
- `src/main/**` — unchanged. No adapter wiring in this story.
- `tsconfig.json`, `biome.json`, `.dependency-cruiser.cjs` — unchanged.

### Implementation notes for the executor

1. **Import style**: All cross-module imports use `.js` extensions. Type-only imports use `import type`. Value imports only where `extends` or `instanceof` is needed.

2. **Cross-module import**: `compute-review-diff.ts` imports `type GitPort` from `../repos/index.js` (type-only, satisfies architecture guard). No value imports from repos needed — git errors propagate unwrapped and are never caught or referenced by value in this file.

3. **Error pattern**: `DiffSizePolicyError` follows `InvalidWorktreeRequestError` exactly: constructor takes `message: string` only, calls `super(message)`, sets `this.name`. No `cause`, no options object.

4. **Internal helpers** (not exported, all inside `compute-review-diff.ts`):
   - `estimateTokens(text: string): number` — `Math.ceil(text.length / 4)`. Pure, no edge cases.
   - `parseRawDiff(raw: string): ParsedFileChunk[]` — regex `/^diff --git /gm` with `exec()` loop to find indices, slice between consecutive indices. Path extraction via `indexOf(" b/")` on the header line. Line count via character scan for `\n`. Returns `ParsedFileChunk[]`.
   - `truncateFiles(entries, totalLines, estimatedTokens, maxLines, maxTokens)` — greedy largest-first loop. Tie-breaking: `>=` comparison ensures highest index wins among equal-sized files. Mutates `WorkingFileEntry` in-place (content to null, truncated to true). Returns `{ totalLines, estimatedTokens, warning }`.
   - `toReadonlyEntries(working: WorkingFileEntry[]): DiffFileEntry[]` — maps working entries to readonly `DiffFileEntry`, dropping internal `entryTokens` field.

5. **Working entry type**: `WorkingFileEntry` is internal to `compute-review-diff.ts`. It has mutable `content` and `truncated` fields (for truncation loop) plus `entryTokens` (for per-file token bookkeeping). After truncation, `toReadonlyEntries` seals the data into readonly `DiffFileEntry[]`.

6. **Main flow** (`computeReviewDiff`):
   - Step 1: Validate inputs (repoPath non-empty + absolute, baseRef/targetRef non-empty, limits positive if provided).
   - Step 2: `deps.git.mergeBase(...)` — let `GitMergeBaseError` propagate unwrapped.
   - Step 3: `deps.git.diff(...)` — let `GitDiffError` propagate unwrapped.
   - Step 4: Empty diff short-circuit (raw === "" && stats.length === 0).
   - Step 5: `parseRawDiff(diffResult.raw)` + build `Map<string, ParsedFileChunk>`.
   - Step 6: Build `WorkingFileEntry[]` from stats+chunks. Handle stats-only (binary) and orphan chunks (no matching stat).
   - Step 7: Evaluate size policy. If within limits, return with `truncated: false`.
   - Step 8: `truncateFiles(...)`.
   - Step 9: Assemble and return `ReviewDiff`.

7. **Fake extensions** (`workspace-git-fake.ts`):
   - `mergeBase`: push req to `mergeBaseCalls`, check `mergeBaseError`, return `mergeBaseResult ?? "abc123def456"`.
   - `diff`: push req to `diffCalls`, check `diffError`, return `diffResult ?? { raw: "", stats: [] }`.
   - New config fields are optional — all existing tests continue to work unchanged. New state arrays are always initialized (empty).

8. **Test data builders** (`compute-review-diff.test.ts`):
   - `buildRawDiff(files: { path: string; lineCount: number }[]): string` — generates realistic unified diff with `diff --git a/<path> b/<path>` headers, index line, `---/+++` lines, `@@` hunk header, and `+line N` addition lines. Each file produces `lineCount` addition lines, so line counts in the output are predictable.
   - `buildStats(files: { path: string; lineCount: number }[]): FileStats[]` — generates matching stats with `lineCount` additions and 0 deletions.
   - Both share the same `{ path, lineCount }` spec array so tests can pass one spec to both and get consistent data.

9. **Test organization**: 7 describe groups:
   - 9.1 AC-1 configurable limit (6 tests: under limit, over lines, over tokens, defaults, invalid maxLines, invalid maxTokens)
   - 9.2 AC-2 warning visibility (3 tests: warning present, no warning, accurate metrics)
   - 9.3 AC-3 truncation preserves file list (3 tests: all files present, stats retained, content retained)
   - 9.4 truncation algorithm (5 tests: largest first, multiple truncated, all truncated, single file, tie-breaking)
   - 9.5 edge cases (5 tests: empty diff, single file, exact boundary, one over, token estimation)
   - 9.6 error handling (6 tests: merge-base error, diff error, empty repoPath, non-absolute, empty baseRef, empty targetRef)
   - 9.7 diff parsing (3 tests: multi-file, path extraction, binary/stats-only)

10. **Barrel export style** (`index.ts`): Follow existing grouping convention — one `export { ... } from "./source.js"` block per source file with `type` keyword on type-only members. Value exports (`computeReviewDiff`, `DEFAULT_MAX_LINES`, `DEFAULT_MAX_TOKENS`, `DiffSizePolicyError`) use regular export; type-only exports use `export type`.

### Validation (run after all files are created/modified)

```bash
# 1. Type-check + lint + architecture guards
npm run check

# 2. Run workspace unit tests only
npx vitest run --project core src/core/workspace

# 3. Verify all 31 new scenarios pass
# Expected: 31 new tests in compute-review-diff.test.ts, all green

# 4. Full test suite (regression — existing 28 workspace tests still pass)
npm test
```

All four commands must pass. Failures block the stage.

### Success criteria

- 3 new files created: `diff-types.ts`, `diff-errors.ts`, `compute-review-diff.ts`.
- 2 files modified: `index.ts` (new exports), `workspace-git-fake.ts` (mergeBase + diff support).
- 1 new test file: `compute-review-diff.test.ts` with 31 passing scenarios.
- `npm run check` passes (biome, tsc strict, dependency-cruiser architecture guards).
- `npm test` passes with all 59 workspace scenarios green (28 existing + 31 new).
- No imports from `src/adapters/`, `src/main/`, or I/O libraries in any new/modified core file.
- Internal helpers (`estimateTokens`, `parseRawDiff`, `truncateFiles`, `toReadonlyEntries`, `ParsedFileChunk`, `WorkingFileEntry`) are NOT exported from `compute-review-diff.ts`.
- All type-only re-exports in `index.ts` use `export type`.

---

## Dependency graph

```
diff-types.ts (no deps)
workspace-errors.ts (existing)
     │
     ▼
diff-errors.ts ──────────────────┐
     │                           │
     ▼                           ▼
compute-review-diff.ts ◄── ../repos/index.js (type-only: GitPort)
     │
     ▼
index.ts (barrel, re-exports all)

__test__/workspace-git-fake.ts ◄── ../repos/index.js (types: DiffRequest, DiffResult, MergeBaseRequest)
     │
     ▼
__test__/compute-review-diff.test.ts ◄── ../index.js (use case + types + errors)
```

Foundation files (1-2) have no interdependencies and can be written in either order. The use case file (3) depends on both. Barrel update (4) depends on 1-3. Fake extension (5) is independent of 1-3 but must precede the test file. Test file (6) depends on everything.

---

## Open risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `parseRawDiff` regex fails on paths containing literal ` b/` | Very low | Document as known limitation (per spec). Can be refined later without API changes. |
| Token heuristic significantly mis-estimates for non-Latin content | Medium | The limit is a tunable threshold. Document heuristic as approximate in JSDoc. |
| Fake backward compatibility — existing tests call `createFakeGitPort()` without new config fields | None | All new config fields are optional. New state arrays always initialized empty. Verified by running full test suite. |
| `buildRawDiff` test helper produces diff format that diverges from real git output | Low | Helper generates standard unified diff format with realistic headers. Not used for adapter tests — core unit tests only. |

---

## Estimated scope
- 3 new files + 2 modifications + 1 new test file, ~700-750 lines total (production ~250, tests ~450, fake delta ~30).
- Single execution stage.
- No B/C decisions anticipated — all implementation choices are A-level (aligned with spec and design).
