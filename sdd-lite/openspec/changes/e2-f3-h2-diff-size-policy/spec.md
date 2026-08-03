# Spec: E2.F3.H2 — Diff with size policy

## Change ID
`e2-f3-h2-diff-size-policy`

## Overview

The `workspace` core module gains a fourth use case, `computeReviewDiff`, that produces a prompt-ready diff between a base and target ref with configurable size limits. When the diff exceeds limits, the use case truncates per-file content while preserving the full file index (every affected file retains its path and stats). A structured warning is returned when truncation occurs. The use case never fails due to diff size (PRD section 5.1, hard invariant).

The use case depends on `GitPort` (from `repos`) for `mergeBase` and `diff` operations. It introduces three new domain types (`ReviewDiff`, `DiffFileEntry`, `DiffWarning`) and one new error class (`DiffSizePolicyError`). No new ports are declared.

---

## 1. Domain types

### 1.1 DiffFileEntry

Per-file entry in the review diff result. Every file in the diff appears as an entry regardless of truncation status.

```typescript
// src/core/workspace/diff-types.ts

interface DiffFileEntry {
  /** Relative path of the file within the repository. */
  readonly path: string;
  /** Number of added lines (from git numstat). */
  readonly additions: number;
  /** Number of deleted lines (from git numstat). */
  readonly deletions: number;
  /**
   * Full unified-diff chunk for this file (including headers, hunks, context).
   * `null` when the file's diff content was removed by truncation.
   */
  readonly content: string | null;
  /** Whether this file's diff content was removed by the size policy. */
  readonly truncated: boolean;
  /**
   * Number of lines in this file's original diff chunk (before any
   * truncation). Always present even when truncated, so consumers can
   * report "truncated (was N lines)".
   */
  readonly diffLineCount: number;
}
```

### 1.2 DiffWarning

Structured warning returned as data in the result. The caller decides how to surface it (TUI display, run metadata, etc.). A discriminated union on `kind` so additional warning types can be added in future stories without breaking existing consumers.

```typescript
// src/core/workspace/diff-types.ts

interface DiffTruncatedWarning {
  readonly kind: "diff-truncated";
  readonly message: string;
  readonly originalLines: number;
  readonly originalTokens: number;
  readonly keptLines: number;
  readonly keptTokens: number;
  readonly truncatedFileCount: number;
  readonly totalFileCount: number;
}

type DiffWarning = DiffTruncatedWarning;
```

- `originalLines` / `originalTokens` — totals before truncation.
- `keptLines` / `keptTokens` — totals after truncation (the content that remains).
- `truncatedFileCount` — number of files whose content was removed.
- `totalFileCount` — total number of files in the diff.
- `message` — human-readable summary, e.g. `"Diff truncated: 8500 lines (est. 42500 tokens) exceeded limits (3000 lines / 50000 tokens). 4 of 12 files truncated."`.

### 1.3 ReviewDiff

The prompt-ready diff result. Contains the file index, aggregate metrics, truncation status, and any warnings.

```typescript
// src/core/workspace/diff-types.ts

interface ReviewDiff {
  /** Per-file entries, in the order they appear in the diff. */
  readonly files: readonly DiffFileEntry[];
  /**
   * Total line count of all non-truncated diff content (sum of
   * diffLineCount for files where content is present).
   */
  readonly totalLines: number;
  /** Estimated token count of all non-truncated diff content. */
  readonly estimatedTokens: number;
  /** Whether any file was truncated by the size policy. */
  readonly truncated: boolean;
  /** Warnings generated during diff computation (empty if none). */
  readonly warnings: readonly DiffWarning[];
}
```

### 1.4 Limits shape (inline in request)

The size limits are defined inline in the request type rather than imported from repos. Structural typing guarantees that a `z.infer<typeof DiffLimitsSchema>` value from repos config is directly assignable. This keeps workspace independent of the repos schema module.

```typescript
// Inline in ComputeReviewDiffRequest (see section 2)
readonly limits?: {
  readonly maxLines: number;
  readonly maxTokens: number;
};
```

When `limits` is `undefined`, defaults apply:
- `maxLines`: 3000
- `maxTokens`: 50000

These defaults are exported as named constants from `compute-review-diff.ts` for testability:

