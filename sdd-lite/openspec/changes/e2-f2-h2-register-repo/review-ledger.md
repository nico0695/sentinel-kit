# Review Ledger: e2-f2-h2-register-repo

## Review metadata

- target: git diff origin/main..HEAD -- src/
- triage: standard (~420 diff lines)
- lenses: reliability (1 pass)
- reviewed_at: 2026-08-02

## Findings

| # | Severity | File | Line | Category | Summary | Disposition |
|---|----------|------|------|----------|---------|-------------|
| 1 | WARNING | register-repo.ts | 73 | reliability | TOCTOU race between readRepos/writeRepos in concurrent registrations | Accepted: CLI-first single-user scope; re-read-before-write deferred to future concurrent story |
| 2 | WARNING | register-repo.ts | 86 | reliability | No cleanup of cloned directory on partial failure (defaultBranch or writeRepos fails after clone) | Accepted: documented in proposal as known edge case; future --force flag covers recovery |
| 3 | WARNING | register-repo.ts | 55 | correctness | deriveAlias does not validate owner/repo shape for degenerate URLs | Accepted: pathological inputs unlikely; future --alias override covers outliers |
| 4 | SUGGESTION | register-repo-errors.ts | 6 | correctness | cause field shadows native ES2022 Error.cause; could delegate to super() | Info: matches existing GitError/ConfigError codebase pattern; consistency preferred |
| 5 | SUGGESTION | register-repo.ts | 113 | correctness | baseBranch conditional spread defensively correct but always a string at that point | Info: TypeScript control flow does not narrow across try/catch; spread is safe |

## Test coverage notes

- 9/9 tests cover primary happy and error paths
- Uncovered: non-GitError rethrow paths (lines 92, 108), defaultHarness entry construction, writeRepos failure
- Assessment: coverage sufficient for the approved scope; additional tests can be added in follow-up stories

## Verdict

PASS — no BLOCKER or CRITICAL findings. All WARNINGs are accepted trade-offs within the MVP CLI-first scope.
