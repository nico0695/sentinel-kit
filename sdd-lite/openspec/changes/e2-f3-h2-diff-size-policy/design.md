# Design: E2.F3.H2 — Diff with size policy

## Change ID
`e2-f3-h2-diff-size-policy`

## 1. Internal helper functions

Three private helpers live inside `compute-review-diff.ts`. None are exported; they exist to keep the main flow readable and testable through the public use case.

### 1.1 `estimateTokens(text: string): number`

```typescript
/**
 * Approximate token count: ceil(charLength / 4).
 * Well-known heuristic for English/code text. Intentionally approximate;
 * the PRD's maxTokens limit is a tunable threshold, not model-specific.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Pure function, no edge cases beyond empty string (returns 0 via `Math.ceil(0 / 4)`).

### 1.2 `parseRawDiff(raw: string): ParsedFileChunk[]`

Internal type (not exported):

```typescript
interface ParsedFileChunk {
  readonly path: string;
  readonly content: string;
  readonly lineCount: number;
  readonly estimatedTokens: number;
}
```

Algorithm (detailed pseudocode):

```
function parseRawDiff(raw: string): ParsedFileChunk[] {
  // 1. Find all match indices of /^diff --git /m in `raw`
  const pattern = /^diff --git /gm;
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    indices.push(match.index);
  }

  // 2. If no matches, return empty (raw has no diff --git headers)
  if (indices.length === 0) return [];

  // 3. Slice raw into segments between consecutive indices
  const chunks: ParsedFileChunk[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]!;
    const end = i + 1 < indices.length ? indices[i + 1]! : raw.length;
    const content = raw.slice(start, end);

    // 4. Extract path from first line
    //    Line format: "diff --git a/<pathA> b/<pathB>"
    //    Find first newline to get the header line
    const newlineIdx = content.indexOf("\n");
    const headerLine = newlineIdx === -1 ? content : content.slice(0, newlineIdx);

    //    Find " b/" separator — everything after it is pathB
    const bSepIdx = headerLine.indexOf(" b/");
    const path = bSepIdx === -1 ? "" : headerLine.slice(bSepIdx + 3);

    // 5. Count lines: number of '\n' in content
    let lineCount = 0;
    for (let j = 0; j < content.length; j++) {
      if (content[j] === "\n") lineCount++;
    }

    chunks.push({
      path,
      content,
      lineCount,
      estimatedTokens: estimateTokens(content),
    });
  }

  return chunks;
}
```

Key implementation details:

- **Regex is `/^diff --git /gm`** — `g` for global iteration via `exec()`, `m` for multiline (so `^` matches start-of-line, not just start-of-string). This is essential; without `m`, only the first file header would match.
- **Index-based slicing** avoids the `split()` + re-prepend-delimiter complexity. Each segment includes its `diff --git` header line through to (but not including) the next header or end of string.
- **Path extraction uses `indexOf(" b/")` on the header line only** (not the full content). The `" b/"` separator is searched left-to-right; the first occurrence is used. The spec acknowledges paths containing literal ` b/` as a known limitation.
- **Line count via character scan** rather than `split("\n").length` — avoids allocating a large array. A trailing newline in the last segment means the count matches the number of complete lines, which is the expected diff line count.

### 1.3 `truncateFiles(entries, limits) -> { truncatedEntries, warning }`

This operates on mutable working copies of `DiffFileEntry[]`. To avoid mutating the originals, the main flow builds working entries as plain objects (not frozen) and this function mutates them in-place.

Detailed pseudocode:

```
function truncateFiles(
  entries: MutableDiffFileEntry[],
  totalLines: number,
  estimatedTokens: number,
  maxLines: number,
  maxTokens: number,
): { totalLines: number; estimatedTokens: number; warning: DiffTruncatedWarning } {

  const originalLines = totalLines;
  const originalTokens = estimatedTokens;
  let truncatedCount = 0;

  while (totalLines > maxLines || estimatedTokens > maxTokens) {
    // Find the non-truncated entry with the largest diffLineCount.
    // Tie-break: highest index wins (last in diff order truncated first).
    let candidateIdx = -1;
    let candidateLines = -1;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      // Skip already-truncated or content-less entries (binary/permission files)
      if (e.content === null) continue;
      // >= (not >) to implement tie-breaking: last occurrence wins
      if (e.diffLineCount >= candidateLines) {
        candidateIdx = i;
        candidateLines = e.diffLineCount;
      }
    }

    if (candidateIdx === -1) break; // all files already truncated

    const candidate = entries[candidateIdx]!;
    totalLines -= candidate.diffLineCount;
    estimatedTokens -= candidate.estimatedTokens;
    // Mutate in-place:
    candidate.content = null;
    candidate.truncated = true;
    // Note: candidate.estimatedTokens must be tracked separately since
    // the field doesn't exist on DiffFileEntry. See section 2 for how
    // we handle this with the working entry type.
    truncatedCount++;
  }

  const warning: DiffTruncatedWarning = {
    kind: "diff-truncated",
    message: `Diff truncated: ${originalLines} lines (est. ${originalTokens} tokens) exceeded limits (${maxLines} lines / ${maxTokens} tokens). ${truncatedCount} of ${entries.length} files truncated.`,
    originalLines,
    originalTokens,
    keptLines: totalLines,
    keptTokens: estimatedTokens,
    truncatedFileCount: truncatedCount,
    totalFileCount: entries.length,
  };

  return { totalLines, estimatedTokens, warning };
}
```

Tie-breaking detail: The `>=` comparison ensures that when multiple files share the same `diffLineCount`, the loop keeps updating `candidateIdx` to the higher index. This means the last file in diff order with the maximum line count is selected for truncation, preserving content for earlier files (which are typically core source files in alphabetical git output).

---

## 2. Working entry type for truncation

`DiffFileEntry` is a readonly interface with `content: string | null`. The truncation algorithm needs to mutate `content` and `truncated`, and also needs a per-entry token estimate (which `DiffFileEntry` does not carry). A mutable working type bridges this:

```typescript
// Internal to compute-review-diff.ts — not exported
interface WorkingFileEntry {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  content: string | null;       // mutable for truncation
  truncated: boolean;           // mutable for truncation
  readonly diffLineCount: number;
  readonly entryTokens: number; // per-file token estimate, used by truncation
}
```

After truncation, the working entries are mapped to readonly `DiffFileEntry` objects (dropping `entryTokens`):

```typescript
const files: DiffFileEntry[] = workingEntries.map((w) => ({
  path: w.path,
  additions: w.additions,
  deletions: w.deletions,
  content: w.content,
  truncated: w.truncated,
  diffLineCount: w.diffLineCount,
}));
```

This avoids spreading the mutable type into the public API while keeping the truncation loop simple and allocation-free (no object copying per iteration).

---

## 3. Main flow pseudocode — `computeReviewDiff`

```
async function computeReviewDiff(
  request: ComputeReviewDiffRequest,
  deps: ComputeReviewDiffDeps,
): Promise<ReviewDiff> {

  // --- Step 1: Input validation ---
  if (request.repoPath is empty)
    throw new InvalidWorktreeRequestError("repoPath must not be empty");
  if (request.repoPath does not start with "/")
    throw new InvalidWorktreeRequestError("repoPath must be an absolute path");
  if (request.baseRef is empty)
    throw new InvalidWorktreeRequestError("baseRef must not be empty");
  if (request.targetRef is empty)
    throw new InvalidWorktreeRequestError("targetRef must not be empty");

  if (request.limits is defined) {
    if (request.limits.maxLines <= 0)
      throw new DiffSizePolicyError(
        "maxLines must be positive, got ${request.limits.maxLines}"
      );
    if (request.limits.maxTokens <= 0)
      throw new DiffSizePolicyError(
        "maxTokens must be positive, got ${request.limits.maxTokens}"
      );
  }

  // --- Step 2: Merge-base resolution ---
  // Git errors propagate unwrapped (GitMergeBaseError).
  const mergeBase = await deps.git.mergeBase({
    repoPath: request.repoPath,
    commitA: request.baseRef,
    commitB: request.targetRef,
  });

  // --- Step 3: Diff computation ---
  // Git errors propagate unwrapped (GitDiffError).
  const diffResult = await deps.git.diff({
    repoPath: request.repoPath,
    from: mergeBase,
    to: request.targetRef,
  });

  // --- Step 4: Empty diff short-circuit ---
  if (diffResult.raw === "" && diffResult.stats.length === 0) {
    return { files: [], totalLines: 0, estimatedTokens: 0,
             truncated: false, warnings: [] };
  }

  // --- Step 5: Parse raw diff into per-file chunks ---
  const chunks = parseRawDiff(diffResult.raw);

  // Build a Map<path, ParsedFileChunk> for O(1) lookup in step 6.
  const chunksByPath = new Map<string, ParsedFileChunk>();
  for (const chunk of chunks) {
    chunksByPath.set(chunk.path, chunk);
  }

  // --- Step 6: Build working file entries ---
  const workingEntries: WorkingFileEntry[] = [];

  for (const stat of diffResult.stats) {
    const chunk = chunksByPath.get(stat.path);
    if (chunk !== undefined) {
      workingEntries.push({
        path: stat.path,
        additions: stat.additions,
        deletions: stat.deletions,
        content: chunk.content,
        truncated: false,
        diffLineCount: chunk.lineCount,
        entryTokens: chunk.estimatedTokens,
      });
    } else {
      // Binary file or permission-only change: present in stats, absent from
      // parsed diff. Include with null content, not marked as truncated.
      workingEntries.push({
        path: stat.path,
        additions: stat.additions,
        deletions: stat.deletions,
        content: null,
        truncated: false,
        diffLineCount: 0,
        entryTokens: 0,
      });
    }
  }

  // Handle chunks with no matching stat (should not happen with well-formed
  // git output, but handled gracefully per spec section 3).
  const statPaths = new Set(diffResult.stats.map((s) => s.path));
  for (const chunk of chunks) {
    if (!statPaths.has(chunk.path)) {
      workingEntries.push({
        path: chunk.path,
        additions: 0,
        deletions: 0,
        content: chunk.content,
        truncated: false,
        diffLineCount: chunk.lineCount,
        entryTokens: chunk.estimatedTokens,
      });
    }
  }

  // Compute aggregate totals (only entries with content).
  let totalLines = 0;
  let totalTokens = 0;
  for (const e of workingEntries) {
    if (e.content !== null) {
      totalLines += e.diffLineCount;
      totalTokens += e.entryTokens;
    }
  }

  // --- Step 7: Size policy evaluation ---
  const maxLines = request.limits?.maxLines ?? DEFAULT_MAX_LINES;
  const maxTokens = request.limits?.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (totalLines <= maxLines && totalTokens <= maxTokens) {
    // Within limits — return without truncation.
    return {
      files: toReadonlyEntries(workingEntries),
      totalLines,
      estimatedTokens: totalTokens,
      truncated: false,
      warnings: [],
    };
  }

  // --- Step 8: Truncation ---
  const truncResult = truncateFiles(
    workingEntries, totalLines, totalTokens, maxLines, maxTokens
  );

  // --- Step 9: Assemble and return ---
  return {
    files: toReadonlyEntries(workingEntries),
    totalLines: truncResult.totalLines,
    estimatedTokens: truncResult.estimatedTokens,
    truncated: true,
    warnings: [truncResult.warning],
  };
}

