# Plan: [E2.F2.H3] List repos and branches

## Stages

### Stage 1: Error types

Create `src/core/repos/list-branches-errors.ts` with:
- `RepoNotFoundError` (no cause — expected domain outcome)
- `BranchListError` (with cause — wraps GitError)

Verify: `npm run check` passes (typecheck + lint).

### Stage 2: Use cases

Create:
- `src/core/repos/list-repos.ts` — listRepos function + types
- `src/core/repos/list-branches.ts` — listBranches function + types

Verify: `npm run check` passes.

### Stage 3: Barrel update

Update `src/core/repos/index.ts` — add exports for new use cases, types, and errors.

Verify: `npm run check` passes.

### Stage 4: Unit tests

Create:
- `src/core/repos/__test__/list-repos.test.ts`
- `src/core/repos/__test__/list-branches.test.ts`

Test cases for listRepos:
1. Returns empty registry when no repos registered
2. Returns registry with registered repos

Test cases for listBranches:
1. Fetches and returns branches for registered repo
2. Uses localPath when available
3. Throws RepoNotFoundError for unknown alias
4. Wraps fetch GitFetchError in BranchListError
5. Wraps branches GitCommandError in BranchListError
6. Calls fetch before branches (order verification)

Verify: `npm run check` + `npm test` pass.
