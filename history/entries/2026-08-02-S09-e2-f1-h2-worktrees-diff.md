# S09 — [E2.F1.H2] Worktrees, merge-base and diff

- **Date**: 2026-08-02
- **Branch**: `claude/e2-repos-git-epic-7mehy6`
- **Scope**: `[E2.F1.H2]`
- **sdd-lite changes**: `sdd-lite/openspec/changes/e2-f1-h2-worktrees-diff/`

## Objective

Extend GitPort with five new methods (worktreeAdd, worktreeRemove, worktreeList, mergeBase, diff), their typed error subclasses, and adapter implementation — completing the git primitives needed by the review flow's worktree lifecycle and PR-semantics diff.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S09-D1 | Extend existing GitPort (single interface) | Separate WorktreePort / DiffPort | PRD SS4.3 defines one GitPort; user pre-approved (B1) | `claude->user` |
| S09-D2 | diff returns `{ raw, stats }` — unified + numstat | Raw only; stats only; combined format | Need raw for prompt and stats for size policy; user pre-approved (B3) | `claude->user` |
| S09-D3 | worktreeAdd caller provides absolute path; port rejects relative | Port constructs path from convention | Layout convention belongs in workspace module (dec-004 pattern) | `claude` |
| S09-D4 | diff takes two commit-ish; caller calls mergeBase separately | Implicit merge-base inside diff | Composability — both methods independently testable | `claude` |
| S09-D5 | worktreeList takes single repoPath, returns all worktrees | Filter by branch, paginate | Matches branches(repoPath) pattern; worktree count is small | `claude` |
| S09-D6 | Softened WorktreeRemoveRequest docstring (absolute path recommendation vs requirement) | Add isAbsolute validation like worktreeAdd | Review flow always passes absolute paths from worktreeList; git resolves relative paths fine | `claude` |
| S09-D7 | Dropped subclass count from GitError docstring | Update count to "seven" | Count will go stale again with future error subclasses | `claude` |
| S09-D8 | Deferred binary file distinction in FileStats (0/0 vs explicit flag) | Add `binary: boolean` to FileStats | Scope expansion beyond H2's ACs; address if needed in future story | `claude` |
| S09-D9 | Accepted TOCTOU risk in diff's two-invocation approach | Single combined git invocation | In review flow, `from` is always an immutable SHA from mergeBase; practical risk negligible | `claude` |

## Deviations

- Plan S1 mentioned stub adapter methods; implemented full methods in S1 instead since the pattern was established and stubs would have broken tsc (S2 tests call the real methods). No impact — just earlier completion.

## Work done

- `442b07b` feat(repos): extend GitPort with worktree/mergeBase/diff types (E2.F1.H2)
  - 5 new request/domain types in git-port.ts, 3 error subclasses in git-port-errors.ts
  - Full adapter implementation in git-cli.ts (worktreeAdd, worktreeRemove, worktreeList, mergeBase, diff)
  - Parsers: parseWorktreeList (--porcelain), parseDiffNumstat (--numstat)
  - Re-exports in core/repos/index.ts
- `369a762` test(git): worktree/mergeBase/diff contract tests (E2.F1.H2)
  - 14 new contract tests across 6 describe blocks
  - Extended GitFixture with divergent-branch setup (feat-diverge, forkPointSha, featureBranchChangedFiles)
  - PR-semantics test proves merge-base + diff excludes base-only changes
- `66cd38b` fix(repos): stale subclass count in GitError docstring, soften worktreeRemove doc
  - 4R review fix: dropped hardcoded count, softened WorktreeRemoveRequest doc
- sdd-lite artifacts: proposal, spec, design, plan, state.yaml
- Validation: 31/31 tests pass, npm run check clean (0 depcruise violations), all 11 ACs verified

## Pending and next steps

- Push branch and open PR `[E2.F1.H2] Worktrees & diff` with `Closes #12`
- Next story: #13 (E2.F2.H1 — ConfigStore schemas and persistence)

## Open questions for the user

—
