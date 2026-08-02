# Design

## Routing Digest

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- digest_summary: ConfigStore driven port with zod schemas, typed errors, yaml storage adapter, and contract tests
- affected_areas_digest: core/repos/ports (3 new files), adapters/driven/storage (1 new file + test), core/repos/index.ts (re-exports)
- interfaces_digest: ConfigStore port (4 methods), GlobalConfigSchema + RepoEntrySchema + RepoRegistrySchema (zod), ConfigError hierarchy (4 classes)

## Summary

- change_name: e2-f2-h1-configstore
- objective: new-feature
- route: continue-lite
- design_status: draft

## Design Overview

The ConfigStore port follows the established GitPort pattern: interface in `core/repos/ports/`, error hierarchy alongside it, zod schemas for validation, and a storage adapter in `adapters/driven/storage/`. Domain types are inferred from zod schemas via `z.infer` -- no manual duplication. The adapter uses `yaml` (eemeli) for parsing/serialization and `node:fs/promises` for I/O, translating all failures into port-level errors via the `wrapAs` pattern from `git-cli.ts`.

**Resolved decision (A-level)**: repos.yaml root shape is a **map keyed by alias** (`Record<string, RepoEntry>`). Rationale: duplicate keys are structurally impossible, lookup by name is O(1), and the shape is natural for a registry. The zod schema uses `z.record(z.string(), RepoEntrySchema)`.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/core/repos/ports/config-schemas.ts` | New file: zod schemas + inferred types | Low |
| `src/core/repos/ports/config-store.ts` | New file: ConfigStore interface | Low |
| `src/core/repos/ports/config-store-errors.ts` | New file: ConfigError hierarchy | Low |
| `src/core/repos/index.ts` | Add re-exports for schemas, port, errors | Low |
| `src/adapters/driven/storage/config-store-yaml.ts` | New file: yaml + fs adapter factory | Medium — I/O error translation |
| `src/adapters/driven/storage/__test__/ConfigStore.contract.ts` | New file: shared contract suite | Low |
| `src/adapters/driven/storage/__test__/config-store-yaml.test.ts` | New file: runs contract with real adapter | Low |
| `package.json` | Add `yaml` runtime dependency | Low |

## Interfaces, Data, And State

### Zod schemas (`config-schemas.ts`)

```typescript
import { z } from "zod";

export const DiffLimitsSchema = z.object({
  maxLines: z.number(),
  maxTokens: z.number(),
});

export const GlobalConfigSchema = z.object({
  defaultEngine: z.enum(["claude-code", "opencode"]).default("claude-code"),
  defaultBaseBranch: z.string().default("main"),
  diffLimits: DiffLimitsSchema.optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const RepoEntrySchema = z.object({
  url: z.string(),
  localPath: z.string().optional(),
  baseBranch: z.string().optional(),
  defaultHarness: z.string().optional(),
  defaultEngine: z.string().optional(),
  extraSkills: z.array(z.string()).optional(),
  validations: z.array(z.string()).optional(),
});

export type RepoEntry = z.infer<typeof RepoEntrySchema>;

export const RepoRegistrySchema = z.record(z.string(), RepoEntrySchema);

export type RepoRegistry = z.infer<typeof RepoRegistrySchema>;
```

### ConfigStore port (`config-store.ts`)

```typescript
import type { GlobalConfig, RepoRegistry } from "./config-schemas.js";

export interface ConfigStore {
  readConfig(): Promise<GlobalConfig>;
  writeConfig(config: GlobalConfig): Promise<void>;
  readRepos(): Promise<RepoRegistry>;
  writeRepos(repos: RepoRegistry): Promise<void>;
}
```

### Error hierarchy (`config-store-errors.ts`)

```typescript
export interface ConfigErrorOptions {
  readonly cause?: unknown;
}

export class ConfigError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message);
    this.name = "ConfigError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class ConfigValidationError extends ConfigError {
  readonly fields: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  constructor(
    message: string,
    fields: ReadonlyArray<{ readonly path: string; readonly message: string }>,
  ) {
    super(message);
    this.name = "ConfigValidationError";
    this.fields = fields;
  }
}

