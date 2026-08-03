# Proposal: E2.F3.H1 — Per-review worktree lifecycle

## Change ID
`e2-f3-h1-worktree-lifecycle`

## What

Implement the `workspace` core module with three use cases that manage the full lifecycle of ephemeral git worktrees used during reviews:

1. **`createReviewWorktree`** — Create an isolated worktree at `worktrees/<repo>/<branch>-<ts>` for a single review, returning a `WorktreeRef`-compatible result.
2. **`cleanupWorktree`** — Remove a worktree respecting a configurable cleanup policy (`always | on-success | keep`).
3. **`listOrphanWorktrees`** — Detect worktrees under sentinel's base path that exist on disk but are not tracked by any active review, enabling cleanup on startup.

## Why

The review flow (PRD section 5.1) requires every review to run in an ephemeral worktree — never a checkout in the managed clone — so that parallel reviews on the same repo do not collide and the user's working tree is never touched. This module is the single owner of that guarantee. It sits between repo registration (which provides the clone path) and the run orchestrator (which needs a `WorktreeRef` to hand to the engine). Without it, `runReview` (E4.F1.H1) cannot be implemented.

## Scope boundary

### In scope

- Three use cases in `src/core/workspace/`: `createReviewWorktree`, `cleanupWorktree`, `listOrphanWorktrees`.
- Domain types: `CleanupPolicy` (`always | on-success | keep`), `WorktreeCreationError`, `WorktreeCleanupError`, `OrphanWorktreeInfo`.
- The workspace module's public `index.ts` exporting use cases and types.
- Unit tests with in-memory `GitPort` fakes covering: parallel creation uniqueness, each cleanup policy branch, orphan detection logic.

### Out of scope

- Diff calculation (that is E2.F3.H2).
- Actual `runReview` orchestration (E4.F1.H1 consumes this module).
- Config-driven default cleanup policy (the use case accepts a policy value; where it comes from is the caller's concern).
- Automatic orphan cleanup execution — this story detects and reports orphans; a future story or the run orchestrator decides what to do with that list.
- Changes to the `run` module's `WorktreeRef` type (it already has the right shape; workspace returns a compatible value).

## Affected areas

| Area | Impact |
|---|---|
| `src/core/workspace/` | **Primary** — all new code lives here. Currently a stub with `export {}`. |
| `src/core/workspace/ports/` | New directory if workspace needs its own port declarations. However, workspace reuses `GitPort` from `repos` — no new ports needed. |
| `src/core/repos/index.ts` | **Read-only dependency** — workspace imports `GitPort`, `WorktreeAddRequest`, `WorktreeRemoveRequest`, `WorktreeInfo`, `GitWorktreeError` from the repos public API. |
| `src/core/run/worktree-ref.ts` | **No changes** — workspace returns a `WorktreeRef`-compatible shape (`{ path: string }`). The run module already exports this type. |
| `src/core/workspace/__test__/` | **New** — unit tests with in-memory GitPort fakes. |

## Design considerations

### Worktree path uniqueness

The path pattern `worktrees/<repo>/<branch>-<ts>` needs a timestamp with sufficient resolution to avoid collisions in rapid parallel creation. Millisecond-epoch (`Date.now()`) is likely sufficient but a short random suffix could be added as a safety margin. Decision level: A (technical, reversible).

### GitPort as a cross-module dependency

The workspace module depends on `GitPort` which is owned by `repos`. This follows the architecture: `GitPort` is declared by `repos` (PRD section 4.3) and workspace imports it via `repos/index.ts` (guard 3 compliance). The workspace use cases receive the `GitPort` instance via dependency injection (a `deps` parameter), consistent with how `registerRepo` and `listBranches` work.

### CleanupPolicy as a domain type

The cleanup policy (`always | on-success | keep`) is a workspace-domain concept. It is a simple union type owned by workspace, not a schema from config. The config layer (E2.F2.H1) or the run orchestrator will map their config values to this type before calling `cleanupWorktree`.

### Orphan detection strategy

`listOrphanWorktrees` calls `GitPort.worktreeList()` to get all git-tracked worktrees for a repo, then compares against worktrees under the sentinel base path. A worktree that exists on disk under `worktrees/` but is not associated with an active review is reported as an orphan. Since the workspace module has no concept of "active review" (that is run-domain), orphan detection works purely at the git level: worktrees that git itself reports as prunable, or worktrees whose paths exist under the base directory but that are not in the git worktree list. The exact detection heuristic is a spec-stage decision.

### No new ports

The workspace module does not declare its own driven ports. It reuses `GitPort` from `repos` — the port catalog in PRD section 4.3 explicitly lists `GitPort` as shared between `repos` and `workspace`. This avoids port proliferation and is architecturally correct.

## Initial risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Timestamp collision in parallel worktree creation | Low | Medium — two reviews would target the same path, one fails | Add random suffix or use a counter; test with concurrent creation scenarios. |
| Orphan detection false positives (active worktree flagged as orphan) | Medium | Low — orphans are reported, not auto-deleted in this story | Conservative detection: only flag worktrees that git itself cannot find or that have no associated lock. |
| `GitPort.worktreeAdd` failure leaves partial state | Medium | Medium — directory created but git metadata incomplete | Ensure `cleanupWorktree` handles partial states gracefully; test the error path. |
| Cross-module import violating guard 3 | Low | High — CI fails | Import only from `repos/index.ts`; verify with `npm run check` before PR. |

## Dependencies

- **E2.F1.H2** (merged) — `GitPort` with `worktreeAdd`, `worktreeRemove`, `worktreeList` methods.
- **E0.F1.H2** (merged) — architecture guards to validate the module's imports.

## Acceptance criteria (from backlog)

1. Parallel reviews do not collide.
2. Configurable cleanup policy (`always | on-success | keep`) respected.
3. Orphans detected and reported.
