# Spec: E2.F3.H1 — Per-review worktree lifecycle

## Change ID
`e2-f3-h1-worktree-lifecycle`

## Overview

The `workspace` core module provides three use cases that manage the full lifecycle of ephemeral git worktrees used during reviews. The module owns the isolation guarantee (PRD §5.1): every review runs in its own worktree, never in the managed clone's working tree, enabling safe parallel execution.

The workspace module declares no new ports. It depends on `GitPort` from `repos` (PRD §4.3) via dependency injection, consistent with the existing `registerRepo` and `listBranches` patterns.

---

## 1. Domain types

### 1.1 CleanupPolicy

Owned by workspace. Governs when a review worktree is removed after use.

```typescript
// src/core/workspace/cleanup-policy.ts
type CleanupPolicy = "always" | "on-success" | "keep";
```

- `"always"` — remove the worktree regardless of review outcome.
- `"on-success"` — remove only when the review ended successfully; retain on failure for inspection.
- `"keep"` — never remove; the user or a future process handles it.

### 1.2 OrphanWorktreeInfo

Report entry for a worktree that exists under the sentinel worktrees base path but is not associated with any active review.

```typescript
// src/core/workspace/list-orphan-worktrees.ts (co-located with the use case)
interface OrphanWorktreeInfo {
  /** Absolute path to the orphan worktree on disk. */
  readonly path: string;
  /** HEAD commit SHA at the time of detection, if available. */
  readonly head: string | null;
  /** Branch the worktree was on, if any. */
  readonly branch: string | null;
}
```

### 1.3 ReviewWorktreeResult

Return value of `createReviewWorktree`. Compatible with `WorktreeRef` from `run` (shares the `{ path: string }` shape), but owned by workspace — the run module imports `WorktreeRef` by its own type, and the structural match is verified by tests and the type system.

```typescript
// src/core/workspace/create-review-worktree.ts (co-located with the use case)
interface ReviewWorktreeResult {
  /** Absolute path of the created worktree. */
  readonly path: string;
}
```

Note: `ReviewWorktreeResult` is intentionally a workspace-owned type, not a re-export of `WorktreeRef`. The structural compatibility (`{ path: string }` assignable to `WorktreeRef`) is guaranteed by TypeScript's structural typing. If `WorktreeRef` gains fields in the future, the workspace module updates its result to match — an explicit coupling point documented here.

---

## 2. Error taxonomy

All workspace errors follow the project error pattern: a base class with optional `cause`, specific subclasses per failure family.

```typescript
// src/core/workspace/workspace-errors.ts

interface WorkspaceErrorOptions {
  readonly cause?: unknown;
}

/** Base class for all workspace-domain failures. */
class WorkspaceError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message);
    this.name = "WorkspaceError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

/**
 * Raised by `createReviewWorktree` when the underlying `GitPort.worktreeAdd`
 * fails. The `cause` carries the original `GitWorktreeError` for observability.
 */
class WorktreeCreationError extends WorkspaceError {
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message, options);
    this.name = "WorktreeCreationError";
  }
}

/**
 * Raised by `cleanupWorktree` when the underlying `GitPort.worktreeRemove`
 * fails. The `cause` carries the original `GitWorktreeError`.
 */
class WorktreeCleanupError extends WorkspaceError {
  constructor(message: string, options?: WorkspaceErrorOptions) {
    super(message, options);
    this.name = "WorktreeCleanupError";
  }
}

/**
 * Raised by `createReviewWorktree` when the request contains invalid values
 * (empty repo path, empty commitish, non-absolute basePath). Pre-validation
 * error — no I/O is attempted.
 */
class InvalidWorktreeRequestError extends WorkspaceError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorktreeRequestError";
  }
}
```

### Error translation table

| Port error | Workspace error | Use case |
|---|---|---|
| `GitWorktreeError` from `worktreeAdd` | `WorktreeCreationError` | `createReviewWorktree` |
| `GitWorktreeError` from `worktreeRemove` | `WorktreeCleanupError` | `cleanupWorktree` |
| `GitWorktreeError` from `worktreeList` | `WorktreeCreationError` (in orphan detection context, propagated as-is since the use case returns a result, not an error — see §3.3) | `listOrphanWorktrees` |
| (invalid input) | `InvalidWorktreeRequestError` | `createReviewWorktree` |

Non-`GitError` exceptions (unexpected runtime errors) are never caught — they propagate to the caller as-is, consistent with the `registerRepo` and `listBranches` patterns.

---

## 3. Use case contracts

### 3.1 `createReviewWorktree`

