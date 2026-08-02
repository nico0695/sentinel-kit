# Spec

## Routing Digest

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- digest_summary: ConfigStore driven port with zod schemas for config.yaml/repos.yaml, typed validation errors, storage adapter (yaml + node:fs), and contract tests.
- scope_digest: Port interface in core/repos/ports, zod schemas with inferred types, ConfigValidationError, storage adapter, contract test suite
- acceptance_digest: 9 ACs covering validation errors, roundtrip, inferred types, missing file, no I/O in port, adapter error translation, re-exports, yaml dependency, contract tests

## Summary

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- spec_status: draft

## Scope Boundary

### In Scope

- `ConfigStore` port interface in `src/core/repos/ports/config-store.ts` with four typed methods: `readConfig`, `writeConfig`, `readRepos`, `writeRepos` (decision B2)
- Zod schemas in `src/core/repos/ports/config-schemas.ts` for global config and repo registry
- Domain types inferred via `z.infer` — no manual type duplication
- `ConfigValidationError` in `src/core/repos/ports/config-store-errors.ts` carrying field path + human-readable reason
- Storage adapter in `src/adapters/driven/storage/` implementing ConfigStore with `yaml` (eemeli) + `node:fs`
- Contract test suite with shared harness pattern (same approach as GitPort)
- Re-export all new types from `src/core/repos/index.ts`
- Update `src/core/review/index.ts` placeholder comment to reference `repos/index.ts` for ConfigStore types (decision B1)
- Install `yaml` (eemeli) as runtime dependency

### Out Of Scope

- Harness/skills file reading (E3.F2.x)
- RunStore persistence (E5.F2.x)
- `registerRepo` use case logic (E2.F2.H2, consumes ConfigStore)
- Config migration or versioning
- CLI commands for config editing
- File watching or hot reload

### Non-Goals

- Generic key-value store abstraction
- Environment variable overrides for config fields
- Encryption of config values

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Valid `config.yaml` read | Returns parsed `GlobalConfig` with all fields validated | PRD §6.2: cascading engine resolution starts from global default |
| Valid `repos.yaml` read | Returns parsed `RepoRegistry` with per-repo overrides validated | PRD §5.2: repos.yaml carries extra skills, validations, base branch |
| Invalid field value (e.g. unknown engine) | `ConfigValidationError` thrown with field path (`defaultEngine`) and reason (`must be claude-code or opencode`) | AC-1 |
| Missing optional fields | Defaults applied: `defaultBaseBranch` = `"main"`, `diffLimits` = undefined | PRD §5.1: base default is remote's default branch |
| Missing config file | Graceful handling: return defaults for config.yaml, empty registry for repos.yaml, or a typed error — adapter decides | AC-4 |
| Write then read (roundtrip) | Written data equals read data — no field loss, no reordering artifacts | AC-2 |
| Adapter I/O failure (permission denied, corrupt file) | Raw error translated to `ConfigReadError` or `ConfigWriteError` with cause preserved | AC-6, follows GitPort error pattern |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Invalid config produces `ConfigValidationError` with field path and human-readable reason | Unit test: feed schema a bad engine value, assert error includes field name and constraint | must |
| AC-2 | Lossless read/write roundtrip: `writeConfig(c); readConfig()` returns equivalent of `c` | Contract test: write a full config, read back, deep-equal | must |
| AC-3 | All domain types inferred from zod schemas via `z.infer` — no manual interface duplication | Code review: grep for manual type definitions that duplicate schema fields | must |
| AC-4 | Missing config file returns sensible defaults (config.yaml) or empty registry (repos.yaml) without crashing | Contract test: read from empty directory, assert no throw and correct defaults | must |
| AC-5 | `ConfigStore` port and schemas import only `zod` — no `node:fs`, `yaml`, or other I/O libraries | `depcruise src` passes; grep port files for banned imports | must |
| AC-6 | Storage adapter translates all I/O errors (ENOENT, EACCES, parse failure) into port-level errors (`ConfigReadError`, `ConfigWriteError`) with `cause` preserved | Contract test + adapter unit test: mock fs to throw, assert port error type and cause | must |
| AC-7 | All new types and errors re-exported from `src/core/repos/index.ts` | Import from `core/repos` in a test, assert types resolve | must |
| AC-8 | `yaml` (eemeli) installed as runtime dependency in `package.json` | `npm ls yaml` succeeds | must |
| AC-9 | Contract tests prove roundtrip, validation error, and missing-file behavior using shared harness | Test file exists, passes with both real adapter and in-memory fake | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Schema evolution | Medium | Adding fields later requires migration or defaults for missing keys. Mitigated: zod `.default()` and `.optional()` handle forward-compatible reads. No versioning in MVP. |
| YAML comment preservation | Low | `yaml` (eemeli) preserves comments by default when using its Document API, but our roundtrip uses parse/stringify. User comments in config may be lost on write. Acceptable for MVP; document in user docs. |
| Config file location | Low | This story defines schemas and the port, not where the config directory lives. The adapter receives the base path via constructor injection; the composition root decides the path. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| B1: repos module owns ConfigStore | Determines file placement and import paths | spec | **Decided**: `repos` owns port; `review` imports via `repos/index.ts` |
| B2: Separate typed methods per file | Affects port surface and type safety | spec | **Decided**: `readConfig`/`writeConfig`, `readRepos`/`writeRepos` |
| A: Missing config.yaml returns defaults | Affects first-run UX — tool works without manual config creation | design | **Decided**: return `GlobalConfig` with defaults (A-level, reversible) |
| A: repos.yaml schema shape | Map keyed by alias vs. array with mandatory name field | design | Deferred to design — both work; map avoids duplicate keys naturally |

