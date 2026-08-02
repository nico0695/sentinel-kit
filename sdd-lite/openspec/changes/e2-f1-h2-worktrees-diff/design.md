# Design

## Routing Digest

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- digest_summary: Extend GitPort with 5 methods (worktreeAdd, worktreeRemove, worktreeList, mergeBase, diff), 3 error subclasses, 4 request types, 3 domain types. Adapter uses machine-readable git flags. Contract suite extended with divergent-branch fixture.
- affected_areas_digest: git-port.ts (interface + types), git-port-errors.ts (3 subclasses), repos/index.ts (re-exports), git-cli.ts (adapter impl + parsers), GitPort.contract.ts (contract suite), git-cli.test.ts (fixture extensions)
- interfaces_digest: WorktreeAddRequest, WorktreeRemoveRequest, MergeBaseRequest, DiffRequest, WorktreeInfo, DiffResult, FileStats, GitWorktreeError, GitMergeBaseError, GitDiffError

## Summary

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- design_status: approved

## Design Overview

Replicate the H1 pattern (interface extension, request types, error subclasses, adapter implementation, contract tests) for five new GitPort methods. All new types live in the core ports directory with no I/O imports. The adapter translates git output into domain types and git failures into typed port errors using the existing `wrapAs` helper. Two parsers are added to the adapter: one for `worktree list --porcelain` and one for `diff --numstat`.

The fixture gains a divergent-branch setup (base and target branches forked from a common ancestor with independent commits) to support merge-base and diff contract tests.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/core/repos/ports/git-port.ts` | Add 5 methods to `GitPort`, 4 request types, 3 domain types | Low — additive, no existing signatures change |
| `src/core/repos/ports/git-port-errors.ts` | Add `GitWorktreeError`, `GitMergeBaseError`, `GitDiffError` | Low — follows exact constructor pattern |
| `src/core/repos/index.ts` | Re-export all new types and errors | Low — additive |
| `src/adapters/driven/git/git-cli.ts` | Implement 5 methods + 2 parsers (`parseWorktreeList`, `parseDiffNumstat`) | Medium — parsing logic needs careful handling of edge cases |
| `src/adapters/driven/git/__test__/GitPort.contract.ts` | Add worktree, mergeBase, diff describe blocks (imports new errors) | Low — follows existing pattern |
| `src/adapters/driven/git/__test__/git-cli.test.ts` | Extend `GitFixture` + `setupFixture` with divergent branches | Medium — fixture complexity increases |

## Interfaces, Data, And State

### Request types (in `git-port.ts`)

```typescript
/** worktreeAdd(request) — targetPath must be ABSOLUTE (dec-a1). */
export interface WorktreeAddRequest {
  readonly repoPath: string;
  readonly targetPath: string;
  readonly commitish: string;
}

/** worktreeRemove(request) — worktreePath must be ABSOLUTE. */
export interface WorktreeRemoveRequest {
  readonly repoPath: string;
  readonly worktreePath: string;
}

/** mergeBase(request) — two commit-ish strings (dec-a2). */
export interface MergeBaseRequest {
  readonly repoPath: string;
  readonly commitA: string;
  readonly commitB: string;
}

/** diff(request) — two commit-ish, caller does merge-base separately (dec-a2). */
export interface DiffRequest {
  readonly repoPath: string;
  readonly from: string;
  readonly to: string;
}
```

### Domain types (in `git-port.ts`)

```typescript
/** Single entry from git worktree list --porcelain. */
export interface WorktreeInfo {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;  // null when detached HEAD
}

/** Per-file change stats from diff --numstat. */
export interface FileStats {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

/** Combined diff output (dec-b3). */
export interface DiffResult {
  readonly raw: string;
  readonly stats: readonly FileStats[];
}
```

### GitPort method extensions

```typescript
// Added to the existing GitPort interface:

worktreeAdd(request: WorktreeAddRequest): Promise<void>;
worktreeRemove(request: WorktreeRemoveRequest): Promise<void>;
worktreeList(repoPath: string): Promise<readonly WorktreeInfo[]>;
mergeBase(request: MergeBaseRequest): Promise<string>;
diff(request: DiffRequest): Promise<DiffResult>;
```

### Error subclasses (in `git-port-errors.ts`)

Three new subclasses, identical constructor pattern to `GitCloneError`:

```typescript
export class GitWorktreeError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitWorktreeError";
  }
}

export class GitMergeBaseError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitMergeBaseError";
  }
}

