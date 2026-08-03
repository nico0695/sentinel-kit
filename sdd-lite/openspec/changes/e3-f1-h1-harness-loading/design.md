# Design

## Routing Digest

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- digest_summary: HarnessLoader port in review/ports + fs adapter + loadHarnesses use case + resolveHarnessSkills pure function
- approach_digest: Port with 4 read methods (listHarnesses, loadHarness, listSkills, loadSkill), factory path resolved via DI at composition time, user-wins merge in use case, alphabetical skill ordering
- affected_areas: src/core/review/ (new), src/adapters/driven/storage/ (extend), src/main/ (future wiring)

## Summary

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- design_status: approved

## Design Overview

The design follows the established ConfigStore pattern: a port interface in core defining domain-role methods, a storage adapter implementing it against the filesystem, and a factory function for composition.

**Port** (`HarnessLoader`): four read-only methods — `listHarnesses`, `loadHarness`, `listSkills`, `loadSkill`. Each adapter instance is bound to a single base path. The port knows nothing about factory vs user — that distinction lives in the use case, which receives two loader instances.

**Use case** (`loadHarnesses`): receives `{ factory: HarnessLoader, user: HarnessLoader }`, loads both, merges harness maps (user wins on name collision), validates skill references, returns `Map<string, ResolvedHarness>`. Pure domain logic — no I/O imports.

**Pure function** (`resolveHarnessSkills`): takes a harness's skill name list + repo `extraSkills`, returns merged, deduplicated, alphabetically sorted array. Extracted as a standalone function for testability and reuse by the prompt assembler (E3.F1.H2).

**Factory path resolution**: the adapter takes a plain `basePath: string`. At composition time (`src/main/`), the factory path is derived from `import.meta.url` (ESM standard: `new URL('../harnesses', import.meta.url).pathname` from main/cli.ts resolves to the package root). User path comes from the global config directory. This is pure dependency injection — no magic in core or adapter.

## Affected Areas

| Area | Change Type | Files |
|---|---|---|
| `src/core/review/ports/` | new | `harness-loader.ts` (port interface), `harness-schemas.ts` (zod schemas + domain types), `harness-errors.ts` (error hierarchy) |
| `src/core/review/` | new | `load-harnesses.ts` (use case), `resolve-harness-skills.ts` (pure function), `index.ts` (public API exports) |
| `src/adapters/driven/storage/` | extend | `harness-loader-fs.ts` (new adapter file), `index.ts` (add export) |
| `src/adapters/driven/storage/__test__/` | new | `HarnessLoader.contract.ts` (contract suite), `harness-loader-fs.test.ts` (adapter test binding) |
| `src/core/review/__test__/` | new | `load-harnesses.test.ts` (use case unit tests), `resolve-harness-skills.test.ts` (pure function tests), `fake-harness-loader.ts` (in-memory fake) |

## Interfaces, Data, And State

### Port Interface

```typescript
interface HarnessLoader {
  listHarnesses(): Promise<string[]>;
  loadHarness(type: string): Promise<Harness>;
  listSkills(): Promise<string[]>;
  loadSkill(name: string): Promise<Skill>;
}
```

### Domain Types (zod-inferred)

```typescript
// harness-schemas.ts
const HarnessSkillsSchema = z.object({
  skills: z.array(z.string()),
});
type HarnessSkillsConfig = z.infer<typeof HarnessSkillsSchema>;

// Plain types (no zod — harness.md and output.md are free-form markdown)
interface Harness {
  readonly type: string;
  readonly instructions: string;          // harness.md content
  readonly outputContract?: string;       // output.md content (optional)
  readonly skills: readonly string[];     // parsed skills.yaml → string[]
}

interface Skill {
  readonly name: string;
  readonly content: string;               // skill .md content
}

interface ResolvedHarness {
  readonly harness: Harness;
  readonly skills: readonly Skill[];      // resolved, ordered skill objects
}
```

### Error Hierarchy

```typescript
class HarnessError extends Error { cause?: unknown }
class HarnessNotFoundError extends HarnessError { readonly type: string }
class HarnessValidationError extends HarnessError {
  readonly fields: ReadonlyArray<{ path: string; message: string }>
}
class SkillNotFoundError extends HarnessError {
  readonly skillName: string;
  readonly referencedBy: string;  // harness type that references it
}
```

### Use Case Signature

```typescript
interface LoadHarnessesDeps {
  readonly factory: HarnessLoader;
  readonly user: HarnessLoader;
}

function loadHarnesses(
  deps: LoadHarnessesDeps,
  extraSkills?: readonly string[],
): Promise<Map<string, ResolvedHarness>>
```

### Adapter Factory

```typescript
function createHarnessLoaderAdapter(basePath: string): HarnessLoader
```

Reads `harnesses/<type>/` subdirectories and `skills/*.md` files under `basePath`. Missing base directory = empty results (not an error). Missing `harness.md` inside a harness dir = `HarnessValidationError`. Invalid `skills.yaml` YAML = `HarnessValidationError`. Non-existent skill reference validated at use case level (not adapter level), since skills may come from the other loader source.

### Filesystem Mapping

```
basePath/
  harnesses/
    <type>/
      harness.md      → Harness.instructions
      output.md       → Harness.outputContract (optional)
      skills.yaml     → parsed via HarnessSkillsSchema → Harness.skills
  skills/
    <name>.md         → Skill { name: <name>, content: file }
```

## Alternatives And Trade-Offs

| Alternative | Reason Rejected |
|---|---|
| Single loader with multiple base paths | Adds complexity to the port for a concern that belongs in the use case (merge precedence). Two simple instances are cleaner than one smart instance. |
| Skill validation inside the adapter | Skills may come from either factory or user source. Cross-source validation must happen in the use case after both loaders have been read. |
| `import.meta.url` inside the adapter | Would couple the adapter to its filesystem position. Path injection via factory function keeps it testable and position-independent. |

## Open Technical Questions

None remaining. The factory path resolution mechanism (inject basePath at composition time via `import.meta.url` in main/) is decided as A-level (technical, reversible, aligned with ESM standard).

## Approval Notes

- User indicated automatic advancement — skipping checkpoint
- All open questions from spec are resolved
- No new risks identified
- Design follows established ConfigStore pattern exactly
- A-level decision: factory path via DI + import.meta.url at composition time