## Zod Schema Outline

**GlobalConfig** (`config.yaml`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `defaultEngine` | `z.enum(["claude-code", "opencode"])` | `"claude-code"` | PRD §6.2 cascading resolution base |
| `defaultBaseBranch` | `z.string()` | `"main"` | PRD §5.1 diff base default |
| `diffLimits` | `z.object({ maxLines: z.number(), maxTokens: z.number() }).optional()` | undefined | PRD §5.1 large diff warning threshold |

**RepoEntry** (each entry in `repos.yaml`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `url` | `z.string()` | (required) | Clone URL |
| `localPath` | `z.string().optional()` | undefined | Existing local repo path |
| `baseBranch` | `z.string().optional()` | undefined | Per-repo override of defaultBaseBranch |
| `defaultHarness` | `z.string().optional()` | undefined | Default review type for this repo |
| `defaultEngine` | `z.string().optional()` | undefined | Per-repo engine override (PRD §6.2) |
| `extraSkills` | `z.array(z.string()).optional()` | undefined | Additional skill files for this repo |
| `validations` | `z.array(z.string()).optional()` | undefined | Scripts to run before review (PRD §3.1-D) |

**RepoRegistry** (`repos.yaml` root): shape deferred to design (map vs. array).

## Port Interface Sketch

```typescript
interface ConfigStore {
  readConfig(): Promise<GlobalConfig>;
  writeConfig(config: GlobalConfig): Promise<void>;
  readRepos(): Promise<RepoRegistry>;
  writeRepos(repos: RepoRegistry): Promise<void>;
}
```

## Error Family

Following the `GitError` hierarchy pattern:

- `ConfigError` (base) — never thrown directly
- `ConfigValidationError` extends `ConfigError` — carries `readonly fields: ReadonlyArray<{ path: string; message: string }>`
- `ConfigReadError` extends `ConfigError` — adapter I/O read failure (cause preserved)
- `ConfigWriteError` extends `ConfigError` — adapter I/O write failure (cause preserved)

## Approval Notes

- All B-level decisions resolved in proposal review. Schema outline and error family are A-level (technical, reversible).
- Port interface mirrors the established GitPort pattern for consistency.
- repos.yaml root shape (map vs. array) deferred to design — does not affect the port interface.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
