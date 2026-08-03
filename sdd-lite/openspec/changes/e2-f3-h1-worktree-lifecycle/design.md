# Design: E2.F3.H1 — Per-review worktree lifecycle

## Change ID
`e2-f3-h1-worktree-lifecycle`

---

## 1. Helper functions

Three pure helpers live in a private `helpers.ts` file (not re-exported from `index.ts`). They are individually testable but tested indirectly through the use case tests to avoid coupling tests to internal structure.

### 1.1 `repoBasename(repoPath: string): string`

Extracts the last non-empty segment from an absolute path.

```
repoBasename("/clones/owner/repo")   -> "repo"
repoBasename("/clones/owner/repo/")  -> "repo"
repoBasename("/repo")                -> "repo"
repoBasename("/")                    -> ""
```

**Implementation:**

```
function repoBasename(repoPath: string): string {
  const segments = repoPath.split("/");
  // Walk backward to skip trailing empty segments (from trailing slashes)
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] !== "") return segments[i];
  }
  return "";
}
```

No `node:path` import. String split on `/` only. The repoPath is always absolute with forward slashes (enforced by repos module validation upstream).

### 1.2 `sanitizeBranchLabel(label: string): string`

Replaces `/` with `-`, then trims leading/trailing dashes.

```
sanitizeBranchLabel("feature/foo")         -> "feature-foo"
sanitizeBranchLabel("feature/nested/name") -> "feature-nested-name"
sanitizeBranchLabel("fix/JIRA-123")        -> "fix-JIRA-123"
sanitizeBranchLabel("/leading/")           -> "leading"
sanitizeBranchLabel("main")               -> "main"
```

**Implementation:**

```
function sanitizeBranchLabel(label: string): string {
  return label.replaceAll("/", "-").replace(/^-+|-+$/g, "");
}
```

Pure string operations. `replaceAll` is available in Node >= 15 (target is >= 22).

### 1.3 `deriveWorktreePath(repoPath, branchLabel, worktreesDir, timestamp): string`

Composes the full worktree target path from its parts.

```
deriveWorktreePath(
  "/clones/owner/repo",
  "feature/foo",
  "/home/.sentinel/worktrees",
  1700000000000
)
-> "/home/.sentinel/worktrees/repo/feature-foo-1700000000000"
```

**Implementation:**

```
function deriveWorktreePath(
  repoPath: string,
  branchLabel: string,
  worktreesDir: string,
  timestamp: number,
): string {
  const base = repoBasename(repoPath);
  const sanitized = sanitizeBranchLabel(branchLabel);
  return `${worktreesDir}/${base}/${sanitized}-${String(timestamp)}`;
}
```

Pure composition. The timestamp is received as a parameter (not read from `Date.now()` internally) so callers can inject it for testing.

---

## 2. Timestamp injection strategy

The spec notes that tests need a controllable timestamp to assert path derivation deterministically.

**Decision (A-level):** Add an optional `now` function to `CreateReviewWorktreeDeps`.

```typescript
interface CreateReviewWorktreeDeps {
  readonly git: GitPort;
  readonly worktreesDir: string;
  /** Returns the current epoch-ms timestamp. Defaults to Date.now. */
  readonly now?: () => number;
}
```

In the use case body:

```
const timestamp = (deps.now ?? Date.now)();
```

This follows the established dependency injection pattern (deps carry all externals). Tests pass a stub returning a fixed value. Production callers omit the field and get `Date.now` automatically. The `exactOptionalPropertyTypes` rule is satisfied because `now` is declared as `() => number` (not `() => number | undefined`), and the field itself is optional.

---

## 3. Use case pseudocode

### 3.1 `createReviewWorktree`