```typescript
// src/core/workspace/compute-review-diff.ts
const DEFAULT_MAX_LINES = 3000;
const DEFAULT_MAX_TOKENS = 50000;
```

---

## 2. Use case contract: `computeReviewDiff`

```typescript
// src/core/workspace/compute-review-diff.ts

interface ComputeReviewDiffRequest {
  /** Absolute path to the repo (managed clone or worktree source). */
  readonly repoPath: string;
  /** Base ref for the diff (typically the default branch, e.g. "origin/main"). */
  readonly baseRef: string;
  /** Target ref for the diff (the branch under review, e.g. "origin/feature-x"). */
  readonly targetRef: string;
  /**
   * Size limits for the diff. When undefined, defaults apply
   * (3000 lines / 50000 tokens).
   */
  readonly limits?: {
    readonly maxLines: number;
    readonly maxTokens: number;
  };
}

interface ComputeReviewDiffDeps {
  readonly git: GitPort;
}

function computeReviewDiff(
  request: ComputeReviewDiffRequest,
  deps: ComputeReviewDiffDeps,
): Promise<ReviewDiff>;
```

### Behavior contract

#### Step 1 — Input validation

Reject with `InvalidWorktreeRequestError` if:
- `request.repoPath` is empty or non-absolute.
- `request.baseRef` is empty.
- `request.targetRef` is empty.

Reject with `DiffSizePolicyError` if `request.limits` is provided and:
- `maxLines <= 0`
- `maxTokens <= 0`

Note: `InvalidWorktreeRequestError` is reused from the existing workspace error family for path/ref validation. It is already exported from workspace's public API. Despite the name containing "Worktree", it covers all workspace request validation (the error predates this use case). A rename or new error class would be churn without value. Decision level A.

#### Step 2 — Merge-base resolution

Call `deps.git.mergeBase({ repoPath: request.repoPath, commitA: request.baseRef, commitB: request.targetRef })`.

- On `GitMergeBaseError`: let it propagate unwrapped. The use case does not add a workspace-level wrapper because the error is already descriptive, and the caller (run orchestrator) needs to discriminate git-level errors for its terminal state logic. Consistent with `listOrphanWorktrees` letting `GitWorktreeError` propagate.
- Returns the merge-base commit SHA.

#### Step 3 — Diff computation

Call `deps.git.diff({ repoPath: request.repoPath, from: mergeBase, to: request.targetRef })`.

- On `GitDiffError`: let it propagate unwrapped (same rationale as step 2).
- Returns `DiffResult { raw: string, stats: readonly FileStats[] }`.

#### Step 4 — Empty diff short-circuit

If `diffResult.raw === ""` and `diffResult.stats.length === 0`:

```typescript
return {
  files: [],
  totalLines: 0,
  estimatedTokens: 0,
  truncated: false,
  warnings: [],
};
```

#### Step 5 — Diff parsing (split raw into per-file chunks)

See section 3 for the full parsing algorithm. Produces an array of `ParsedFileChunk`:

```typescript
// Internal type, not exported
interface ParsedFileChunk {
  readonly path: string;
  readonly content: string;
  readonly lineCount: number;
  readonly estimatedTokens: number;
}
```

#### Step 6 — Build initial file entries

For each `FileStats` entry in `diffResult.stats`:
1. Find the matching `ParsedFileChunk` by `path`.
2. If a matching chunk exists:
   - `content` = chunk's full text.
   - `diffLineCount` = chunk's line count.
3. If no matching chunk exists (binary file detected by numstat but absent from textual diff, or files with only mode/permission changes):
   - `content` = `null`.
   - `diffLineCount` = 0.
   - `truncated` = `false` (not truncated by policy; never had textual content).

Compute aggregate totals:
- `totalLines` = sum of `diffLineCount` for entries with `content !== null`.
- `estimatedTokens` = sum of per-chunk `estimatedTokens` for entries with `content !== null`.

#### Step 7 — Size policy evaluation

Resolve effective limits:
```typescript
const maxLines = request.limits?.maxLines ?? DEFAULT_MAX_LINES;
const maxTokens = request.limits?.maxTokens ?? DEFAULT_MAX_TOKENS;
```

If `totalLines <= maxLines` AND `estimatedTokens <= maxTokens`:
- Return `ReviewDiff` with all content, `truncated: false`, empty `warnings`.