// Small mapper to convert working entries to readonly DiffFileEntry[].
function toReadonlyEntries(working: WorkingFileEntry[]): DiffFileEntry[] {
  return working.map((w) => ({
    path: w.path,
    additions: w.additions,
    deletions: w.deletions,
    content: w.content,
    truncated: w.truncated,
    diffLineCount: w.diffLineCount,
  }));
}
```

---

## 4. Extending `workspace-git-fake.ts`

### 4.1 New imports

```typescript
import type {
  DiffRequest,
  DiffResult,
  MergeBaseRequest,
  // existing imports unchanged
} from "../../repos/index.js";
```

### 4.2 Extended config interface

Add two optional fields to `FakeGitPortConfig`:

```typescript
export interface FakeGitPortConfig {
  // ... existing fields (addError, removeError, listError, initialWorktrees) ...
  readonly mergeBaseResult?: string;
  readonly mergeBaseError?: Error;
  readonly diffResult?: DiffResult;
  readonly diffError?: Error;
}
```

### 4.3 Extended state interface

Add two call-tracking arrays to `FakeWorktreeState`:

```typescript
export interface FakeWorktreeState {
  // ... existing fields (addCalls, removeCalls, listCalls, worktrees) ...
  readonly mergeBaseCalls: MergeBaseRequest[];
  readonly diffCalls: DiffRequest[];
}
```

### 4.4 Implementation changes

In `createFakeGitPort`:

1. Declare new tracking arrays alongside existing ones:
   ```typescript
   const mergeBaseCalls: MergeBaseRequest[] = [];
   const diffCalls: DiffRequest[] = [];
   ```

2. Add them to the returned object alongside existing state fields.

3. Replace the `notImplemented` stubs for `mergeBase` and `diff` with real implementations:

   ```typescript
   async mergeBase(req: MergeBaseRequest): Promise<string> {
     mergeBaseCalls.push(req);
     if (config?.mergeBaseError) throw config.mergeBaseError;
     return config?.mergeBaseResult ?? "abc123def456";
   },

   async diff(req: DiffRequest): Promise<DiffResult> {
     diffCalls.push(req);
     if (config?.diffError) throw config.diffError;
     return config?.diffResult ?? { raw: "", stats: [] };
   },
   ```

4. The `notImplemented` function remains for other stubs (`clone`, `fetch`, `branches`, `defaultBranch`).

### 4.5 Backward compatibility

Existing tests (`create-review-worktree.test.ts`, `cleanup-worktree.test.ts`, `list-orphan-worktrees.test.ts`) call `createFakeGitPort()` without `mergeBase`/`diff` config. They continue to work because:
- The new config fields are optional.
- The new state arrays are always initialized (empty).
- Existing tests never call `mergeBase` or `diff` on the fake.

---

## 5. File-by-file creation/modification plan

### 5.1 NEW: `src/core/workspace/diff-types.ts`

Contains three readonly interfaces, no imports:

- `DiffFileEntry` — per-file entry (path, additions, deletions, content, truncated, diffLineCount)
- `DiffTruncatedWarning` — structured warning with `kind: "diff-truncated"` discriminator
- `DiffWarning` — discriminated union type alias (`= DiffTruncatedWarning`)
- `ReviewDiff` — aggregate result (files, totalLines, estimatedTokens, truncated, warnings)

All fields `readonly`. Arrays use `readonly T[]` syntax. No logic, no imports.

**Lines: ~55.**

### 5.2 NEW: `src/core/workspace/diff-errors.ts`

Single error class:

- Imports: `WorkspaceError` from `./workspace-errors.js`
- `DiffSizePolicyError extends WorkspaceError` with `constructor(message: string)` (no `cause`)
- Sets `this.name = "DiffSizePolicyError"`

Follows exact pattern of `InvalidWorktreeRequestError` (no options, no cause).

**Lines: ~15.**

### 5.3 NEW: `src/core/workspace/compute-review-diff.ts`

The main file. Structure top-to-bottom:

1. **Imports**: `GitPort` (type-only) from `../repos/index.js`, `InvalidWorktreeRequestError` from `./workspace-errors.js`, `DiffSizePolicyError` from `./diff-errors.js`, types from `./diff-types.js`.
2. **Constants**: `DEFAULT_MAX_LINES = 3000`, `DEFAULT_MAX_TOKENS = 50000` (exported).
3. **Request/Deps interfaces**: `ComputeReviewDiffRequest`, `ComputeReviewDiffDeps` (exported).
4. **Internal types**: `ParsedFileChunk`, `WorkingFileEntry` (not exported).
5. **Private helpers**: `estimateTokens`, `parseRawDiff`, `truncateFiles`, `toReadonlyEntries`.
6. **Use case**: `computeReviewDiff` (exported, async function).

Import rule compliance:
- Only type import from `../repos/index.js` (`GitPort`).
- Value imports only from sibling workspace files (`workspace-errors.js`, `diff-errors.js`).
- Type imports from `./diff-types.js`.
- No I/O libraries. No zod needed.

**Lines: ~180.**

### 5.4 MODIFIED: `src/core/workspace/index.ts`

Append new export groups after existing exports. Follows the exact grouping style of existing exports (one `export {}` block per source file, types grouped with `export type`):

```typescript
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