Creates an ephemeral, detached worktree for a single review.

```typescript
// src/core/workspace/create-review-worktree.ts

interface CreateReviewWorktreeRequest {
  /** Absolute path to the repo's managed clone. */
  readonly repoPath: string;
  /** Branch or commit to check out in the worktree (e.g. "origin/feature-x"). */
  readonly commitish: string;
  /** Short label for the worktree directory name (typically the branch name). */
  readonly branchLabel: string;
}

interface CreateReviewWorktreeDeps {
  readonly git: GitPort;
  /** Absolute base path under which worktrees are created (e.g. `~/.sentinel/worktrees`). */
  readonly worktreesDir: string;
}

function createReviewWorktree(
  request: CreateReviewWorktreeRequest,
  deps: CreateReviewWorktreeDeps,
): Promise<ReviewWorktreeResult>;
```

**Behavior contract:**

1. **Validation** — reject with `InvalidWorktreeRequestError` if:
   - `request.repoPath` is empty or non-absolute.
   - `request.commitish` is empty.
   - `request.branchLabel` is empty.
   - `deps.worktreesDir` is empty or non-absolute.

2. **Path derivation** — compute the target path as:
   ```
   <worktreesDir>/<repoBasename>/<sanitizedBranchLabel>-<timestamp>
   ```
   Where:
   - `repoBasename` = last segment of `repoPath` (e.g. `/clones/owner/repo` -> `repo`).
   - `sanitizedBranchLabel` = `branchLabel` with slashes replaced by dashes, trimmed of leading/trailing dashes (e.g. `feature/foo` -> `feature-foo`).
   - `timestamp` = `Date.now()` (millisecond epoch). This provides collision avoidance for parallel reviews on the same branch. A-level decision: millisecond precision is sufficient given single-process Node; the design is future-compatible with an additional random suffix if needed.

3. **Worktree creation** — call `deps.git.worktreeAdd({ repoPath, targetPath, commitish })`.
   - On success: return `{ path: targetPath }`.
   - On `GitWorktreeError`: wrap in `WorktreeCreationError` with the original as `cause`.

4. **Idempotency** — not idempotent. Each call creates a new worktree with a unique timestamp. Two calls with identical inputs produce two distinct worktrees.

5. **Structural compatibility** — the returned `ReviewWorktreeResult` is structurally assignable to `WorktreeRef` from the `run` module. The run orchestrator (`runReview`, E4.F1.H1) can pass the result directly as a `WorktreeRef` without conversion.

### 3.2 `cleanupWorktree`

Removes a worktree according to a configurable cleanup policy.

```typescript
// src/core/workspace/cleanup-worktree.ts

interface CleanupWorktreeRequest {
  /** Absolute path to the repo's managed clone. */
  readonly repoPath: string;
  /** Absolute path to the worktree to clean up. */
  readonly worktreePath: string;
  /** Cleanup policy governing removal behavior. */
  readonly policy: CleanupPolicy;
  /** Whether the review that used this worktree succeeded. */
  readonly reviewSucceeded: boolean;
}

interface CleanupWorktreeDeps {
  readonly git: GitPort;
}

interface CleanupWorktreeResult {
  /** Whether the worktree was actually removed. */
  readonly removed: boolean;
  /** Why the worktree was or was not removed. */
  readonly reason: "policy-always" | "policy-on-success" | "policy-keep" | "review-failed";
}

function cleanupWorktree(
  request: CleanupWorktreeRequest,
  deps: CleanupWorktreeDeps,
): Promise<CleanupWorktreeResult>;
```

**Behavior contract:**

1. **Policy evaluation** (pure logic, no I/O):

   | `policy` | `reviewSucceeded` | Action | `reason` |
   |---|---|---|---|
   | `"always"` | `true` | remove | `"policy-always"` |
   | `"always"` | `false` | remove | `"policy-always"` |
   | `"on-success"` | `true` | remove | `"policy-on-success"` |
   | `"on-success"` | `false` | skip | `"review-failed"` |
   | `"keep"` | `true` | skip | `"policy-keep"` |
   | `"keep"` | `false` | skip | `"policy-keep"` |

2. **Removal** — when the decision is "remove", call `deps.git.worktreeRemove({ repoPath, worktreePath })`.
   - On success: return `{ removed: true, reason }`.
   - On `GitWorktreeError`: wrap in `WorktreeCleanupError` with the original as `cause`.

3. **Skip** — when the decision is "skip", return `{ removed: false, reason }` without calling `GitPort`. No error is thrown.