If either limit is exceeded, proceed to truncation (step 8).

#### Step 8 — Truncation algorithm

See section 4 for the full algorithm. Produces a truncated file list, updated totals, and a `DiffWarning`.

#### Step 9 — Return result

Assemble and return the `ReviewDiff` with:
- `files` — per-file entries (truncated files have `content: null`, `truncated: true`).
- `totalLines` — sum of `diffLineCount` for files with `content !== null`.
- `estimatedTokens` — sum of token estimates for files with `content !== null`.
- `truncated` — `true`.
- `warnings` — array containing the `DiffTruncatedWarning`.

---

## 3. Diff parsing algorithm

The raw unified diff text must be split into per-file chunks to enable per-file truncation. This is pure string manipulation (no I/O, no external libraries).

### Input
`raw: string` — the full unified diff output from `git diff`.

### Delimiter
Files in a unified diff are separated by headers matching the pattern:

```
diff --git a/<path> b/<path>
```

The regex pattern for splitting: `/^diff --git /m` (multiline, matches at the start of a line).

### Algorithm

1. Split `raw` on the delimiter, preserving the delimiter at the start of each segment.
   - Implementation: find all match indices of `/^diff --git /m` in `raw`. Slice between consecutive indices.
   - The text before the first match (if any) is discarded (typically empty or contains only whitespace).

2. For each segment:
   - Extract the file path from the first line. The header format is `diff --git a/<pathA> b/<pathB>`. Extract `<pathB>` — the destination path, which is the canonical name for renames, new files, and modifications.
   - Path extraction: find the ` b/` separator in the first line. Everything after ` b/` up to the end of the first line is the path. For paths with spaces, git quotes them; the spec assumes paths do not contain literal ` b/` sequences (a degenerate case documented as a known limitation).
   - `content` = the full segment text (including the `diff --git` header line, index line, `---`/`+++` lines, and hunk lines).
   - `lineCount` = number of `\n` characters in `content` (equivalent to splitting on `\n` and counting non-trailing entries).
   - `estimatedTokens` = `Math.ceil(content.length / 4)`.

3. Return an array of `ParsedFileChunk` objects.

### Path matching with FileStats

`FileStats.path` from git `--numstat` and the parsed `b/<path>` from the diff header should match. For renames, `--numstat` uses `{old => new}` syntax; the adapter normalizes this to the new path in `FileStats.path`. If a parsed chunk has no matching `FileStats` entry (should not happen with well-formed git output), the chunk is included in the file entries with `additions: 0`, `deletions: 0` from the chunk data alone.

Files present in `stats` but absent from the parsed chunks (binary files, permission-only changes) are handled in step 6 above.

---

## 4. Truncation algorithm

Greedy truncation by file size: remove diff content from the largest files first until the aggregate totals are within limits.

### Input
- `entries: DiffFileEntry[]` — mutable working array of file entries (all with `content !== null` initially, except binary/permission-only files).
- `totalLines: number` — current aggregate line count.
- `estimatedTokens: number` — current aggregate token estimate.
- `maxLines: number` — effective line limit.
- `maxTokens: number` — effective token limit.

### Algorithm

```
originalLines = totalLines
originalTokens = estimatedTokens
truncatedCount = 0

while (totalLines > maxLines OR estimatedTokens > maxTokens):
  candidate = non-truncated entry with the largest diffLineCount
  if no candidate found:
    break                          // all files truncated; limits still exceeded is acceptable
  totalLines -= candidate.diffLineCount
  estimatedTokens -= candidate.estimatedTokens
  mark candidate: content = null, truncated = true
  truncatedCount += 1
```

### Tie-breaking
When multiple files share the same `diffLineCount`, truncate the one that appears last in the file list (highest index). This maximizes the probability that the reviewer sees the first files in the diff, which are typically the most important (e.g., core source files before test files in alphabetical git output). Decision level A.

### Post-truncation
Build a `DiffTruncatedWarning`:

