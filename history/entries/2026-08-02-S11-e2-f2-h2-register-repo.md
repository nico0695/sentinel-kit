# S11 — Story [E2.F2.H2]: registerRepo use case

- **Date**: 2026-08-02
- **Branch**: `claude/e2-f2-h2-register-repo-74kpy2`
- **Scope**: [E2.F2.H2] (issue #14)
- **sdd-lite changes**: [`e2-f2-h2-register-repo`](../../sdd-lite/openspec/changes/e2-f2-h2-register-repo/)

## Objective

Implement the `registerRepo` use case — the product's entry door. Supports registration by URL (managed clone) and by existing local path, with re-registration detection.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S11-D1 (B1) | Alias format: `owner/repo` extracted from URL | Repo name only; slugified full path | Human-readable, collision-resistant, matches GitHub CLI convention | `claude→user` |
| S11-D2 (B2) | Managed clones in `<configDir>/clones/` | XDG `~/.local/share/sentinel/clones/` | Keeps all sentinel data together; PRD says "clone managed in the tool's directory"; core sees only a string | `claude→user` |
| S11-D3 (A1) | Use case returns `RegisterRepoResult` (not void) | Return void, caller re-reads registry | Callers need alias + entry + alreadyRegistered for UI feedback | `claude` |
| S11-D4 (A2) | `url` always required in `RegisterRepoRequest` | Make url optional for local-path registrations | Aligns with `RepoEntrySchema` where url is non-optional | `claude` |
| S11-D5 (A) | String concatenation `${clonesDir}/${alias}` instead of `node:path.join()` | Import `node:path` in core | Avoids I/O library import in core (architecture guard 2 compliance) | `claude` |
| S11-D6 (A) | Error classes extend `Error` directly, not `GitError`/`ConfigError` | Extend port error hierarchies | Use-case-level errors are independent of port hierarchies | `claude` |

## Deviations

None. Implementation matches PRD, backlog spec, and approved design.

## Work done

- `95ea9a4` chore: init sdd-lite change for [E2.F2.H2] register-repo
- `b477d01` chore(sddl): add proposal and spec for e2-f2-h2-register-repo
- `4794be9` chore(sddl): add spec, design, and plan for e2-f2-h2-register-repo
- `610938a` feat(repos): add registerRepo use case with unit tests
- `47135c0` chore(sddl): add review ledger and QA report for e2-f2-h2-register-repo
- sdd-lite flow completed: proposal → spec → design → plan → executor → 4R review → QA (all stages pass)
- 4R code review: 0 BLOCKER, 0 CRITICAL, 3 WARNING (accepted for MVP scope), 2 SUGGESTION (info)
- QA final: 7/7 ACs verified, 48/48 tests pass, `npm run check` clean
- Files created: `register-repo-errors.ts`, `register-repo.ts`, `__test__/register-repo.test.ts`
- Files modified: `index.ts` (re-exports)

## Pending and next steps

- PR to be opened with `Closes #14`
- Next story: [E2.F2.H3] List repos and branches (issue #15, depends on this story)

## Open questions for the user

—
