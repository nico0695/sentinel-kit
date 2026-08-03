# S12 — [E2.F2.H3] List repos and branches

- **Date**: 2026-08-02
- **Branch**: `claude/e2-list-repos-branches-v5bbhe`
- **Scope**: [E2.F2.H3]
- **sdd-lite changes**: `sdd-lite/openspec/changes/e2-f2-h3-list-repos-branches/`

## Objective

Implement `listRepos` and `listBranches` use cases in `core/repos`, consuming existing ConfigStore and GitPort ports. Story depends on registerRepo (E2.F2.H2, merged).

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S12-D1 | listBranches returns all BranchRef (local + remote) | Filter to remote-only | BranchRef already tags `kind`; caller filters as needed. More flexible. | `claude` |
| S12-D2 | listRepos returns RepoRegistry directly | Return array of {alias, entry} | Registry is already the domain model (Record<string, RepoEntry>). No transformation needed. | `claude` |
| S12-D3 | RepoNotFoundError + BranchListError in list-branches-errors.ts | Separate repo-errors.ts for shared errors | YAGNI — only listBranches uses RepoNotFoundError now. Extract when a second consumer appears. | `claude` |
| S12-D4 | Isolated test fakes per test file | Shared fake factory across test files | Test independence — no shared mutable state between test suites. | `claude` |

## Deviations

—

## Work done

- Created `src/core/repos/list-branches-errors.ts` (RepoNotFoundError, BranchListError)
- Created `src/core/repos/list-repos.ts` (listRepos use case)
- Created `src/core/repos/list-branches.ts` (listBranches use case)
- Updated `src/core/repos/index.ts` (barrel exports)
- Created `src/core/repos/__test__/list-repos.test.ts` (2 tests)
- Created `src/core/repos/__test__/list-branches.test.ts` (6 tests)
- sdd-lite artifacts: proposal, spec, design, plan, review-ledger, qa-report
- Quality gates: npm run check (0 violations), npm test (56/56 pass)
- 4R code review: 0 BLOCKER/CRITICAL/WARNING, 1 SUGGESTION (accepted-deferred)
- QA review: PASS — 2/2 ACs verified

## Pending and next steps

- PR to be opened with `Closes #15`
- Remaining E2 stories: #17 [E2.F3.H1] Per-review worktree lifecycle, #18 [E2.F3.H2] Diff with size policy

## Open questions for the user

—