Module JSDoc comment updated to mention four use cases (was three).

### 5.5 MODIFIED: `src/core/workspace/__test__/workspace-git-fake.ts`

Changes described in section 4. Summary:
- Add imports for `DiffRequest`, `DiffResult`, `MergeBaseRequest`.
- Extend `FakeGitPortConfig` with 4 optional fields.
- Extend `FakeWorktreeState` with 2 array fields.
- Add tracking arrays and real implementations for `mergeBase` and `diff`.
- Remove `mergeBase` and `diff` from `notImplemented` assignments.

### 5.6 NEW: `src/core/workspace/__test__/compute-review-diff.test.ts`

31 test scenarios organized in `describe` blocks matching spec sections 9.1-9.7. Structure:

```typescript
import { describe, expect, it } from "vitest";
import { GitDiffError, GitMergeBaseError } from "../../repos/index.js";
import type { DiffResult } from "../../repos/index.js";
import {
  computeReviewDiff,
  type ComputeReviewDiffDeps,
  type ComputeReviewDiffRequest,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_TOKENS,
  DiffSizePolicyError,
  InvalidWorktreeRequestError,
} from "../index.js";
import { createFakeGitPort } from "./workspace-git-fake.js";
```

Test helper pattern (following existing test style from `list-orphan-worktrees.test.ts`):