```typescript
{
  kind: "diff-truncated",
  message: `Diff truncated: ${originalLines} lines (est. ${originalTokens} tokens) exceeded limits (${maxLines} lines / ${maxTokens} tokens). ${truncatedCount} of ${totalFileCount} files truncated.`,
  originalLines,
  originalTokens,
  keptLines: totalLines,      // after truncation
  keptTokens: estimatedTokens, // after truncation
  truncatedFileCount: truncatedCount,
  totalFileCount: entries.length,
}
```

### Invariants
- Every file retains `path`, `additions`, `deletions`, and `diffLineCount` regardless of truncation (AC-3).
- Truncation never throws. If all files are truncated and totals are still above limits (theoretically impossible since truncating all files drives content to zero), the result is returned as-is with the warning.
- Files that never had textual content (`content: null`, `truncated: false` — binary files) are never candidates for truncation.

---

## 5. Token estimation

Heuristic: `Math.ceil(text.length / 4)`.

This is a well-known rough approximation for English-heavy text and code. It is intentionally approximate — the PRD's `maxTokens` limit is a tunable threshold, not a hard guarantee of model-specific token count. The heuristic is documented as approximate in the function's JSDoc.

No external tokenizer is imported (core I/O whitelist: `zod` only). The estimation function is a private helper, not exported.

---

## 6. Error taxonomy

### 6.1 New error: DiffSizePolicyError

Raised exclusively for invalid configuration (non-positive limits). Never raised for a diff that exceeds limits — that is handled by truncation, not errors.

```typescript
// src/core/workspace/diff-errors.ts

class DiffSizePolicyError extends WorkspaceError {
  constructor(message: string) {
    super(message);
    this.name = "DiffSizePolicyError";
  }
}
```

Inherits from `WorkspaceError` so callers catching the workspace error family still catch this. No `cause` parameter — invalid config is a pre-validation error, there is no underlying exception.

### 6.2 Error translation table

| Source error | Workspace action | Context |
|---|---|---|
| `GitMergeBaseError` from `git.mergeBase` | Propagate unwrapped | Merge-base resolution failed (bad refs) |
| `GitDiffError` from `git.diff` | Propagate unwrapped | Diff computation failed |
| Invalid `repoPath` / `baseRef` / `targetRef` | Throw `InvalidWorktreeRequestError` | Pre-validation |
| Non-positive `maxLines` or `maxTokens` | Throw `DiffSizePolicyError` | Pre-validation |
| Diff exceeds limits | **No error** — truncation + warning | Size policy (hard invariant: never fails) |

Non-`GitError` exceptions (unexpected runtime errors) propagate as-is, consistent with all existing workspace and repos use cases.

---

## 7. Module structure (updated)

```
src/core/workspace/
├── index.ts                        # public API (updated: add new exports)
├── cleanup-policy.ts
├── workspace-errors.ts
├── diff-types.ts                   # NEW — ReviewDiff, DiffFileEntry, DiffWarning
├── diff-errors.ts                  # NEW — DiffSizePolicyError
├── compute-review-diff.ts          # NEW — use case + request/deps types + defaults
├── create-review-worktree.ts
├── cleanup-worktree.ts
├── list-orphan-worktrees.ts
├── helpers.ts
└── __test__/
    ├── compute-review-diff.test.ts # NEW — unit tests
    ├── workspace-git-fake.ts       # MODIFIED — add mergeBase + diff support
    ├── create-review-worktree.test.ts
    ├── cleanup-worktree.test.ts
    └── list-orphan-worktrees.test.ts
```

### Public API additions (`index.ts`)

```typescript
// New exports appended to existing index.ts

export {
  type ComputeReviewDiffDeps,
  type ComputeReviewDiffRequest,
  computeReviewDiff,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_TOKENS,
} from "./compute-review-diff.js";
export type {
  DiffFileEntry,
  DiffTruncatedWarning,
  DiffWarning,
  ReviewDiff,
} from "./diff-types.js";
export { DiffSizePolicyError } from "./diff-errors.js";
```

### Import rules

- `compute-review-diff.ts` imports from `../repos/index.js`: `GitPort` (type), `GitMergeBaseError` (value, not caught — listed for documentation), `GitDiffError` (value, not caught).
  - In practice, since these git errors propagate unwrapped, the use case file needs only `import type { GitPort } from "../repos/index.js"`. No value imports from repos are needed.