```
async function createReviewWorktree(request, deps):
  // 1. Validate
  if request.repoPath is empty or non-absolute -> throw InvalidWorktreeRequestError
  if request.commitish is empty -> throw InvalidWorktreeRequestError
  if request.branchLabel is empty -> throw InvalidWorktreeRequestError
  if deps.worktreesDir is empty or non-absolute -> throw InvalidWorktreeRequestError

  // 2. Derive path
  timestamp = (deps.now ?? Date.now)()
  targetPath = deriveWorktreePath(request.repoPath, request.branchLabel, deps.worktreesDir, timestamp)

  // 3. Create worktree via port
  try:
    await deps.git.worktreeAdd({ repoPath: request.repoPath, targetPath, commitish: request.commitish })
  catch error:
    if error instanceof GitWorktreeError:
      throw new WorktreeCreationError("Failed to create worktree at <targetPath>", { cause: error })
    throw error  // non-git errors propagate unwrapped

  // 4. Return
  return { path: targetPath }
```

Import: `GitWorktreeError` (value) from `../repos/index.js` for `instanceof`. `GitPort` as type-only import.

"Non-absolute" check: `!repoPath.startsWith("/")`.

### 3.2 `cleanupWorktree`

```
async function cleanupWorktree(request, deps):
  // 1. Policy evaluation (pure, no I/O)
  shouldRemove, reason = evaluatePolicy(request.policy, request.reviewSucceeded)

  // 2. Act
  if not shouldRemove:
    return { removed: false, reason }

  try:
    await deps.git.worktreeRemove({ repoPath: request.repoPath, worktreePath: request.worktreePath })
  catch error:
    if error instanceof GitWorktreeError:
      throw new WorktreeCleanupError("Failed to remove worktree at <worktreePath>", { cause: error })
    throw error

  return { removed: true, reason }
```

The `evaluatePolicy` logic is inlined (not a separate function) since it is a single switch/if chain:

```
if policy === "keep":      -> { shouldRemove: false, reason: "policy-keep" }
if policy === "always":    -> { shouldRemove: true,  reason: "policy-always" }
if policy === "on-success":
  if reviewSucceeded:      -> { shouldRemove: true,  reason: "policy-on-success" }
  else:                    -> { shouldRemove: false, reason: "review-failed" }
```

No validation of `repoPath` or `worktreePath` (spec dec-005). No timestamp injection needed.

### 3.3 `listOrphanWorktrees`

```
async function listOrphanWorktrees(request, deps):
  // 1. List all worktrees
  allWorktrees = await deps.git.worktreeList(request.repoPath)
  // GitWorktreeError propagates unwrapped (spec dec-004)

  // 2. Filter to orphans
  orphans = allWorktrees
    .filter(wt => wt.path.startsWith(deps.worktreesDir))  // sentinel-managed
    .filter(wt => !deps.activeWorktreePaths.has(wt.path))  // not active
    .map(wt => ({
      path: wt.path,
      head: wt.head === "" ? null : wt.head,
      branch: wt.branch,
    }))

  return { orphans }
```

No error wrapping. No timestamp injection. Pure filter/map on the port result.

The `head` field: `WorktreeInfo.head` is typed `string`. If the adapter returns an empty string for a detached HEAD with no commit (edge case), we normalize to `null`. In practice `git worktree list --porcelain` always provides a SHA, so this is a defensive normalization.

---

## 4. In-memory `GitPort` fake for tests

The fake implements only the three worktree methods. All other `GitPort` methods throw `"not implemented"`, following the pattern in `register-repo.test.ts`.