```typescript
const REPO_PATH = "/sentinel/clones/owner/my-repo";

function makeDeps(overrides?: Partial<...>): ComputeReviewDiffDeps {
  return { git: createFakeGitPort(), ...overrides };
}

function makeRequest(overrides?: Partial<...>): ComputeReviewDiffRequest {
  return {
    repoPath: REPO_PATH,
    baseRef: "origin/main",
    targetRef: "origin/feature-x",
    ...overrides,
  };
}
```

Test data builders for generating multi-file diffs:

```typescript
/**
 * Build a raw unified diff string from an array of { path, lineCount } specs.
 * Each file gets `lineCount` hunk lines (all additions) so line counts are
 * predictable and verifiable.
 */
function buildRawDiff(
  files: { path: string; lineCount: number }[],
): string { ... }

/**
 * Build matching FileStats[] from the same array spec. Each file gets
 * `lineCount` additions, 0 deletions.
 */
function buildStats(
  files: { path: string; lineCount: number }[],
): FileStats[] { ... }
```

The `buildRawDiff` function generates realistic unified diff output:
```
diff --git a/<path> b/<path>
index 0000000..1111111 100644
--- a/<path>
+++ b/<path>
@@ -0,0 +1,<lineCount> @@
+line 1
+line 2
...
```