- `diff-errors.ts` imports from `./workspace-errors.js`: `WorkspaceError` (value, for `extends`).
- `diff-types.ts` has no imports — pure type definitions.
- No I/O library imports. No `zod` needed in this module.

---

## 8. Fake GitPort extensions

The existing `workspace-git-fake.ts` must be extended to support `mergeBase` and `diff` (currently throw "not implemented").

### New config fields

```typescript
// Added to FakeGitPortConfig
interface FakeGitPortConfig {
  // ... existing fields ...
  readonly mergeBaseResult?: string;
  readonly mergeBaseError?: Error;
  readonly diffResult?: DiffResult;
  readonly diffError?: Error;
}
```

### New state tracking

```typescript
// Added to FakeWorktreeState (rename to FakeGitPortState would be appropriate
// but is a separate churn-only change)
interface FakeWorktreeState {
  // ... existing fields ...
  readonly mergeBaseCalls: MergeBaseRequest[];
  readonly diffCalls: DiffRequest[];
}
```

### Behavior

- `mergeBase(req)`: push to `mergeBaseCalls`; if `mergeBaseError` is set, throw it; otherwise return `mergeBaseResult ?? "abc123def456"` (a deterministic default SHA).
- `diff(req)`: push to `diffCalls`; if `diffError` is set, throw it; otherwise return `diffResult ?? { raw: "", stats: [] }` (empty diff as default).

---

## 9. Test scenarios

All tests are core unit tests using the extended in-memory `GitPort` fake. No filesystem I/O.

### 9.1 AC-1: Configurable limit

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 1 | Explicit limits respected — under limit | Diff with 100 lines, 400 tokens. Limits: `{ maxLines: 200, maxTokens: 1000 }` | `computeReviewDiff` | `truncated: false`, all files have `content !== null`, `warnings` empty |
| 2 | Explicit limits respected — over line limit | Diff with 500 lines. Limits: `{ maxLines: 100, maxTokens: 999999 }` | `computeReviewDiff` | `truncated: true`, truncation warning present, `totalLines <= 100` |
| 3 | Explicit limits respected — over token limit | Diff with high char count, low line count. Limits: `{ maxLines: 999999, maxTokens: 50 }` | `computeReviewDiff` | `truncated: true`, truncation warning present, `estimatedTokens <= 50` |
| 4 | Default limits applied when omitted | Multi-file diff under 3000 lines and 50000 tokens, no `limits` in request | `computeReviewDiff` | `truncated: false`, defaults silently applied |
| 5 | Invalid limits: maxLines <= 0 | `limits: { maxLines: 0, maxTokens: 100 }` | `computeReviewDiff` | Throws `DiffSizePolicyError` |
| 6 | Invalid limits: maxTokens <= 0 | `limits: { maxLines: 100, maxTokens: -1 }` | `computeReviewDiff` | Throws `DiffSizePolicyError` |

### 9.2 AC-2: Warning visible in the run

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 7 | Warning present when truncated | Diff exceeding limits, 3 files | `computeReviewDiff` | `warnings` has exactly 1 entry with `kind: "diff-truncated"`, `message` is non-empty, `originalLines > keptLines`, `truncatedFileCount > 0`, `totalFileCount === 3` |
| 8 | No warning when within limits | Diff within limits | `computeReviewDiff` | `warnings` is empty array |
| 9 | Warning metrics are accurate | 3-file diff: 200+150+100 lines. Limit: 250 lines. | `computeReviewDiff` | `originalLines === 450`, `keptLines` equals sum of non-truncated files' lines, `truncatedFileCount` correct |

### 9.3 AC-3: Truncation preserves the full list of affected files

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 10 | All files present after truncation | 5-file diff exceeding limits | `computeReviewDiff` | `files.length === 5`, every file has non-empty `path`, valid `additions`/`deletions` |
| 11 | Truncated files retain stats | 3-file diff, largest file truncated | `computeReviewDiff` | Truncated file entry has `path`, `additions`, `deletions`, `diffLineCount` intact; `content === null`, `truncated === true` |
| 12 | Non-truncated files retain content | 3-file diff, only largest truncated | `computeReviewDiff` | Smaller files have `content !== null`, `truncated === false` |