export class ConfigReadError extends ConfigError {
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message, options);
    this.name = "ConfigReadError";
  }
}

export class ConfigWriteError extends ConfigError {
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message, options);
    this.name = "ConfigWriteError";
  }
}
```

### Storage adapter (`config-store-yaml.ts`)

Factory: `createConfigStoreAdapter(basePath: string): ConfigStore`. The `basePath` is the sentinel config directory (injected by composition root). Files: `<basePath>/config.yaml` and `<basePath>/repos.yaml`.

- **Read**: `readFile` -> `yaml.parse` -> `schema.safeParse`. ENOENT returns defaults (empty object for `GlobalConfigSchema.parse({})`, empty `{}` for repos). Parse/validation failures become `ConfigReadError` or `ConfigValidationError`. Other I/O errors become `ConfigReadError` with cause.
- **Write**: `schema.parse(data)` -> `yaml.stringify` -> `writeFile`. Validation failures become `ConfigValidationError`. I/O errors become `ConfigWriteError` with cause.
- **Error translation**: reuses the `wrapAs` pattern from `git-cli.ts`, adapted for `ConfigErrorOptions`. Zod errors are mapped to the `fields` array via `error.issues.map(i => ({ path: i.path.join("."), message: i.message }))`.

### Contract test harness

```typescript
export interface ConfigFixture {
  readonly basePath: string; // temp directory for config files
}

export interface ConfigStoreContractHarness {
  readonly build: (basePath: string) => ConfigStore;
  readonly setupFixture: () => Promise<ConfigFixture>;
  readonly teardownFixture: (fixture: ConfigFixture) => Promise<void>;
}
```

Tests covering each AC:

| Test | AC |
|---|---|
| Invalid engine value produces ConfigValidationError with field path | AC-1 |
| writeConfig then readConfig returns equivalent data | AC-2 |
| writeRepos then readRepos returns equivalent data | AC-2 |
| Missing config.yaml returns GlobalConfig with defaults | AC-4 |
| Missing repos.yaml returns empty registry `{}` | AC-4 |
| I/O read failure produces ConfigReadError with cause | AC-6 |
| I/O write failure produces ConfigWriteError with cause | AC-6 |
| All errors extend ConfigError (instanceof check) | AC-1, AC-6 |

### Re-exports (`core/repos/index.ts` additions)

```typescript
export {
  DiffLimitsSchema,
  GlobalConfigSchema,
  RepoEntrySchema,
  RepoRegistrySchema,
  type GlobalConfig,
  type RepoEntry,
  type RepoRegistry,
} from "./ports/config-schemas.js";
export type { ConfigStore } from "./ports/config-store.js";
export {
  ConfigError,
  type ConfigErrorOptions,
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
} from "./ports/config-store-errors.js";
```

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| repos.yaml as array with name field | Rejected | Map keyed by alias prevents duplicates structurally, O(1) lookup, more natural for a registry |
| Single `read`/`write` method with discriminated union | Rejected (B2) | Separate typed methods per file give stronger type safety and clearer intent |
| Manual type interfaces alongside schemas | Rejected | `z.infer` eliminates duplication (AC-3) |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | All design questions resolved | - | - |

## Approval Notes

- repos.yaml root shape resolved as A-level: map keyed by alias (technical, reversible, no public API impact).
- All patterns follow existing GitPort conventions (error hierarchy with cause, factory adapter, contract harness).
- Port file imports only zod; adapter imports yaml + node:fs (architecture guard compliant).
- ConfigValidationError carries structured `fields` array instead of raw zod error, keeping the port I/O-library-agnostic.

## Budget Notes

- Target roughly 400 to 600 words plus tables for the full artifact when possible.
