# Plan: E2.F3.H1 — Per-review worktree lifecycle

## Change ID
`e2-f3-h1-worktree-lifecycle`

## Execution mode
`auto` — single stage, bounded scope (11 new files in one module, no cross-module modifications).

---

## Stage 1 (only stage): Implement workspace module

### Objective
Create the complete `src/core/workspace/` module: 3 use cases, error classes, domain type, private helpers, barrel index, shared test fake, and 28 test scenarios.

### Files to create (in implementation order)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `src/core/workspace/helpers.ts` | create | Three pure private helpers: `repoBasename`, `sanitizeBranchLabel`, `deriveWorktreePath`. No imports beyond each other. String-only path manipulation (no `node:path`). |
| 2 | `src/core/workspace/cleanup-policy.ts` | create | Single type export: `CleanupPolicy = "always" \| "on-success" \| "keep"`. |
| 3 | `src/core/workspace/workspace-errors.ts` | create | Error class hierarchy: `WorkspaceErrorOptions`, `WorkspaceError` (base with optional `cause`), `WorktreeCreationError`, `WorktreeCleanupError`, `InvalidWorktreeRequestError`. Follows `register-repo-errors.ts` pattern exactly. |
| 4 | `src/core/workspace/create-review-worktree.ts` | create | Use case `createReviewWorktree`. Types: `CreateReviewWorktreeRequest`, `CreateReviewWorktreeDeps` (with optional `now: () => number`), `ReviewWorktreeResult`. Imports: `type GitPort` and `GitWorktreeError` (value) from `../repos/index.js`; helpers from `./helpers.js`; errors from `./workspace-errors.js`. Validates inputs, derives path via helpers, calls `git.worktreeAdd`, wraps `GitWorktreeError` as `WorktreeCreationError`. |
| 5 | `src/core/workspace/cleanup-worktree.ts` | create | Use case `cleanupWorktree`. Types: `CleanupWorktreeRequest`, `CleanupWorktreeDeps`, `CleanupWorktreeResult`. Imports: `type GitPort` and `GitWorktreeError` from `../repos/index.js`; `type CleanupPolicy` from `./cleanup-policy.js`; errors from `./workspace-errors.js`. Evaluates policy truth table inline, conditionally calls `git.worktreeRemove`. |
| 6 | `src/core/workspace/list-orphan-worktrees.ts` | create | Use case `listOrphanWorktrees`. Types: `OrphanWorktreeInfo`, `ListOrphanWorktreesRequest`, `ListOrphanWorktreesDeps`, `ListOrphanWorktreesResult`. Imports: `type GitPort` from `../repos/index.js` (no error import — errors propagate unwrapped). Filters `worktreeList` result by `worktreesDir` prefix and `activeWorktreePaths` exclusion. |
| 7 | `src/core/workspace/index.ts` | rewrite | Replace stub (`export {}`) with full barrel. Re-exports: 3 use case functions (value), all request/deps/result types (type-only), `CleanupPolicy` (type-only), `OrphanWorktreeInfo` (type-only), 4 error classes (value), `WorkspaceErrorOptions` (type-only). Uses `export type` for type-only re-exports per `verbatimModuleSyntax`. Does NOT export `helpers.ts`. |
| 8 | `src/core/workspace/__test__/workspace-git-fake.ts` | create | Shared `createFakeGitPort` factory implementing only 3 worktree methods (`worktreeAdd`, `worktreeRemove`, `worktreeList`). All other `GitPort` methods throw `"not implemented"`. Features: tracks calls in arrays (`addCalls`, `removeCalls`, `listCalls`), stores worktrees in a `Map`, supports error injection per method, `worktreeList` always prepends main worktree entry. Returns `GitPort & FakeWorktreeState`. |
| 9 | `src/core/workspace/__test__/create-review-worktree.test.ts` | create | 13 test scenarios (spec #1-#13). Grouped: AC1 parallel isolation (4), happy path (2 — includes `WorktreeRef` structural compatibility via compile-time type assertion), validation errors (5), error handling (2). Uses `now: () => fixedTimestamp` in deps for deterministic assertions. |
| 10 | `src/core/workspace/__test__/cleanup-worktree.test.ts` | create | 8 test scenarios (spec #14-#21). Grouped: AC2 policy truth table (6 — all combinations of 3 policies x 2 outcomes), error handling (2). |
| 11 | `src/core/workspace/__test__/list-orphan-worktrees.test.ts` | create | 7 test scenarios (spec #22-#28). Grouped: AC3 orphan detection (6 — no orphans, all active, one orphan, multiple, external excluded, branch-less), error handling (1). Seeds fake with `initialWorktrees`. |

### Files NOT modified

No changes to any existing file outside `src/core/workspace/`. Specifically:
- `src/core/repos/**` — unchanged. `GitPort` and `GitWorktreeError` are consumed, not modified.
- `src/core/run/**` — unchanged. `WorktreeRef` is consumed type-only in test #6 (compile-time assertion), not modified.
- `src/main/**` — unchanged. No adapter wiring in this story.
- `tsconfig.json`, `biome.json`, `.dependency-cruiser.cjs` — unchanged. The workspace module follows existing conventions and passes existing rules.

### Implementation notes for the executor

1. **Import style**: All cross-module imports use `.js` extensions per `verbatimModuleSyntax`. Type-only imports use `import type`. Value imports (for `instanceof`) use regular `import`.

2. **Error pattern**: Follow `register-repo-errors.ts` exactly. The `cause` storage pattern is: `if (options !== undefined && "cause" in options) { this.cause = options.cause; }`. `InvalidWorktreeRequestError` takes no options (only a message), matching `InvalidRepoRequestError`.

3. **Fake pattern**: Follow `register-repo.test.ts` fake factory style. The workspace fake is scoped to worktree methods only. The `notImplemented` stub pattern for unused `GitPort` methods: `const notImplemented = () => { throw new Error("not implemented"); };` with type casts.

4. **Test #6 (`WorktreeRef` compatibility)**: Use compile-time type assertion only:
   ```typescript
   import type { WorktreeRef } from "../../run/index.js";
   // inside test body:
   const _ref: WorktreeRef = result;
   ```
   No runtime assertion. The `_ref` variable is intentionally unused (prefix `_`).

5. **Timestamp injection**: `createReviewWorktree` deps has `readonly now?: () => number`. Body uses `(deps.now ?? Date.now)()`. Tests inject `now: () => 1700000000000` or an incrementing counter for uniqueness tests.

6. **`head` normalization in `listOrphanWorktrees`**: Map `WorktreeInfo.head` to `OrphanWorktreeInfo.head` as `wt.head === "" ? null : wt.head`.

7. **Policy evaluation in `cleanupWorktree`**: Inline if/switch chain, NOT a separate function or file. Returns `{ shouldRemove: boolean, reason: string }` tuple used to drive the conditional `worktreeRemove` call.

### Validation (run after all 11 files are created)

```bash
# 1. Type-check + lint + architecture guards
npm run check

# 2. Run workspace unit tests
npx vitest run --project core src/core/workspace

# 3. Verify all 28 scenarios pass
# Expected: 28 tests across 3 test files, all green

# 4. Full test suite (regression)
npm test
```

All four commands must pass. Failures block the stage.

### Success criteria

- 11 new files under `src/core/workspace/` matching the structure above.
- `npm run check` passes (biome, tsc strict, dependency-cruiser architecture guards).
- `npm test` passes with all 28 workspace scenarios green.
- No imports from `src/adapters/`, `src/main/`, or I/O libraries in `src/core/workspace/`.
- `helpers.ts` is NOT re-exported from `index.ts`.
- All type-only re-exports use `export type`.

---

## Dependency graph

```
helpers.ts ─────────────────────────┐
cleanup-policy.ts ──────────────────┤
workspace-errors.ts ────────────────┤
                                    ▼
              ┌── create-review-worktree.ts ──┐
              ├── cleanup-worktree.ts ────────┤
              ├── list-orphan-worktrees.ts ───┤
              │                               ▼
              │                          index.ts
              │
              ▼
    __test__/workspace-git-fake.ts
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
  create-   cleanup-   list-orphan-
  review-   worktree   worktrees
  worktree  .test.ts   .test.ts
  .test.ts
```

Foundation files (1-3) have no interdependencies and can be written in any order. Use cases (4-6) depend on foundation files and `repos/index.js`. Barrel (7) depends on all use cases. Test fake (8) depends on `repos/index.js` types. Test files (9-11) depend on barrel + fake.

---

## Open risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `WorktreeRef` type in `run/index.ts` adds required fields before workspace tests are merged | Very low | Test #6 catches this at compile time. If it happens, extend `ReviewWorktreeResult` to match. |
| Dependency-cruiser may flag `../repos/index.js` imports if workspace module rules are not yet configured | Low | Existing rules allow cross-module imports via index. Verify with `npm run check`. |
| Fake's `worktreeList` always prepending main worktree diverges from future adapter behavior | Low | Documented in fake's JSDoc. Tests are self-consistent. |

---

## Estimated scope
- 11 new files, ~500-600 lines total (production ~200, tests ~350, fake ~50).
- Single execution stage.
- No B/C decisions anticipated — all implementation choices are A-level (aligned with spec and design).