### 9.4 Truncation algorithm correctness

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 13 | Largest file truncated first | 3 files: 300, 200, 100 lines. Limit: 350 lines | `computeReviewDiff` | File with 300 lines has `truncated: true`; others have `content !== null` |
| 14 | Multiple files truncated | 3 files: 300, 200, 100 lines. Limit: 80 lines | `computeReviewDiff` | Two largest files truncated; smallest retains content |
| 15 | All files truncated when necessary | 3 files: 300, 200, 100 lines. Limit: 1 line | `computeReviewDiff` | All 3 files have `truncated: true`, `totalLines === 0` |
| 16 | Single file diff truncated | 1 file with 500 lines. Limit: 100 lines | `computeReviewDiff` | File has `truncated: true`, `content === null`, but `path` and stats preserved |
| 17 | Tie-breaking: last file truncated first | 3 files with equal line counts (100 each). Limit: 250 lines | `computeReviewDiff` | The file appearing last in the diff is truncated; first two retain content |

### 9.5 Edge cases

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 18 | Empty diff | `git.diff` returns `{ raw: "", stats: [] }` | `computeReviewDiff` | `{ files: [], totalLines: 0, estimatedTokens: 0, truncated: false, warnings: [] }` |
| 19 | Single-file diff within limits | 1 file, 50 lines | `computeReviewDiff` | `files.length === 1`, `truncated: false`, file has full `content` |
| 20 | Exact limit boundary — at maxLines | Diff with exactly `maxLines` lines | `computeReviewDiff` | `truncated: false` — limit is inclusive (at-limit is within) |
| 21 | Exact limit boundary — one over maxLines | Diff with `maxLines + 1` lines | `computeReviewDiff` | `truncated: true` |
| 22 | Token estimation correctness | Diff content of known length (e.g., 100 chars) | `computeReviewDiff` | `estimatedTokens === Math.ceil(100 / 4) === 25` |

### 9.6 Error handling

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 23 | GitMergeBaseError propagates | `git.mergeBase` throws `GitMergeBaseError` | `computeReviewDiff` | `GitMergeBaseError` propagates unwrapped |
| 24 | GitDiffError propagates | `git.diff` throws `GitDiffError` | `computeReviewDiff` | `GitDiffError` propagates unwrapped |
| 25 | Empty repoPath rejected | `repoPath: ""` | `computeReviewDiff` | `InvalidWorktreeRequestError` |
| 26 | Non-absolute repoPath rejected | `repoPath: "relative"` | `computeReviewDiff` | `InvalidWorktreeRequestError` |
| 27 | Empty baseRef rejected | `baseRef: ""` | `computeReviewDiff` | `InvalidWorktreeRequestError` |
| 28 | Empty targetRef rejected | `targetRef: ""` | `computeReviewDiff` | `InvalidWorktreeRequestError` |

### 9.7 Diff parsing

| # | Scenario | Given | When | Then |
|---|---|---|---|---|
| 29 | Multi-file diff parsed correctly | Raw diff with 3 `diff --git` sections | `computeReviewDiff` | `files.length === 3`, each with correct `path` and `content` |
| 30 | File path extraction | Header `diff --git a/src/foo.ts b/src/foo.ts` | `computeReviewDiff` | `DiffFileEntry.path === "src/foo.ts"` |
| 31 | Stats-only file (binary/permission) | `stats` has a file not present in raw diff chunks | `computeReviewDiff` | File entry has `content: null`, `truncated: false`, `diffLineCount: 0` |

---

## 10. Scope boundary

### In scope

- One use case: `computeReviewDiff` in `src/core/workspace/`.
- Domain types: `ReviewDiff`, `DiffFileEntry`, `DiffWarning` (`DiffTruncatedWarning`) in `diff-types.ts`.
- Error class: `DiffSizePolicyError` in `diff-errors.ts`.
- Default limits constants: `DEFAULT_MAX_LINES`, `DEFAULT_MAX_TOKENS`.
- Diff parsing helper (private, not exported): splits raw unified diff into per-file chunks.
- Token estimation helper (private, not exported): `Math.ceil(text.length / 4)`.
- Extended `workspace-git-fake.ts`: `mergeBase` and `diff` support with call tracking and error injection.
- Updated `index.ts`: re-export new use case, types, errors, constants.
- Unit tests: 31 scenarios covering all 3 acceptance criteria.

### Out of scope

