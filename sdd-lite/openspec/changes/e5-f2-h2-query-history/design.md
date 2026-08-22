# Design

## Routing Digest

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- digest_summary: 5 new files, 6 modified. Core gains `RunSummary`/`RunStatus`, `list`/`get` on the `RunStore` port, `RunMetadataSchema` (zod, with compile-time drift guards), two errors (`RunNotFoundError`, `RunCorruptedError`, plus a new `InvalidRunQueryError` for AC-13), and two thin use cases. The adapter gains a pure entry classifier + inverse-timestamp parser in `run-layout.ts` and the `list()`/`get()` flows in `run-store-fs.ts`. Tests: contract suite thickens (portable round-trip assertions), fs test covers everything that needs planting broken state, core `__test__` covers use-case delegation, `run-layout.test.ts` covers the pure functions.
- decisions_digest: D-1 metadata schema mirrors the persisted document with `version: z.literal(1)` and unknown-key strip (additive-forward-compatible); D-2 drift guards via `satisfies` + `Expect<Exclude<...>>` never-check; D-3 new `InvalidRunQueryError` rather than overloading `InvalidRunRecordError`; D-4 `RunPersistenceError` broadened to cover raw fs failures on reads too (no fourth translation class); D-5 id's ts-format check lives in the adapter via `parseRunTimestamp` (core schema checks segment-safety only); D-6 pure `classifyRunDirEntry` concentrates D9's three-way rule in one testable function.

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- design_status: complete, 0 blocking open questions

## Design Overview

Everything hard sits in two places, both chosen to be directly unit-testable:

1. **Core, pure declarations + one schema.** `RunMetadataSchema` validates the *persisted document* `serializeRunMetadata` writes (NOT `RunRecord`): `version: z.literal(1)`, `repo`, ISO `startedAt` (informational only — D8 sources epoch from the dir name), `durationMs`, `harness`, `baseRef`, `targetRef`, `state`, optional `engine`/`verdict`/`diff` (warnings optional)/`usage`/`failure`. Literal lists for `state`/`verdict`/`failure.stage` are declared as `as const` arrays with a two-direction compile-time drift guard, because AC-15 forbids touching `src/core/run`:

   ```ts
   const TERMINAL_STATES = ["ok", "ambiguous", "engine-error", "timeout", "validation-failed"] as const satisfies readonly TerminalState[];
   type Expect<T extends never> = T;                                   // helper
   type _AllStatesCovered = Expect<Exclude<TerminalState, (typeof TERMINAL_STATES)[number]>>;
   ```

   `satisfies` rejects a rogue value; the `Exclude`-to-`never` line errors if `run`'s union ever grows a member missing here. Same pattern for `Verdict` and `RunStage`. Unknown keys are stripped, not rejected (D-1): additive fields under `version: 1` stay readable; breaking changes must bump `version`, which `z.literal(1)` turns into `corrupt`.

2. **Adapter, one pure classifier.** `classifyRunDirEntry(name)` in `run-layout.ts` returns `{ kind: "final", id, epochMs } | { kind: "partial", id, epochMs } | { kind: "other" }`, built on a new `parseRunTimestamp(name): number | null` (regex `^\d{8}T\d{6}\d{3}Z$` → ISO reconstruction → `Date.parse`; verified round-trip exact with node during spec rev 2). D9's whole three-way rule and D8's timestamp sourcing live here, testable without a filesystem.

**`list()` flow**: validate `repoName` (segment rules, `InvalidRunQueryError`) → `readdir(repoDir, { withFileTypes: true })`, `ENOENT` → `[]` (AC-3) → classify each directory entry (non-dirs → `other`) → `partial` → minimal summary; `final` → read+parse+validate `metadata.json`, failure → `corrupt` minimal summary, success → `ok` full summary → dedupe by `id`, final wins (AC-4) → sort ascending by `epochMs` → return. Any raw fs error outside the classified cases → `RunPersistenceError`.

**`get()` flow**: validate `repoName`+`id` segments (`InvalidRunQueryError`) → `parseRunTimestamp(id) === null` → `RunNotFoundError` pre-fs (D-5) → read `metadata.json` at `join(repoDir, id)`: dir missing → `.partial-<id>` exists ? `RunCorruptedError` : `RunNotFoundError`; metadata invalid → `RunCorruptedError` → read bodies (`result.md`, `prompt.md`: `ENOENT` → omit; `validations/`: missing → omit, else readdir-sort-read) → compose `RunRecord` (`repoName` from input, `startedAtEpochMs` from id, rest from metadata, `diff.warnings` default `[]`). Raw failures → `RunPersistenceError` (D-4, its doc comment broadened from "staging or rename" to "any raw fs failure inside the store").