This ensures `parseRawDiff` exercises the real splitting and path-extraction logic, not just synthetic markers.

**Lines: ~450-500.**

---

## 6. Diff chunk parsing algorithm — detailed walkthrough

Given a raw diff string like:

```
diff --git a/src/core/foo.ts b/src/core/foo.ts
index abc123..def456 100644
--- a/src/core/foo.ts
+++ b/src/core/foo.ts
@@ -1,3 +1,5 @@
 existing line
+added line 1
+added line 2
 context line
diff --git a/src/core/bar.ts b/src/core/bar.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/core/bar.ts
@@ -0,0 +1,2 @@
+new file line 1
+new file line 2
```

Step-by-step:

1. **Regex scan**: `/^diff --git /gm` finds two matches:
   - Index 0: `"diff --git a/src/core/foo.ts b/src/core/foo.ts"`
   - Index N: `"diff --git a/src/core/bar.ts b/src/core/bar.ts"`

2. **Slicing**: Two segments:
   - Segment 0: from index 0 to index N (everything for `foo.ts`)
   - Segment 1: from index N to end (everything for `bar.ts`)

3. **Path extraction for segment 0**:
   - Header line: `"diff --git a/src/core/foo.ts b/src/core/foo.ts"`
   - `indexOf(" b/")` returns the position before `b/src/core/foo.ts`
   - Slice from `bSepIdx + 3` to end of line: `"src/core/foo.ts"`

4. **Line count**: Count `\n` characters in the segment content.

5. **Token estimate**: `Math.ceil(segmentContent.length / 4)`.

Edge cases handled:
- **Leading whitespace before first `diff --git`**: The regex with `^` and `m` flag still matches at line start. The index-based approach means any text before the first match is discarded (it falls before `indices[0]`).
- **No trailing newline**: The last segment extends to `raw.length`, so no content is lost.
- **New file / deleted file / rename**: The `diff --git a/<old> b/<new>` format always has ` b/` — the path extraction always targets the `b/` side (destination path, which is canonical for renames and new files).

---

## 7. Truncation algorithm — execution trace example