- **Prompt assembly** — `ReviewDiff` is structured data; the prompt assembler (E3/E4) formats it for the engine.
- **Autonomous diff mode** (`contextMode: agent`) — separate harness-level concern; this handles inline mode.
- **Actual tokenizer** — token count is a heuristic, not model-specific.
- **Changes to `GitPort`** — existing `mergeBase` and `diff` methods are sufficient.
- **Changes to `DiffLimitsSchema`** — the schema in repos already defines `maxLines`/`maxTokens`. Default values are applied at the use-case level.
- **Worktree creation/cleanup** — handled by E2.F3.H1.
- **Rename detection / moved-file tracking** — the diff uses git's default rename detection; no special handling in this story.
- **New ports** — workspace continues to depend on `GitPort` from repos.

---

## 11. Design decisions

| ID | Decision | Level | Rationale |
|---|---|---|---|
| dec-001 | Limits defined inline in request type, not imported from repos | A | The shape is 2 fields; structural typing guarantees compatibility with `DiffLimits` from repos config. Avoids coupling workspace to the repos schema module. |
| dec-002 | Limits in request (not deps) | A | Limits can vary per review invocation depending on harness/config. The run orchestrator resolves them from config and passes per-review. `GitPort` is the stable dependency (deps); limits are per-invocation data (request). |
| dec-003 | Token estimation: `Math.ceil(text.length / 4)` | A | Core cannot import tokenizers (I/O whitelist). The PRD's `maxTokens` is a tunable threshold; users compensate by adjusting the limit. Well-known heuristic for code/English text. |
| dec-004 | Greedy truncation by largest-file-first | A | Simple, deterministic, maximizes the number of files with full content. Not optimal but sufficient; the strategy can be refined later without API changes since it is internal to the use case. |
| dec-005 | Tie-breaking: truncate last file in diff order | A | Preserves content for files appearing first in the diff (typically core source before tests in alphabetical git output). Deterministic and intuitive. |
| dec-006 | `content: null` for truncated files (not a marker string) | A | Separates data from presentation. The consumer (prompt assembler, TUI) decides how to render truncated files. The `truncated` flag + `diffLineCount` provide all the information needed. |
| dec-007 | Git errors propagate unwrapped | A | Consistent with `listOrphanWorktrees` pattern. The caller (run orchestrator) needs `GitMergeBaseError` / `GitDiffError` for terminal-state logic. Wrapping would obscure the cause without enabling additional recovery. |
| dec-008 | Reuse `InvalidWorktreeRequestError` for input validation | A | Already exported from workspace. Adding a new `InvalidDiffRequestError` would be a new class for the same semantic (bad input). Workspace uses one validation error class. |
| dec-009 | Diff parsing via regex split on `^diff --git ` | A | Pure string manipulation, no I/O. Handles standard unified diff format. Edge cases with unusual paths are documented as known limitations. |
| dec-010 | `DiffSizePolicyError` has no `cause` parameter | A | It is a pre-validation error for invalid config values, not a wrapper around an underlying failure. Consistent with `InvalidWorktreeRequestError`. |
| dec-011 | Default limits (3000 lines / 50000 tokens) exported as named constants | A | Testability: tests can reference the constants instead of hardcoding magic numbers. Consumers can read them for documentation purposes. |

---

## 12. Open risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Diff parsing regex fails on paths containing ` b/` literally | Very low | Low — one file's content misattributed | Document as known limitation. Git quoting handles most edge cases. Can be refined with a more robust parser if encountered in practice. |
| Token heuristic significantly under/overestimates for non-Latin code | Medium | Low — user tunes `maxTokens` to compensate | Document the heuristic as approximate. The limit is a soft guideline. |
| `FileStats.path` does not match parsed chunk path for renames | Low | Medium — file gets `content: null` incorrectly | Adapter normalizes rename paths in `FileStats.path`. Test with rename fixtures if adding rename-heavy test data. |
| Very large diffs cause memory pressure during parsing | Low | Low — CLI context, diffs bounded by PR size | Process as needed; no premature optimization. |
| Files in raw diff not present in stats (or vice versa) | Low | Low — graceful: files still appear in result with available data | Stats are authoritative for the file list; chunks supplement content. Mismatches produce files with partial data, never crashes. |
