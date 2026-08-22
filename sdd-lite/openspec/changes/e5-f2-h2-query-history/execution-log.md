# Execution Log

## Stage Overview

| Stage Id | Goal | Status |
|---|---|---|
| ST-1 | Core surface: port extension, RunMetadataSchema, errors, use cases, barrel | completed |
| ST-2 | Pure adapter functions: parseRunTimestamp, classifyRunDirEntry | pending |
| ST-3 | Impure list()/get() flows + RunStore.contract.ts thickening | pending |
| ST-4 | Planted-state tests + closing gate | pending |

## ST-1 — Core surface

- **Approval reference**: blanket auto-mode authorization ("ejecutar todo modo auto") given at the plan-approval checkpoint (`cp-plan-approval`), applied per-stage per CLAUDE.md's stage_approval requirement.
- **Planned scope**: `src/core/history/ports/run-store.ts` (edit), `run-metadata-schemas.ts` (new), `run-store-errors.ts` (edit), `run-store-schemas.ts` (edit), `list-runs.ts` (new), `get-run.ts` (new), `index.ts` (edit), two new test files.
- **Actual changed files**: exactly the planned set, PLUS one unplanned file: `src/adapters/driven/storage/run-store-fs.ts` (edit).

### Deviation: stub `list()`/`get()` in the existing adapter

Plan.md assigned `run-store-fs.ts` to ST-3. Adding `list`/`get` to the `RunStore` **interface** in ST-1 broke `tsc --noEmit` immediately: `createRunStoreFsAdapter` is the interface's only existing implementor, and TypeScript requires every implementor to satisfy the full interface at all times — there is no way to extend an interface with an existing implementor and keep `npm run check` green without also touching that implementor, even with throwing stubs.

Treated as an A-level autonomous decision (technical, reversible, internal structure): added `list()`/`get()` stubs to `createRunStoreFsAdapter` that throw `"RunStore.list/get is not implemented yet"`, clearly commented as ST-1 placeholders wired for real in ST-3. This does not change ST-3's planned scope — ST-3 still "implements list()/get()," just by replacing the stub bodies rather than adding new methods. No behavior change to `save()`.

### What was implemented

- `RunStatus`, `RunSummary` (D2's mostly-optional shape) and `list`/`get` signatures added to `RunStore`.
- `RunMetadataSchema` (new file): validates the *persisted* `metadata.json` document (`version: z.literal(1)`, `repo`, ISO `startedAt`, etc. — not `RunRecord`'s shape). Unknown keys stripped (default `z.object` behavior), not rejected. Two-direction compile-time drift guard for `TerminalState`/`Verdict`/`RunStage`: `as const satisfies readonly X[]` arrays plus `Expect<Exclude<Union, (typeof arr)[number]>>` exhaustiveness checks.
- `InvalidRunQueryError`, `RunNotFoundError`, `RunCorruptedError` added to the error family; `RunPersistenceError`'s doc comment broadened from "staging or the closing rename" to "any raw fs failure inside the store — write-side staging/rename, or a read."
- `RunQueryFieldsSchema` added; `RunRecordPathFieldsSchema`'s `repoName` refinement factored into a shared `PathSegmentSchema` both schemas now use (mechanical dedup, no behavior change to `save()`'s validation — same rules, same rejection cases, only the error message text lost the field-name prefix since the zod issue `path` already carries it).
- `listRuns`/`getRun` use cases: thin delegation, mirroring `listRepos`/`listBranches` exactly.
- Barrel (`index.ts`) exports everything new.
- Two new test files with in-memory fake `RunStore`s, no fs: delegation (arguments pass through, results/rejections pass through unchanged).

### Quick checks

- `npm run check`: green (biome clean after one mechanical `--write` for import-order in `index.ts`/`get-run.test.ts`, matching the same recurring deviation `[E5.F2.H1]`'s stages recorded each time; `tsc --noEmit` clean; `depcruise`: 75 modules, 151 dependencies, 0 violations).
- `npm test`: 331/331 (326 + 5 new: 3 in `list-runs.test.ts`, 2 in `get-run.test.ts`).
- `git diff --stat -- src/core/run`: empty (AC-15 holds).
- **Drift-guard proof (mutation)**: temporarily removed `"validation-failed"` from `TERMINAL_STATES`'s literal array. `npx tsc --noEmit` failed exactly as expected: `error TS2344: Type '"validation-failed"' does not satisfy the constraint 'never'` at the `Expect<Exclude<...>>` line. Reverted, re-ran `tsc --noEmit`, clean. The guard demonstrably catches a union/array drift at compile time, not just in principle.

### Blockers

None.

### Next action

ST-2 (pure `parseRunTimestamp`/`classifyRunDirEntry` in `run-layout.ts`), pending its own stage_approval (already covered by the blanket auto-mode authorization).