```typescript
interface FakeWorktreeState {
  /** Tracks created worktrees by targetPath. */
  worktrees: Map<string, WorktreeInfo>;
  /** Calls recorded for assertion. */
  addCalls: WorktreeAddRequest[];
  removeCalls: WorktreeRemoveRequest[];
  listCalls: string[];
  /** Optional error injection per method. */
  addError?: Error;
  removeError?: Error;
  listError?: Error;
}

function createFakeGitPort(opts?: {
  /** Pre-populated worktrees returned by worktreeList. */
  initialWorktrees?: WorktreeInfo[];
  addError?: Error;
  removeError?: Error;
  listError?: Error;
}): GitPort & FakeWorktreeState {
  const state: FakeWorktreeState = {
    worktrees: new Map(),
    addCalls: [],
    removeCalls: [],
    listCalls: [],
    addError: opts?.addError,
    removeError: opts?.removeError,
    listError: opts?.listError,
  };

  // Seed initial worktrees
  if (opts?.initialWorktrees) {
    for (const wt of opts.initialWorktrees) {
      state.worktrees.set(wt.path, wt);
    }
  }

  const notImplemented = () => { throw new Error("not implemented"); };

  return {
    ...state,
    async worktreeAdd(req) {
      state.addCalls.push(req);
      if (state.addError) throw state.addError;
      state.worktrees.set(req.targetPath, {
        path: req.targetPath,
        head: "fake-sha",
        branch: null,
      });
    },
    async worktreeRemove(req) {
      state.removeCalls.push(req);
      if (state.removeError) throw state.removeError;
      state.worktrees.delete(req.worktreePath);
    },
    async worktreeList(repoPath) {
      state.listCalls.push(repoPath);
      if (state.listError) throw state.listError;
      // Always include main worktree (git behavior)
      const main: WorktreeInfo = { path: repoPath, head: "main-sha", branch: "refs/heads/main" };
      return [main, ...state.worktrees.values()];
    },
    clone: notImplemented as GitPort["clone"],
    fetch: notImplemented as GitPort["fetch"],
    branches: notImplemented as GitPort["branches"],
    defaultBranch: notImplemented as GitPort["defaultBranch"],
    mergeBase: notImplemented as GitPort["mergeBase"],
    diff: notImplemented as GitPort["diff"],
  };
}
```

Key design points:
- `worktreeAdd` records the call AND stores the worktree in the map so `worktreeList` can see it (useful for integration-style tests within the unit suite).
- `worktreeList` always prepends the main worktree (mirrors real git behavior), ensuring the orphan filter works correctly.
- Error injection per-method via constructor options.
- The fake is defined locally in each test file (not shared across modules) to avoid adapter-like coupling between test helpers. However, the three test files in this module share a single `createFakeGitPort` factory defined in a `__test__/helpers.ts` file, since they all need the same worktree-method subset.

---

## 5. File-by-file implementation plan

### 5.1 `src/core/workspace/helpers.ts` (new)

Private helpers. Not exported from `index.ts`.

- `repoBasename(repoPath: string): string`
- `sanitizeBranchLabel(label: string): string`
- `deriveWorktreePath(repoPath: string, branchLabel: string, worktreesDir: string, timestamp: number): string`

All three are pure functions, no imports beyond each other. Exported for internal use within the workspace module only (imported by use case files via `./helpers.js`).

### 5.2 `src/core/workspace/cleanup-policy.ts` (new)

Single type export:

```typescript
export type CleanupPolicy = "always" | "on-success" | "keep";
```

### 5.3 `src/core/workspace/workspace-errors.ts` (new)

Error classes as specified in spec section 2. Four exports: `WorkspaceErrorOptions`, `WorkspaceError`, `WorktreeCreationError`, `WorktreeCleanupError`, `InvalidWorktreeRequestError`.

Pattern: follows `register-repo-errors.ts` exactly (base with optional cause, subclasses override `this.name`).

### 5.4 `src/core/workspace/create-review-worktree.ts` (new)

- Type exports: `CreateReviewWorktreeRequest`, `CreateReviewWorktreeDeps` (with optional `now`), `ReviewWorktreeResult`
- Value export: `createReviewWorktree` async function
- Imports: `type GitPort` and `GitWorktreeError` from `../repos/index.js`; helpers from `./helpers.js`; errors from `./workspace-errors.js`