Use cases stay `listRepos`-thin: `listRuns({ repoName }, { store })` and `getRun({ repoName, id }, { store })` delegate entirely; all validation lives behind the port so every future `RunStore` is equally bound (same reasoning as `[E5.F2.H1]`'s D-1).

## Affected Areas

| File | Status | Content |
|---|---|---|
| `src/core/history/ports/run-store.ts` | modified | `RunStatus`, `RunSummary`; `list`/`get` added to `RunStore` |
| `src/core/history/ports/run-metadata-schemas.ts` | new | `RunMetadataSchema`, literal arrays + drift guards, `RunMetadata` inferred type |
| `src/core/history/ports/run-store-errors.ts` | modified | `RunNotFoundError`, `RunCorruptedError`, `InvalidRunQueryError`; `RunPersistenceError` doc broadened |
| `src/core/history/ports/run-store-schemas.ts` | modified | repoName rules extracted to a shared chain; `RunQueryFieldsSchema` (repoName + segment-safe id) |
| `src/core/history/list-runs.ts` | new | `listRuns` use case |
| `src/core/history/get-run.ts` | new | `getRun` use case |
| `src/core/history/index.ts` | modified | barrel: use cases, new types, schema, errors |
| `src/adapters/driven/storage/run-layout.ts` | modified | `parseRunTimestamp`, `classifyRunDirEntry` (+ exported ts regex if useful) |
| `src/adapters/driven/storage/run-store-fs.ts` | modified | `list()`/`get()` implementation |
| `src/core/history/__test__/list-runs.test.ts` | new | delegation with in-memory fake store |
| `src/core/history/__test__/get-run.test.ts` | new | delegation with in-memory fake store |
| `src/adapters/driven/storage/__test__/run-layout.test.ts` | modified | parser + classifier units |
| `src/adapters/driven/storage/__test__/RunStore.contract.ts` | modified | portable read assertions |
| `src/adapters/driven/storage/__test__/run-store-fs.test.ts` | modified | planted-state + injection cases |

No change to `src/core/run/**` (AC-15), no new dependency, no adapter-to-adapter import. `storage/index.ts` unchanged (factory already exported).

## Interfaces, Data, And State

```ts
export type RunStatus = "ok" | "partial" | "corrupt";
export interface RunSummary {
  readonly id: string;                 // <ts> directory name, prefix-stripped for partial
  readonly repoName: string;
  readonly startedAtEpochMs: number;   // parsed from the directory name (D8)
  readonly status: RunStatus;
  readonly durationMs?: number;
  readonly harness?: string;
  readonly baseRef?: string;
  readonly targetRef?: string;
  readonly state?: TerminalState;
  readonly verdict?: Verdict;
  readonly engine?: string;
}
export interface RunStore {
  save(record: RunRecord): Promise<string>;
  list(repoName: string): Promise<readonly RunSummary[]>;
  get(repoName: string, id: string): Promise<RunRecord>;
}
```

Error taxonomy after this story: `InvalidRunRecordError` (save input), `InvalidRunQueryError` (read input, AC-13), `RunAlreadyExistsError` (save collision), `RunNotFoundError` (get miss), `RunCorruptedError` (get on partial/corrupt), `RunPersistenceError` (any raw fs translation). All extend `HistoryError`.

## AC Coverage Map

| AC | Test file | Note |
|---|---|---|
| AC-1 | `RunStore.contract.ts` | save 3 out of order, assert ascending |
| AC-2 | `run-layout.test.ts` (+ AC-1's ordering) | `parseRunTimestamp` round-trip + rejects |
| AC-3 | contract (missing repo dir) + fs test (missing runsRoot) | |
| AC-4 | `run-store-fs.test.ts` | plant `.partial-<ts>`; plant both, final wins |
| AC-5 | `run-store-fs.test.ts` | exact minimal shape |
| AC-6 | `run-store-fs.test.ts` | 4 cases incl. `version: 2` |
| AC-7 | `run-store-fs.test.ts` | ok + partial + corrupt together |
| AC-8 | contract | summary vs saved record |
| AC-9 | contract | get round-trip, with/without optional bodies |
| AC-10 | contract | unknown id |
| AC-11 | `run-store-fs.test.ts` | needs planted state |
| AC-12 | `run-store-fs.test.ts` | stray file + non-ts dir |
| AC-13 | contract (typed rejection) + fs test (no-fs-access proof via mock) | |
| AC-14 | `run-store-fs.test.ts` | `vi.doMock(node:fs/promises)`, precedented |
| AC-15 | closing gate | `git diff --stat -- src/core/run` + depcruise |

Use-case delegation (not an AC, coding-standards requirement): `list-runs.test.ts` / `get-run.test.ts` with in-memory fakes.

## Alternatives And Trade-Offs

| Decision | Chosen | Rejected because |
|---|---|---|
| D-1 metadata schema strictness | strip unknown keys | `.strict()` would turn additive version-1 fields into `corrupt`, making the schema a compatibility trap |
| D-2 drift guard | `satisfies` + `Expect<Exclude<...>>` | moving unions into zod inside `run` violates AC-15; guardless duplication is the drift hazard H1's comment warns about |
| D-3 query validation error | new `InvalidRunQueryError` | reusing `InvalidRunRecordError` misnames the input — a query is not a record |
| D-4 read-path raw errors | broaden `RunPersistenceError` | a fourth class (`RunReadError`) adds taxonomy without adding caller-actionable distinction |
| D-5 id ts-format check | adapter's `parseRunTimestamp`, pre-fs | putting the ts regex in a core schema leaks the adapter's layout format into the port contract |
| D-6 entry classification | pure `classifyRunDirEntry` | inline classification inside `list()` would force every D9 case through fs fixtures |

## Open Technical Questions

- None blocking. Everything spec left to design (D5..D9 mechanics) is decided above.

## Approval Notes

- Honors ratified D1/D2 exactly; implements A-level D3..D9 as specified.
- Suggested execution order for plan: core surface first (port + schema + errors + use cases), then pure layout functions, then fs read flows + contract thickening, then planted-state/injection tests as the closing gate — mirroring `[E5.F2.H1]`'s ST-1..ST-4 shape, which worked cleanly.
- Recommended next stage: `sddl-plan`.