export class GitDiffError extends GitError {
  constructor(message: string, options?: GitErrorOptions) {
    super(message, options);
    this.name = "GitDiffError";
  }
}
```

### Adapter git commands

| Method | Git command | Notes |
|---|---|---|
| `worktreeAdd` | `git -C repoPath worktree add --detach targetPath commitish` | `isAbsolute(targetPath)` guard before spawn |
| `worktreeRemove` | `git -C repoPath worktree remove --force worktreePath` | `--force` per spec (dirty worktrees OK for ephemeral reviews) |
| `worktreeList` | `git -C repoPath worktree list --porcelain` | Parse with `parseWorktreeList` |
| `mergeBase` | `git -C repoPath merge-base commitA commitB` | Trim stdout, validate 40-hex |
| `diff` | `git -C repoPath diff from to` (unified) + `git -C repoPath diff --numstat from to` (stats) | Two spawns; parse numstat with `parseDiffNumstat` |

### Parsing logic

**`parseWorktreeList`** — `--porcelain` output is blocks separated by blank lines. Each block has lines: `worktree <path>`, `HEAD <sha>`, and either `branch refs/heads/<name>` or `detached`. Extract `path`, `head` (40-hex), and `branch` (strip `refs/heads/` prefix) or `null` if detached.

**`parseDiffNumstat`** — each line is `<additions>\t<deletions>\t<path>`. Binary files show `-\t-\t<path>` — map those to `0/0` additions/deletions. Split on `\t`, parse first two fields as integers (or 0 for `-`), third field is the path.

### Error translation table

| Failure scenario | Git signal | Port error | Cause preserved |
|---|---|---|---|
| `worktreeAdd` with relative `targetPath` | Pre-spawn guard | `GitWorktreeError` | No (no `cause`) |
| `worktreeAdd` git failure (path exists, bad commitish) | Non-zero exit | `GitWorktreeError` | Yes |
| `worktreeRemove` git failure (not a worktree, path absent) | Non-zero exit | `GitWorktreeError` | Yes |
| `worktreeList` on non-repo path | Non-zero exit | `GitWorktreeError` | Yes |
| `mergeBase` unresolvable ref | Non-zero exit | `GitMergeBaseError` | Yes |
| `mergeBase` on non-repo path | Non-zero exit | `GitMergeBaseError` | Yes |
| `diff` unresolvable ref | Non-zero exit | `GitDiffError` | Yes |
| `diff` on non-repo path | Non-zero exit | `GitDiffError` | Yes |

### Fixture extensions for contract tests

The `GitFixture` interface gains:

```typescript
/** Branch forked from main with file additions (for diff testing). */
readonly featureBranch: string;
/** SHA of the fork point (common ancestor of main and featureBranch). */
readonly forkPointSha: string;
/** Number of files changed on featureBranch since fork point. */
readonly featureBranchChangedFiles: number;
```

The `setupFixture` function adds after the existing branch setup:

1. Create `feat-diverge` branch from current `main` HEAD in the seed clone.
2. On `feat-diverge`: add two files (`file-a.txt`, `file-b.txt`), commit.
3. Switch back to `main`: add one different file (`file-c.txt`), commit. Push `main` to bare.
4. Push `feat-diverge` to bare. Record the fork-point SHA.
5. In the working clone, fetch to pick up both branches.

This gives: `mergeBase(main, feat-diverge)` = fork point; `diff(forkPoint, feat-diverge)` shows only file-a and file-b; base-only changes (file-c) are excluded — proving PR-semantics (AC-8).

### Contract test plan

| Describe block | Test case | Validates |
|---|---|---|
| worktreeAdd | Creates worktree at absolute path; worktreeList includes it | AC-1 |
| worktreeAdd | Rejects relative path with GitWorktreeError (no cause) | AC-2 |
| worktreeAdd | Wraps bad commitish as GitWorktreeError with cause | Error translation |
| worktreeRemove | Removes worktree; worktreeList no longer includes it | AC-3 |
| worktreeRemove | Wraps non-existent path as GitWorktreeError with cause | Error translation |
| worktreeList | Returns WorktreeInfo[] with main worktree (always >= 1) | AC-4 |
| worktreeList | Wraps non-repo path as GitWorktreeError with cause | Error translation |
| mergeBase | Returns 40-hex SHA for two valid refs | AC-5 |
| mergeBase | Wraps unresolvable ref as GitMergeBaseError with cause | Error translation |
| diff | Returns DiffResult with raw (unified) and stats (file count matches) | AC-6 |
| diff | Identical refs return empty raw and empty stats | AC-7 |
| diff | PR-semantics: diff(mergeBase(base, target), target) shows only target changes | AC-8 |
| diff | Wraps unresolvable ref as GitDiffError with cause | Error translation |
| (all errors) | All three new errors extend GitError; instanceof discrimination works | AC-9 |

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Single `diff` invocation with `--stat` parsing vs. two invocations (unified + numstat) | Two invocations (dec-b3) | Simpler parsing; `--numstat` is machine-readable; negligible latency for review-sized diffs |
| `worktreeList` with separate error vs. reuse `GitCommandError` | Dedicated `GitWorktreeError` | Consistent: each method family has its own error subclass for downstream discrimination |
| Embed merge-base inside `diff` vs. separate `mergeBase` method | Separate (dec-a2) | Composability: caller controls the base; both methods are independently testable |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | All design questions resolved via A/B decisions in proposal and spec | N/A | N/A |

## Approval Notes

- All design decisions (B1, B3, A1, A2, A3) were finalized in spec. No new decisions introduced.
- Interfaces follow the exact patterns from H1 (request types, error constructors, adapter factory, contract harness).
- The fixture extension for divergent branches is the only structural novelty; it uses the same hermetic `git(...)` helper pattern from H1.

## Budget Notes

- Target roughly 400 to 600 words plus tables for the full artifact when possible.