### 5.5 `src/core/workspace/cleanup-worktree.ts` (new)

- Type exports: `CleanupWorktreeRequest`, `CleanupWorktreeDeps`, `CleanupWorktreeResult`
- Value export: `cleanupWorktree` async function
- Imports: `type GitPort` and `GitWorktreeError` from `../repos/index.js`; `type CleanupPolicy` from `./cleanup-policy.js`; errors from `./workspace-errors.js`

### 5.6 `src/core/workspace/list-orphan-worktrees.ts` (new)

- Type exports: `OrphanWorktreeInfo`, `ListOrphanWorktreesRequest`, `ListOrphanWorktreesDeps`, `ListOrphanWorktreesResult`
- Value export: `listOrphanWorktrees` async function
- Imports: `type GitPort` from `../repos/index.js` (no error import -- errors propagate unwrapped)

### 5.7 `src/core/workspace/index.ts` (rewrite)

Replace the current stub (`export {}`) with the full barrel as specified in spec section 4. Uses `export type` for type-only re-exports per `verbatimModuleSyntax`.

### 5.8 `src/core/workspace/__test__/helpers.ts` (new)

Shared `createFakeGitPort` factory (design in section 4 above). Imported by all three test files.

### 5.9 `src/core/workspace/__test__/create-review-worktree.test.ts` (new)

13 test cases (spec scenarios 1-13). Structure:

```
describe("createReviewWorktree")
  describe("AC1: parallel reviews do not collide")
    #1 unique paths for same branch (two calls with incrementing now())
    #2 unique paths for different branches
    #3 branch label sanitization
    #4 branch label with special chars
  describe("happy path")
    #5 standard creation (assert path structure + git.worktreeAdd call args)
    #6 result is WorktreeRef-compatible (type assertion: const _: WorktreeRef = result)
  describe("validation errors")
    #7 empty repoPath
    #8 non-absolute repoPath
    #9 empty commitish
    #10 empty branchLabel
    #11 non-absolute worktreesDir
  describe("error handling")
    #12 git worktreeAdd fails -> WorktreeCreationError with cause
    #13 non-git error propagates unwrapped
```

Timestamp injection: tests pass `now: () => 1700000000000` (or a counter function for uniqueness tests) in deps.