Given 3 files with line counts [300, 200, 100] and `maxLines = 80`:

| Iteration | totalLines | Candidate (index, lines) | Action |
|-----------|-----------|------------------------|--------|
| Start | 600 | - | 600 > 80, enter loop |
| 1 | 600 | (0, 300) | Truncate file 0. totalLines = 300 |
| 2 | 300 | (1, 200) | Truncate file 1. totalLines = 100 |
| 3 | 100 | (2, 100) | Truncate file 2. totalLines = 0 |
| End | 0 | - | 0 <= 80, exit loop |

Wait — with limit 80, after truncating files 0 and 1 we have 100 lines, which is still > 80, so file 2 also gets truncated. Result: all 3 files truncated, `totalLines = 0`. Matches spec test scenario #15.

Tie-breaking trace for 3 files each with 100 lines, `maxLines = 250`:

| Iteration | totalLines | Scan result | Action |
|-----------|-----------|-------------|--------|
| Start | 300 | - | 300 > 250, enter loop |
| 1 | 300 | i=0: 100 >= -1, candidate=(0,100). i=1: 100 >= 100, candidate=(1,100). i=2: 100 >= 100, candidate=(2,100). | Truncate index 2. totalLines = 200 |
| End | 200 | - | 200 <= 250, exit loop |

File at index 2 (last in diff order) is truncated. Indices 0 and 1 retain content. Matches spec test scenario #17.

---

## 8. Import graph validation

```
compute-review-diff.ts
  |- (type) ../repos/index.js  -> GitPort
  |- (value) ./workspace-errors.js -> InvalidWorktreeRequestError
  |- (value) ./diff-errors.js -> DiffSizePolicyError
  |- (type) ./diff-types.js -> ReviewDiff, DiffFileEntry, DiffWarning, DiffTruncatedWarning

diff-errors.ts
  |- (value) ./workspace-errors.js -> WorkspaceError

diff-types.ts
  |- (none)

index.ts (barrel)
  |- re-exports from all above
```

Guard compliance:
- **core-no-io-libs**: No I/O imports. No zod (not needed).
- **core-modules-via-index**: `../repos/index.js` used for cross-module access.
- **adapters-never-imported**: No adapter imports.
- **no-cross-adapter**: N/A (all core).

---

## 9. Design decisions (implementation-level)

| ID | Decision | Level | Rationale |
|----|----------|-------|-----------|
| des-001 | `WorkingFileEntry` mutable type for truncation loop | A | Avoids copying objects per iteration. Mapped to readonly `DiffFileEntry` after truncation. The mutable type is internal, never exported. |
| des-002 | `parseRawDiff` uses `exec()` loop + index slicing (not `split()`) | A | `split()` discards the delimiter; re-prepending adds complexity. Index-based slicing is straightforward and preserves the full segment including the header. |
| des-003 | Chunk-to-stats lookup via `Map<string, ParsedFileChunk>` | A | O(1) per stat entry vs O(n*m) nested loop. File count is small in practice but the Map is zero-cost to implement. |
| des-004 | `entryTokens` field on `WorkingFileEntry` for truncation bookkeeping | A | `DiffFileEntry` intentionally omits per-file token estimate (not useful to consumers). The working type carries it for the truncation subtraction, then drops it in the mapping step. |
| des-005 | `buildRawDiff` test helper generates realistic unified diff | A | Tests exercise the real parsing logic (regex splitting, path extraction) rather than passing pre-parsed data. More confidence, minimal extra code. |
| des-006 | Line count via character scan (not `split("\n")`) | A | Avoids allocating a large string array per file chunk. Performance difference is negligible at expected sizes, but the scan is simpler and has no off-by-one with trailing newlines when counting `\n` occurrences. |

---

## 10. Open risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `exec()` with `/gm` regex on very large raw diff strings could be slow | Very low | Negligible — V8 regex engine handles this efficiently | No mitigation needed; raw diffs are bounded by PR size. |
| `WorkingFileEntry` mutable pattern could leak if future code caches references | Low | Low — mapping to readonly at the boundary seals it | The type is internal and not exported; the boundary conversion in `toReadonlyEntries` is the only exit. |
| Line count by `\n` counting differs from "number of lines" for content without trailing newline | Very low | Negligible — git diff always ends with a newline | Consistent with spec definition; documented. |
