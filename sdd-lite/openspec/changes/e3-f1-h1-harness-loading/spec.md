# Spec

## Routing Digest

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- digest_summary: HarnessLoader port + storage adapter to load, validate, and resolve harnesses/skills from filesystem
- scope_digest: domain types (Harness, Skill) + zod schema (skills.yaml) + HarnessLoader port in review/ports + fs adapter in storage + loadHarnesses use case + error hierarchy + unit/contract tests
- acceptance_digest: 9 ACs covering loading, validation, resolution, merge precedence, error detail, and deterministic ordering

## Summary

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- spec_status: approved

## Scope Boundary

### In Scope

- Domain types in `src/core/review/`: `Harness` (loaded harness data), `Skill` (loaded skill content), `ResolvedHarness` (harness + its resolved skill list)
- Zod schema `HarnessSkillsSchema` for `skills.yaml` files (array of skill name strings)
- `HarnessLoader` driven port in `src/core/review/ports/` — reads harness directories and skill files from a source
- Error hierarchy in `src/core/review/ports/`: `HarnessError` base, `HarnessNotFoundError`, `HarnessValidationError` (structured fields), `SkillNotFoundError`
- `loadHarnesses` use case in `src/core/review/` — loads from two `HarnessLoader` sources (factory + user), merges with user-wins precedence, validates all skill references, resolves skills in deterministic order
- `resolveHarnessSkills` pure function — given a harness's skills.yaml list + repo `extraSkills`, returns the merged, deduplicated, deterministically-ordered skill list
- Storage adapter `HarnessLoaderFsAdapter` in `src/adapters/driven/storage/` — reads `harnesses/<type>/` dirs and `skills/*.md` files from a base path
- In-memory fake `FakeHarnessLoader` for core unit tests
- Contract test suite `HarnessLoader.contract.ts` parameterized over the port interface
- Public API exported from `src/core/review/index.ts`

### Out Of Scope

- Prompt assembly from loaded harness+skills (E3.F1.H2)
- `contextMode` option in harness (E3.F1.H3)
- Factory harness file content — pr-review, security, quick (E3.F2.H1–H3)
- Modifications to `ConfigStore` port or `repos` module
- CLI/TUI commands or driving adapters
- Writing/mutating harnesses or skills (read-only port)

### Non-Goals

- Hot-reloading or file-watching for harness changes
- Harness versioning or migration
- Remote harness sources (only local filesystem)
- Harness inheritance or composition between harnesses

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Load a valid harness dir with all 3 files | Returns `Harness` with instructions, outputContract, and skills list | PRD §5.2 layout |
| Load a minimal harness dir (only harness.md) | Returns `Harness` with instructions; outputContract=undefined, skills=[] | Decision B3 |
| Load a harness dir missing harness.md | `HarnessValidationError` with field-level detail | AC-1 |
| Load skills.yaml with a reference to a non-existent skill | `SkillNotFoundError` naming the missing skill and the harness that references it | AC-1 |
| Factory and user dirs both have a harness named "pr-review" | User version wins; factory version is shadowed | Decision B2 |
| Factory has "quick", user has "custom" | Both appear in the merged list | AC-3 |
| Harness references skills ["a", "b"], repo extraSkills is ["b", "c"] | Resolved list is ["a", "b", "c"] — merged, deduplicated, alphabetically ordered | AC-2, deterministic |
| No harness dirs exist in either source | Returns empty harness map (not an error) | Graceful ENOENT |
| skills.yaml contains invalid YAML | `HarnessValidationError` with parse details | AC-1 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Invalid harness reported in detail: missing harness.md, malformed skills.yaml, or invalid skill reference produces a typed error with structured diagnostics (file path, field, reason) | Unit test: load a harness dir without harness.md → `HarnessValidationError` with fields array; load skills.yaml referencing non-existent skill → `SkillNotFoundError` naming the skill | required |
| AC-2 | Skills resolved in deterministic order: given the same harness skills.yaml + repo extraSkills, the output is always identical (merged, deduplicated, sorted alphabetically) | Unit test: call `resolveHarnessSkills` twice with same input → identical output; verify order is alphabetical | required |
| AC-3 | Factory and user harnesses coexist: loading from two sources produces a merged map; user harness overrides factory when names collide | Unit test: fake loaders returning overlapping names → merged result with user version winning | required |
| AC-4 | `HarnessLoader` port is a TypeScript interface in `src/core/review/ports/` with no I/O imports | Port file imports only zod; verified by `depcruise src` (architecture guard 1) | required |
| AC-5 | `HarnessLoaderFsAdapter` reads harness dirs and skill files from a configurable base path | Contract test: create temp dirs with fixture harnesses → adapter loads them correctly | required |
| AC-6 | `FakeHarnessLoader` in-memory implementation supports all port methods for core unit tests | Used by `loadHarnesses` unit tests; backed by plain Maps/objects | required |
| AC-7 | Zod schema `HarnessSkillsSchema` validates `skills.yaml` content: `{ skills: string[] }` with inferred type | Schema rejects non-array, non-string entries; `z.infer` produces the domain type | required |
| AC-8 | `src/core/review/index.ts` exports the public API: types, port, errors, use case | Other core modules can `import { ... } from '../review/index.js'` | required |
| AC-9 | `npm run check` passes with all new files (biome + tsc + depcruise) | Run `npm run check` after implementation | required |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Factory base path resolution | low | The adapter needs to locate the package-bundled `harnesses/` dir. Design stage will decide the mechanism (import.meta.url vs config injection). Not a spec concern — the port is path-agnostic. |
| skills.yaml schema minimalism | low | Starting with `{ skills: string[] }` — may need extension later (ordering hints, metadata). Zod schema is easy to evolve. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Factory base path resolution mechanism | Adapter needs to find bundled harnesses at runtime | design | open — design will resolve |

All three B-level decisions from proposal are approved and recorded in state.yaml.

## Approval Notes

- User indicated automatic advancement — skipping phase validation checkpoint
- Scope is firm and directly follows PRD §5.2 + established ConfigStore patterns
- 9 acceptance criteria, all required, all testable
- Single open question deferred to design (factory path resolution) — does not affect spec safety
- No risks above low severity
