# Design: [E2.F2.H3] List repos and branches

## File plan

| File | Action | Purpose |
|---|---|---|
| `src/core/repos/list-branches-errors.ts` | create | RepoNotFoundError, BranchListError |
| `src/core/repos/list-repos.ts` | create | listRepos use case |
| `src/core/repos/list-branches.ts` | create | listBranches use case |
| `src/core/repos/index.ts` | modify | Add barrel exports |
| `src/core/repos/__test__/list-repos.test.ts` | create | Unit tests for listRepos |
| `src/core/repos/__test__/list-branches.test.ts` | create | Unit tests for listBranches |

## Architecture compliance

- All new files are in `src/core/repos/` — no adapter or I/O imports.
- Ports consumed: `ConfigStore.readRepos()`, `GitPort.fetch()`, `GitPort.branches()`.
- Use cases are pure functions with explicit dependency injection (same pattern as registerRepo).
- Errors follow the `Error` suffix convention and live in the repos module.
- Tests use in-memory fakes (same createFakeConfigStore/createFakeGitPort from registerRepo tests).
- Guard compliance: core imports only from `./ports/*` and zod (not used here). No cross-module imports.

## Dependencies

- `ConfigStore` (port, existing) — `readRepos()`
- `GitPort` (port, existing) — `fetch()`, `branches()`
- `BranchRef` (type, existing) — returned as-is
- `RepoRegistry`, `RepoEntry` (types, existing) — from config-schemas

## Error hierarchy

```
RepoNotFoundError (extends Error)
  - message: "Repository not found: <alias>"
  - no cause (expected domain outcome, like GitNoDefaultBranchError)

BranchListError (extends Error)
  - message: context-specific
  - cause: GitError (fetch or branches failure)
```

## Repopath resolution

`entry.localPath ?? ${deps.clonesDir}/${alias}` — same logic as registerRepo but reading from the stored entry.
