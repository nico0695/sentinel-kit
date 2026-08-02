# Spec

## Routing Digest

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- digest_summary: Extend GitPort with worktreeAdd/worktreeRemove/worktreeList, mergeBase, and diff. Adapter implementation in git-cli. Contract tests against temporary repos.
- scope_digest: 5 new GitPort methods, 3 new error subclasses, 4 domain types, adapter implementation, contract suite extension
- acceptance_digest: Worktree created/destroyed cleanly (--porcelain verifiable), diff matches PR semantics (merge-base..target), tests against temporary repos

## Summary

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- spec_status: approved

## Scope Boundary

### In Scope

- Extend `GitPort` interface with five methods: `worktreeAdd`, `worktreeRemove`, `worktreeList`, `mergeBase`, `diff`
- Request types: `WorktreeAddRequest`, `WorktreeRemoveRequest`, `MergeBaseRequest`, `DiffRequest` (readonly interfaces)
- Domain types: `WorktreeInfo` (path, head, branch — from `--porcelain`), `DiffResult` (`{ raw: string; stats: readonly FileStats[] }`), `FileStats` (path, additions, deletions — from `--numstat`)
- Three new error subclasses: `GitWorktreeError`, `GitMergeBaseError`, `GitDiffError` (extend `GitError`, same constructor pattern)
- git-cli adapter: implement all five methods with execa + machine-readable flags
- Extend `GitFixture` and `GitPortContractHarness` with worktree/merge-base/diff scenarios
- Re-export all new types and errors from `src/core/repos/index.ts`

### Out Of Scope

- Worktree cleanup policies (always / on-success / keep) — E2.F3.H1
- Diff truncation / large-diff size policy — E2.F3.H2
- Workspace use cases consuming these methods
- ConfigStore, registerRepo, or any E2.F2 work

### Non-Goals

- Automatic path construction for worktrees — the port stays layout-agnostic; callers (workspace module) own the naming convention `worktrees/<repo>/<branch>-<ts>` from PRD SS5.1
- Implicit merge-base inside `diff` — composability requires separation
- Worktree pruning or garbage collection

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `worktreeAdd` with valid absolute path and commit-ish | Creates a detached worktree at the given path; `worktreeList` includes it | PRD SS5.1: ephemeral worktree per review |
| `worktreeAdd` with relative path | Rejects with `GitWorktreeError` before spawning git | Same guard pattern as `clone` (dec-004) |
| `worktreeAdd` when path already exists | Rejects with `GitWorktreeError` (cause preserved) | git itself rejects; adapter translates |
| `worktreeRemove` on valid worktree path | Worktree removed; `worktreeList` no longer includes it | `--force` flag: worktree may have uncommitted content |
| `worktreeRemove` on non-existent path | Rejects with `GitWorktreeError` (cause preserved) | Adapter translates git error |
| `worktreeList` on repo with worktrees | Returns `WorktreeInfo[]` matching `git worktree list --porcelain` | Machine-readable format |
| `worktreeList` on repo with no extra worktrees | Returns array with main worktree only | Always at least one entry |
| `mergeBase` with two valid commit-ish | Returns the merge-base commit SHA (40-hex) | Foundation for PR-semantics diff |
| `mergeBase` with unresolvable ref | Rejects with `GitMergeBaseError` (cause preserved) | e.g., unknown branch name |
| `diff` between two valid commit-ish | Returns `DiffResult` with unified diff in `raw` and per-file `FileStats` in `stats` | Two git invocations: `diff` + `diff --numstat` |
| `diff` with identical refs | Returns `DiffResult` with empty `raw` and empty `stats` | No changes = no diff |
| `diff` with unresolvable ref | Rejects with `GitDiffError` (cause preserved) | Adapter translates |
| Any method on non-repo path | Rejects with appropriate error subclass (cause preserved) | Consistent with H1 pattern |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `worktreeAdd` creates an accessible worktree at the specified absolute path; `worktreeList` includes it with correct path, head SHA, and branch | Create worktree, list, assert entry present with matching fields | must |
| AC-2 | `worktreeAdd` rejects relative paths with `GitWorktreeError` before spawning git (no `cause`) | Pass relative path, assert `instanceof GitWorktreeError` and `cause` is undefined | must |
| AC-3 | `worktreeRemove` removes the worktree; `worktreeList` no longer includes it | Add then remove, list, assert entry absent | must |
| AC-4 | `worktreeList` returns `WorktreeInfo[]` parsed from `--porcelain` output; main worktree always present | List on repo with no extra worktrees, assert length >= 1 | must |
| AC-5 | `mergeBase` returns a 40-hex SHA for two valid refs | Assert `/^[0-9a-f]{40}$/` match | must |
| AC-6 | `diff` returns `DiffResult` where `raw` is the unified diff and `stats` contains one `FileStats` entry per changed file with correct additions/deletions | Create divergent branches, diff, assert raw contains `+++`/`---` and stats match expected file count | must |
| AC-7 | `diff` between identical refs returns empty `raw` and empty `stats` | Diff a ref against itself | must |
| AC-8 | PR-semantics test: `diff(mergeBase(base, target), target)` produces the same set of changed files as the divergent commits on `target` since fork point, ignoring commits added to `base` after the fork | Create base + target branches with independent commits, verify diff shows only target's changes | must |
| AC-9 | All three error subclasses (`GitWorktreeError`, `GitMergeBaseError`, `GitDiffError`) extend `GitError`; `instanceof` discrimination works | Assert `instanceof GitError` and `instanceof <specific>` | must |
| AC-10 | All new types and errors re-exported from `src/core/repos/index.ts` | Import from index path in tests | must |
| AC-11 | No I/O imports in `src/core/repos/ports/` (zod-only whitelist) | `npm run check` passes (depcruise guard) | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `worktreeRemove --force` removes even dirty worktrees | Low | Appropriate for ephemeral review worktrees; cleanup policy (E2.F3.H1) will add configurability later |
| Two git invocations for `diff` (unified + numstat) | Low | Simpler parsing than combined format; negligible latency for code-review-sized diffs |
| `worktreeAdd` uses `--detach` (detached HEAD) | Low | Review worktrees need no branch; avoids branch-name collisions across concurrent reviews |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| `worktreeAdd` path parameter | Determines port contract shape | design | **Decided (A)**: caller provides absolute path; port rejects relative (same guard as `clone.targetPath`, dec-004). Layout convention (`worktrees/<repo>/<branch>-<ts>`) stays in workspace module. |
| `diff` parameters | Determines composability with `mergeBase` | design | **Decided (A)**: two commit-ish strings (`from`, `to`); caller calls `mergeBase` separately then passes result to `diff`. Keeps both methods independently testable. |
| `worktreeList` scope | Determines flexibility of the listing API | design | **Decided (A)**: single `repoPath` parameter, returns all worktrees for that repo. Matches `branches(repoPath)` pattern. |

## Approval Notes

- Design decisions B1 (single GitPort) and B3 (diff = raw + stats) pre-approved by user.
- Three open questions from proposal formalized as A-level decisions: path parameter, diff parameters, worktreeList scope. All follow established patterns from H1.
- No material ambiguity remains. All acceptance criteria are concrete and testable.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