WorktreeRef compatibility (test #6): Compile-time type assertion, no runtime check:
```typescript
import type { WorktreeRef } from "../../run/index.js";
// Inside test:
const _ref: WorktreeRef = result; // compile error if incompatible
```

### 5.10 `src/core/workspace/__test__/cleanup-worktree.test.ts` (new)

8 test cases (spec scenarios 14-21). Structure:

```
describe("cleanupWorktree")
  describe("AC2: configurable policy respected")
    #14 always + success
    #15 always + failure
    #16 on-success + success
    #17 on-success + failure
    #18 keep + success
    #19 keep + failure
  describe("error handling")
    #20 remove fails -> WorktreeCleanupError with cause
    #21 non-git error propagates unwrapped
```

### 5.11 `src/core/workspace/__test__/list-orphan-worktrees.test.ts` (new)

7 test cases (spec scenarios 22-28). Structure:

```
describe("listOrphanWorktrees")
  describe("AC3: orphans detected and reported")
    #22 no orphans (no sentinel worktrees)
    #23 no orphans (all active)
    #24 one orphan detected
    #25 multiple orphans
    #26 external worktrees excluded
    #27 branch-less worktree
  describe("error handling")
    #28 git error propagates unwrapped
```

The fake is seeded with `initialWorktrees` per scenario. `activeWorktreePaths` is a `new Set<string>()` with the appropriate paths.

---

## 6. Implementation order

1. `helpers.ts` -- no dependencies, pure functions
2. `cleanup-policy.ts` -- single type
3. `workspace-errors.ts` -- no cross-module dependencies
4. `create-review-worktree.ts` -- depends on 1, 3, and `repos/index.js`
5. `cleanup-worktree.ts` -- depends on 2, 3, and `repos/index.js`
6. `list-orphan-worktrees.ts` -- depends on `repos/index.js` only
7. `index.ts` -- barrel, depends on 2-6
8. `__test__/helpers.ts` -- fake factory
9. `__test__/create-review-worktree.test.ts`
10. `__test__/cleanup-worktree.test.ts`
11. `__test__/list-orphan-worktrees.test.ts`

Steps 1-3 can be done in parallel. Steps 4-6 can be done in parallel. Steps 9-11 can be done in parallel.

---

## 7. Integration points

| Consuming module | What it uses | When |
|---|---|---|
| `run` (E4.F1.H1) | `createReviewWorktree`, `cleanupWorktree` | Run orchestrator creates a worktree before engine invocation, cleans up after terminal state |
| `run` (E4.F1.H1) | `ReviewWorktreeResult` assignable to `WorktreeRef` | Structural compatibility, no explicit import |
| CLI startup (future) | `listOrphanWorktrees` | On startup or via a `sentinel cleanup` command |
| `main/` composition root | Provides `GitPort` instance and `worktreesDir` string | Dependency wiring at boot |

The workspace module is purely consumed. It does not import from `run`, `review`, `history`, or `shared`. Its only cross-module dependency is `repos` (for `GitPort` type and `GitWorktreeError` value).

---

## 8. Architecture guard compliance

| Guard | Status |
|---|---|
| `core-no-io-libs` | Pass. No `node:fs`, `node:path`, `node:child_process`. String ops only. |
| `core-no-adapter-import` | Pass. No imports from `src/adapters/` or `src/main/`. |
| `cross-module-via-index` | Pass. `repos` accessed only via `../repos/index.js`. `run` accessed only via `../../run/index.js` (type-only, in tests). |
| `adapters-no-cross-import` | N/A. No adapter code in this change. |
| `adapter-instantiation-in-main` | N/A. No adapter instantiation. |
| `verbatimModuleSyntax` | Pass. All type-only imports use `import type`. `.js` extensions on all specifiers. |

---

## 9. Design decisions

| ID | Decision | Level | Rationale |
|---|---|---|---|
| des-001 | Helpers in a private `helpers.ts` file (not inlined in use cases) | A | Three helpers are used by one use case each today, but `repoBasename` and `sanitizeBranchLabel` are likely reusable within workspace. Separate file keeps use case files focused on flow. |
| des-002 | Timestamp injection via optional `now` in deps | A | Follows the existing deps-injection pattern. `Date.now` as default avoids boilerplate for production callers. Reversible -- could be made mandatory if needed. |
| des-003 | Shared test fake in `__test__/helpers.ts` | A | Three test files need the same worktree-method subset of `GitPort`. Sharing avoids duplication within the module without creating cross-module test coupling. |
| des-004 | `head` normalization: empty string to `null` | A | Defensive; `WorktreeInfo.head` is `string` but `OrphanWorktreeInfo.head` is `string | null`. The mapping handles the edge case cleanly. In practice git always provides a SHA. |
| des-005 | Policy evaluation inlined (no separate function/file) | A | The logic is a 6-row truth table with no reuse outside `cleanupWorktree`. Extracting it would add a file with no benefit. |

---

## 10. Open risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `repoBasename` returns empty string for root path `/` | Very low | Low -- would produce a path like `worktrees//branch-ts` | The upstream repos module validates that repo paths are meaningful absolute paths. Add a guard comment. |
| Fake `worktreeList` always prepends main worktree -- mismatch if real adapter changes | Low | Low -- test-only | Document the assumption in the fake's JSDoc. |
| `WorktreeRef` structural compatibility breaks if `run` adds required fields | Low | Medium -- compile error in test #6, clear fix | The type assertion test (#6) catches this at compile time. Documented coupling in spec. |