4. **No validation of paths** — the use case trusts its caller (the run orchestrator) to supply valid paths. A worktree that does not exist is a git-level error (surfaces as `WorktreeCleanupError`), not a pre-validation concern.

### 3.3 `listOrphanWorktrees`

Detects worktrees that exist in git's tracking for a given repo but whose paths fall under the sentinel worktrees base directory and are not associated with an active review. This is a report-only use case — it never deletes anything.

```typescript
// src/core/workspace/list-orphan-worktrees.ts

interface ListOrphanWorktreesRequest {
  /** Absolute path to the repo's managed clone. */
  readonly repoPath: string;
}

interface ListOrphanWorktreesDeps {
  readonly git: GitPort;
  /** Absolute base path under which sentinel creates worktrees. */
  readonly worktreesDir: string;
  /**
   * Paths of worktrees currently in active use (e.g., by a running review).
   * These are excluded from the orphan list even though they are under
   * worktreesDir. When no reviews are active, pass an empty array.
   */
  readonly activeWorktreePaths: ReadonlySet<string>;
}

interface ListOrphanWorktreesResult {
  readonly orphans: readonly OrphanWorktreeInfo[];
}

function listOrphanWorktrees(
  request: ListOrphanWorktreesRequest,
  deps: ListOrphanWorktreesDeps,
): Promise<ListOrphanWorktreesResult>;
```

**Behavior contract:**

1. **List all worktrees** — call `deps.git.worktreeList(request.repoPath)`.

2. **Filter** — a worktree is reported as an orphan when ALL of:
   - Its `path` starts with `deps.worktreesDir` (it is a sentinel-managed worktree, not the main worktree or a user worktree).
   - Its `path` is NOT in `deps.activeWorktreePaths`.

3. **Map** — for each orphan, produce an `OrphanWorktreeInfo`:
   - `path` = the worktree's absolute path.
   - `head` = the worktree's HEAD commit SHA from `WorktreeInfo.head`, or `null` if empty.
   - `branch` = the worktree's branch from `WorktreeInfo.branch`.

4. **Error handling** — if `GitPort.worktreeList` throws `GitWorktreeError`, let it propagate unwrapped. The caller (startup routine or CLI command) handles the git error directly. Rationale: orphan listing is a best-effort diagnostic, not a critical path; wrapping would add noise without value.

5. **Return** — `{ orphans: [...] }`. An empty array means no orphans detected.

