# S10 — E2.F2.H1 ConfigStore: schemas and persistence

- **Date**: 2026-08-02
- **Branch**: `claude/e2-repos-git-epic-7mehy6`
- **Scope**: `[E2.F2.H1]` ConfigStore driven port, zod schemas, yaml adapter, contract tests
- **sdd-lite changes**: `sdd-lite/openspec/changes/e2-f2-h1-configstore/`

## Objective

Implement the ConfigStore driven port with zod schemas for config.yaml and repos.yaml, a YAML-backed storage adapter, and contract tests following the established GitPort pattern.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S10-D1 | repos module owns ConfigStore (B1) | review owns it, shared ownership | repos is the primary consumer; review imports via repos/index.ts | `claude→user` |
| S10-D2 | Separate typed methods per file (B2) | Single read/write with discriminated union | Stronger type safety, clearer intent, no runtime discrimination needed | `claude→user` |
| S10-D3 | repos.yaml root shape: map keyed by alias | Array with name field | Duplicate keys structurally impossible, O(1) lookup, natural for registry | `claude` |
| S10-D4 | ENOENT returns defaults instead of throwing | Throw ConfigReadError on missing file | Better first-run UX, tool works without manual config creation | `claude` |
| S10-D5 | ConfigValidationError accepts optional cause | No cause on validation errors | Preserves full ZodError diagnostic chain (4R review finding) | `claude` |
| S10-D6 | Contract uses harness.corruptFixture instead of direct node:fs | Inline node:fs imports in contract | Keeps contract adapter-agnostic (4R review finding) | `claude` |

## Deviations

- Zod was not installed by any previous story despite being whitelisted in depcruise config. Added as runtime dependency in S1 (implicit prerequisite for AC-5).
- ENOENT fallback changed from `.parse({})` to `.safeParse({})` after 4R review (defensive against future schema changes adding required fields without defaults).

## Work done

- `feat(repos): add ConfigStore port, schemas and error hierarchy` — S1 core types (config-schemas.ts, config-store.ts, config-store-errors.ts, repos/index.ts re-exports, review/index.ts placeholder)
- `feat(storage): add YAML-backed ConfigStore adapter with contract tests` — S2 adapter (config-store-yaml.ts, ConfigStore.contract.ts, config-store-yaml.test.ts, storage/index.ts barrel)
- `fix(storage): address 4R review findings on ConfigStore` — S4 fixes (cause on ConfigValidationError, safeParse for defaults, corruptFixture harness method, test rename)
- S3 post-executor validation: diff perimeter check (16 files, all expected), hermeticity re-run green
- S4 4R review: reliability + readability lenses, 4 findings fixed, 6 triaged as nits/scope-creep/consistency
- S5 QA: all 9 ACs verified green
- 39 total tests (31 pre-existing + 8 new contract tests)

## Pending and next steps

- Push branch and open PR with `Closes #13`
- Next story: E2.F2.H2 (registerRepo use case, consumes ConfigStore)

## Open questions for the user

—
