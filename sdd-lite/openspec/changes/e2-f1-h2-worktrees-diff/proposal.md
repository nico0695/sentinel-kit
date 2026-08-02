# Proposal

## Routing Digest

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- digest_summary: Extend GitPort with worktree add/remove/list, merge-base, and diff (unified + numstat). Adapter implementation in git-cli. Contract tests against temporary repos.
- feasibility_signal: high confidence — well-scoped extension of a proven port/adapter pair
- scope_sketch_digest: 3 port methods, 3 new error subclasses, adapter implementation, contract suite extension

## Summary

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: false

## Problem And Desired Outcome

The review flow requires ephemeral worktrees, merge-base resolution, and diff generation (PRD SS5.1). Today GitPort only covers clone/fetch/branches/defaultBranch (E2.F1.H1). Without worktree and diff operations, the core review orchestrator (E3) cannot isolate reviews or produce the diff that feeds the prompt.

**Desired outcome**: GitPort exposes `worktreeAdd`, `worktreeRemove`, `worktreeList`, `mergeBase`, and `diff` methods. The git-cli adapter implements them using machine-readable git formats. Contract tests verify behavior against real temporary git repos, following the existing harness pattern.

## Initial Scope Sketch

### Likely In Scope

- Extend `GitPort` interface with five new methods: `worktreeAdd`, `worktreeRemove`, `worktreeList`, `mergeBase`, `diff`
- Domain types: `WorktreeInfo` (from `--porcelain`), `DiffResult` (`{ raw: string, stats: FileStats[] }`), `FileStats` (path + additions + deletions from `--numstat`)
- Request types: `WorktreeAddRequest`, `MergeBaseRequest`, `DiffRequest`
- Three new error subclasses: `GitWorktreeError`, `GitMergeBaseError`, `GitDiffError` (following existing `GitError` hierarchy pattern)
- git-cli adapter: implement all five methods with `execa` + machine-readable flags (`worktree list --porcelain`, `worktree add`, `worktree remove`, `merge-base`, `diff --numstat` + `diff`)
- Extend `GitFixture` and `GitPortContractHarness` with scenarios for worktree lifecycle, merge-base, and diff
- Contract tests covering: worktree created/destroyed cleanly, diff matches PR semantics (merge-base), error translation for each failure family
- Re-export new types and errors from `src/core/repos/index.ts`

### Likely Out Of Scope

- Worktree cleanup policies (`always | on-success | keep`) — belongs to workspace module (E2.F1.H3 or later)
- Diff truncation / large-diff warning policy — belongs to review/run flow (later epic)
- Workspace use cases consuming these port methods — separate story
- Any I/O imports in core (zod-only rule stands)

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Port extension pattern | H1 established the exact pattern: interface + request types + error subclasses + adapter factory + contract suite. H2 replicates it. | high |
| Git CLI surface | `worktree add/remove/list --porcelain`, `merge-base`, `diff --numstat` are stable, machine-readable git commands with well-defined output formats. | high |
| Test infrastructure | The hermetic fixture setup (temp bare repos, execa wrapper, cleanup) from H1 is directly extensible for worktree and diff scenarios. | high |
| Design decisions settled | B1 (single GitPort) and B3 (diff returns raw + stats) are already approved by the user. No open design questions. | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| `worktreeAdd` path parameter | Should the caller provide the full absolute path, or should the adapter construct it from a convention like `worktrees/<repo>/<branch>-<ts>`? PRD SS5.1 defines the convention but the port should stay layout-agnostic. | open — spec should decide; recommendation: caller provides absolute path (same pattern as `clone.targetPath`) |
| `diff` base parameter | Should `diff` accept two arbitrary refs, or specifically a `base` + `target` pair with implicit merge-base? The approved B3 decision says raw + stats but not the parameter shape. | open — spec should formalize; recommendation: accept two commit-ish strings, let caller do merge-base separately for composability |
| `worktreeList` scope | Should it list worktrees for a specific repo path (like `git -C <repo> worktree list`) or accept broader filtering? | open — spec should decide; recommendation: single `repoPath` parameter matching existing methods |

## Approval Notes

- User approved design decisions B1 (single GitPort) and B3 (diff = raw + stats) prior to this proposal.
- No material ambiguity remains. All open questions are parameter-shape details that spec will formalize.
- The scope is a direct, well-bounded extension of the E2.F1.H1 deliverable.

## Budget Notes

- Keep this artifact lightweight. Target roughly 200 to 400 words.
- This artifact consolidates the idea before investing in a formal spec.