6. **Main worktree exclusion** — `git worktree list` always includes the main worktree (the repo's own working directory). It is excluded automatically by the path-prefix filter (its path is the repoPath itself, not under `worktreesDir`).

---

## 4. Module structure

```
src/core/workspace/
├── index.ts                        # public API: re-exports use cases + types + errors
├── cleanup-policy.ts               # CleanupPolicy type
├── workspace-errors.ts             # WorkspaceError, WorktreeCreationError, WorktreeCleanupError, InvalidWorktreeRequestError
├── create-review-worktree.ts       # createReviewWorktree use case + ReviewWorktreeResult + request/deps types
├── cleanup-worktree.ts             # cleanupWorktree use case + request/deps/result types
├── list-orphan-worktrees.ts        # listOrphanWorktrees use case + OrphanWorktreeInfo + request/deps/result types
└── __test__/
    ├── create-review-worktree.test.ts
    ├── cleanup-worktree.test.ts
    └── list-orphan-worktrees.test.ts
```

### Public API (`index.ts`)

```typescript
// src/core/workspace/index.ts

// Use cases
export { createReviewWorktree } from "./create-review-worktree.js";
export type {
  CreateReviewWorktreeRequest,
  CreateReviewWorktreeDeps,
  ReviewWorktreeResult,
} from "./create-review-worktree.js";

export { cleanupWorktree } from "./cleanup-worktree.js";
export type {
  CleanupWorktreeRequest,
  CleanupWorktreeDeps,
  CleanupWorktreeResult,
} from "./cleanup-worktree.js";

export { listOrphanWorktrees } from "./list-orphan-worktrees.js";
export type {
  ListOrphanWorktreesRequest,
  ListOrphanWorktreesDeps,
  ListOrphanWorktreesResult,
  OrphanWorktreeInfo,
} from "./list-orphan-worktrees.js";

// Domain types
export type { CleanupPolicy } from "./cleanup-policy.js";

// Errors
export {
  WorkspaceError,
  WorktreeCreationError,
  WorktreeCleanupError,
  InvalidWorktreeRequestError,
} from "./workspace-errors.js";
export type { WorkspaceErrorOptions } from "./workspace-errors.js";
```

### Import rules

- Workspace imports from `repos` only via `src/core/repos/index.js`: `GitPort` (type), `GitWorktreeError` (value, for `instanceof`).
- Workspace imports from `run` only via `src/core/run/index.js`: nothing at runtime. `WorktreeRef` compatibility is structural (no import needed).
- No I/O library imports. No `node:fs`, `node:path`, `node:child_process`. Path manipulation uses only string operations.
- `zod` is not needed in this module (no schema validation of external data).

---

## 5. Test scenarios

All tests are core unit tests using in-memory `GitPort` fakes. No filesystem I/O.

### 5.1 `createReviewWorktree` tests

#### AC1: Parallel reviews do not collide

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 1 | Unique paths for same branch | Same `repoPath`, `commitish`, `branchLabel` | Two sequential calls | Both succeed; returned `path` values differ (different timestamps) |
| 2 | Unique paths for different branches | Same `repoPath`, different `branchLabel` | Two calls | Both succeed; returned `path` values differ (different directory segments) |
| 3 | Branch label sanitization | `branchLabel = "feature/nested/name"` | One call | Path contains `feature-nested-name-<ts>`, no slashes in the segment |
| 4 | Branch label with special chars | `branchLabel = "fix/JIRA-123"` | One call | Path contains `fix-JIRA-123-<ts>` |

#### Happy path

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 5 | Standard creation | Valid request | `createReviewWorktree` | Returns `{ path }` where path = `<worktreesDir>/<repoBasename>/<sanitizedLabel>-<ts>`, `GitPort.worktreeAdd` called once with correct `{ repoPath, targetPath, commitish }` |
| 6 | Result is WorktreeRef-compatible | Valid request | `createReviewWorktree` | Returned object is assignable to `WorktreeRef` (compile-time check via type assertion in test) |

#### Validation errors

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 7 | Empty repoPath | `repoPath = ""` | call | `InvalidWorktreeRequestError` |
| 8 | Non-absolute repoPath | `repoPath = "relative/path"` | call | `InvalidWorktreeRequestError` |
| 9 | Empty commitish | `commitish = ""` | call | `InvalidWorktreeRequestError` |
| 10 | Empty branchLabel | `branchLabel = ""` | call | `InvalidWorktreeRequestError` |
| 11 | Non-absolute worktreesDir | `worktreesDir = "relative"` | call | `InvalidWorktreeRequestError` |

#### Error handling

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 12 | Git worktree add fails | `GitPort.worktreeAdd` rejects with `GitWorktreeError` | call | `WorktreeCreationError` with `cause` = original `GitWorktreeError` |
| 13 | Non-git error propagates | `GitPort.worktreeAdd` rejects with `TypeError` | call | `TypeError` propagates unwrapped |

### 5.2 `cleanupWorktree` tests

#### AC2: Configurable policy respected

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 14 | always + success | `policy="always"`, `reviewSucceeded=true` | `cleanupWorktree` | `worktreeRemove` called; `{ removed: true, reason: "policy-always" }` |
| 15 | always + failure | `policy="always"`, `reviewSucceeded=false` | `cleanupWorktree` | `worktreeRemove` called; `{ removed: true, reason: "policy-always" }` |
| 16 | on-success + success | `policy="on-success"`, `reviewSucceeded=true` | `cleanupWorktree` | `worktreeRemove` called; `{ removed: true, reason: "policy-on-success" }` |
| 17 | on-success + failure | `policy="on-success"`, `reviewSucceeded=false` | `cleanupWorktree` | `worktreeRemove` NOT called; `{ removed: false, reason: "review-failed" }` |
| 18 | keep + success | `policy="keep"`, `reviewSucceeded=true` | `cleanupWorktree` | `worktreeRemove` NOT called; `{ removed: false, reason: "policy-keep" }` |
| 19 | keep + failure | `policy="keep"`, `reviewSucceeded=false` | `cleanupWorktree` | `worktreeRemove` NOT called; `{ removed: false, reason: "policy-keep" }` |

#### Error handling

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 20 | Remove fails | `policy="always"`, `worktreeRemove` rejects with `GitWorktreeError` | call | `WorktreeCleanupError` with `cause` |
| 21 | Non-git error propagates | `policy="always"`, `worktreeRemove` rejects with `TypeError` | call | `TypeError` propagates unwrapped |

### 5.3 `listOrphanWorktrees` tests

#### AC3: Orphans detected and reported

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 22 | No orphans (no sentinel worktrees) | `worktreeList` returns only main worktree | call | `{ orphans: [] }` |
| 23 | No orphans (all active) | `worktreeList` returns main + 2 under `worktreesDir`; both in `activeWorktreePaths` | call | `{ orphans: [] }` |
| 24 | One orphan detected | `worktreeList` returns main + 2 under `worktreesDir`; 1 in `activeWorktreePaths`, 1 not | call | `{ orphans: [{ path, head, branch }] }` with correct values |
| 25 | Multiple orphans | `worktreeList` returns main + 3 under `worktreesDir`; none active | call | `{ orphans }` has 3 entries |
| 26 | External worktrees excluded | `worktreeList` returns main + 1 under `worktreesDir` + 1 under `/other/path`; none active | call | Only the one under `worktreesDir` is reported |
| 27 | Branch-less worktree | A worktree with `branch: null` | call | `OrphanWorktreeInfo.branch` is `null` |

#### Error handling

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 28 | Git error propagates | `worktreeList` rejects with `GitWorktreeError` | call | `GitWorktreeError` propagates unwrapped |

---

## 6. Scope boundary

### In scope

- The three use cases (`createReviewWorktree`, `cleanupWorktree`, `listOrphanWorktrees`) and their types.
- Domain error classes (`WorkspaceError`, `WorktreeCreationError`, `WorktreeCleanupError`, `InvalidWorktreeRequestError`).
- `CleanupPolicy` domain type.
- The workspace module's `index.ts` public barrel.
- Unit tests with in-memory `GitPort` fakes covering all 28 scenarios above.

### Out of scope

- **Diff calculation** — that is E2.F3.H2.
- **Run orchestration** — E4.F1.H1 consumes this module; workspace does not call into `run`.
- **Config-driven default policy** — the use case receives `CleanupPolicy` as a parameter; where the default comes from is the caller's concern.
- **Automatic orphan removal** — detection and reporting only. Deletion is a separate concern for a future story or the run orchestrator.
- **Filesystem operations** — workspace uses only `GitPort` methods. No direct `node:fs` calls. Path construction uses string operations only.
- **New ports** — workspace reuses `GitPort` from repos. No new port interfaces.
- **Changes to `WorktreeRef`** — workspace returns a structurally compatible value; the run module's type is unchanged.

---

## 7. Design decisions

| ID | Decision | Level | Rationale |
|---|---|---|---|
| dec-001 | Millisecond timestamp (`Date.now()`) for path uniqueness, no random suffix | A | Single-process Node with async-sequential worktree creation makes sub-ms collision vanishingly unlikely. Adding a random suffix is future-compatible if needed. |
| dec-002 | `ReviewWorktreeResult` is a workspace-owned type, not a re-export of `WorktreeRef` | A | Module independence: workspace does not import from run. Structural compatibility is guaranteed by TypeScript. |
| dec-003 | `activeWorktreePaths` is a `ReadonlySet<string>` injected into deps, not a port query | A | Workspace has no concept of "active review" — that is run-domain. The caller provides the set. Set lookup gives O(1) membership checks. |
| dec-004 | `listOrphanWorktrees` does not wrap `GitWorktreeError` | A | Orphan listing is diagnostic/best-effort. Adding a workspace-specific wrapper would add noise without enabling any additional recovery. The caller already handles `GitWorktreeError`. |
| dec-005 | `cleanupWorktree` does not validate paths | A | The use case trusts its caller (run orchestrator) to supply valid absolute paths. Invalid paths surface as `GitWorktreeError` from the port. Pre-validation would duplicate git's own checks. |
| dec-006 | Branch label sanitization replaces `/` with `-` | A | Filesystem safety — worktree paths must not create nested directories from branch names like `feature/foo`. Simple string replacement; no other special chars need handling since git branch names are already constrained. |
| dec-007 | `repoBasename` derived via string split, not `node:path` | A | Core must not import I/O libraries. The repo path is always absolute with `/` separators (enforced by prior validation in repos module). |

---

## 8. Open risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Timestamp collision under rapid sequential calls in tests | Low | Low — test-only concern | Tests that assert uniqueness should inject a controllable clock or add small delays. In production, the async nature of `worktreeAdd` provides natural spacing. |
| `repoBasename` derivation edge case (trailing slash, single segment) | Low | Medium — wrong directory name | Handle trailing slash trimming in path derivation; test with edge-case paths. |
| `activeWorktreePaths` out of sync with actual state | Medium | Low — false orphan report, but orphans are never auto-deleted | Documented as a known limitation. The caller must maintain an accurate set. |
