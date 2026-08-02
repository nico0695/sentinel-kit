# Proposal

## Routing Digest

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- digest_summary: ConfigStore driven port (zod schemas for config.yaml/repos.yaml) + storage adapter (fs + yaml). Validated, typed configuration from disk.
- feasibility_signal: high — zod and yaml are pre-decided (setup-tecnico §3), port/adapter pattern established by GitPort (E2.F1.H1), adapter placeholder exists.
- scope_sketch_digest: Port interface + zod schemas in core, storage adapter with fs+yaml, contract tests with in-memory fake, validation error messages

## Summary

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: false

## Problem And Desired Outcome

The product needs validated, typed configuration from disk — global settings (`config.yaml`) and per-repo registration (`repos.yaml`). Currently no configuration layer exists; downstream stories (E2.F2.H2 registerRepo, E4 engine resolution, E3 harness loading) all depend on ConfigStore to read/write these files with zod-validated schemas and user-readable error messages.

Desired outcome: a `ConfigStore` driven port in core with typed read/write methods, zod schemas producing inferred TypeScript types, a `storage/` adapter using `yaml` (eemeli) + `node:fs`, and contract tests proving lossless roundtrip and clear validation errors.

## Initial Scope Sketch

### Likely In Scope

- `ConfigStore` port interface in `src/core/repos/ports/` with typed methods: `readConfig`, `writeConfig`, `readRepos`, `writeRepos`
- Zod schemas for `config.yaml` (global defaults: default engine, base branch, diff limits) and `repos.yaml` (array/map of registered repos with per-repo overrides)
- Domain types inferred from zod schemas (no manual duplication)
- Typed validation errors with field path + reason (user-readable)
- `storage/` adapter: `yaml` (eemeli) for parsing/serializing, `node:fs` for disk I/O
- Contract test suite (shared harness pattern): lossless roundtrip, invalid config error reporting, missing file handling
- Install `yaml` (eemeli) as runtime dependency
- Re-export all new types from `src/core/repos/index.ts`

### Likely Out Of Scope

- Harness/skills file reading (E3.F2.x)
- RunStore persistence (E5.F2.x)
- registerRepo use case logic (E2.F2.H2 — consumes ConfigStore)
- Config migration / versioning
- CLI commands for config editing

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Port/adapter pattern | Fully established by GitPort (E2.F1.H1/H2) — same shape applies | high |
| zod in core | Whitelisted in depcruise rules (guard 2 `core-no-io-libs`) | high |
| yaml library | `yaml` (eemeli) pre-decided in setup-tecnico §3, not yet installed | high |
| Schema shape | PRD §5.2 defines config.yaml and repos.yaml structure at high level | high |
| Contract test pattern | Established by GitPort.contract.ts — reusable for ConfigStore | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| B1: Which core module owns ConfigStore? | PRD §4.3 says "repos / review". The review/index.ts placeholder claims it. But repos is the primary consumer (repo registration, base branch). | **Pending** — recommendation: `repos` owns it; `review` imports via `repos/index.ts` |
| B2: Separate methods per file vs single generic read/write? | Affects port surface area and type safety | **Pending** — recommendation: separate typed methods (`readConfig`/`writeConfig`, `readRepos`/`writeRepos`) for maximum type inference |
| A: Config file schema fields | PRD §5.2 gives high-level fields; exact zod shapes need formalization | Deferred to spec — straightforward extraction from PRD |

## Approval Notes

- Both B-level questions (B1, B2) carry recommendations aligned with existing patterns. User approval needed before spec.
- All library choices are pre-decided (zod whitelisted, yaml pre-approved in setup-tecnico).
- No blocking unknowns — pattern is proven, placeholder files exist.

## Budget Notes

- Target roughly 200 to 400 words plus tables when possible.
