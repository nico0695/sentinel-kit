# Design

## Routing Digest

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- design_status: complete (7 design decisions; 0 blocking open questions)
- digest_summary: Six new files. Core contributes the `RunStore` port, the `RunRecord` shape, a zod schema validating only the two fields that become filesystem path segments, and a port error family — no Node builtins, because the `core-no-io-libs` guard bans every one of them. The adapter splits into a pure layout module (`run-layout.ts`: timestamp formatting, path derivation, hand-written metadata serializer) and an impure orchestration module (`run-store-fs.ts`: validate → collision-check → stage → rename). All three sensitive acceptance criteria (AC-4 exact field set, AC-10 no diff bodies, AC-18 no decoy leak) concentrate in the one pure, directly-testable serializer.

## Summary

The technical shape follows the `ConfigStore` precedent almost exactly: a port and a zod schema in core, a filesystem adapter that parses through that schema and translates raw fs failures into port errors, a shared contract suite, and an adapter test that drives the suite through a harness over a temp directory.

Two facts discovered in the repo drove the structure and are worth stating up front, because both would have produced a wrong design if assumed rather than checked:

1. **`.dependency-cruiser.cjs`'s `core-no-io-libs` rule bans all Node builtins in `src/core/**`, bare and `node:`-prefixed, with `zod` as the sole whitelisted package.** So no path manipulation of any kind can live in core via `node:path`. It can still live there as *pure string logic* — `src/core/workspace/helpers.ts` already derives worktree paths that way — but this design deliberately puts path derivation in the adapter instead, because a filesystem layout is an adapter concern (D-4 below).
2. **`ConfigStore` validates at the adapter boundary using a zod schema exported from core** (`GlobalConfigSchema.safeParse` inside `config-store-yaml.ts`), rather than hand-rolling validation in the adapter. Reusing that pattern is what makes AC-19 enforceable identically across any future `RunStore` implementation.

## Design Overview

### Flow of `save(record)`

```
1. RunRecordPathFieldsSchema.safeParse(record)
      failure → InvalidRunRecordError(message, fields)      [AC-19]
2. ts        = formatRunTimestamp(record.startedAtEpochMs)  [AC-14, pure]
3. repoDir   = join(runsRoot, record.repoName)
   finalDir  = join(repoDir, ts)
   stagingDir= join(repoDir, `.partial-${ts}`)              [AC-12: siblings]
4. stat(finalDir) exists → RunAlreadyExistsError            [AC-13]
5. mkdir(repoDir, { recursive: true })                      [AC-15]
6. rm(stagingDir, { recursive: true, force: true })         [AC-14 retry clause]
7. mkdir(stagingDir)
8. write metadata.json                                      [always]
   write result.md         if engineOutput present          [AC-5, AC-8]
   write prompt.md         if prompt present                [AC-6, AC-8]
   write validations/NNN.log per entry, if any              [AC-7, AC-8]
9. rename(stagingDir, finalDir)                             [AC-11: the atomic step]
10. return finalDir

catch (fs failure at any of 5..9):
   rm(stagingDir, { recursive: true, force: true }) best-effort, swallowing its own error
   throw RunPersistenceError(message, { cause })            [AC-20]
```

Steps 1–4 are pre-flight: none of them creates anything, so an invalid record or a collision leaves the filesystem untouched. Everything that writes lives inside the staging directory until step 9, which is the single atomic transition.

### Why step 6 is safe

Clearing a pre-existing `.partial-<ts>` looks destructive, but D7's determinism makes it precise: `<ts>` is a pure function of `record.startedAtEpochMs`, so `.partial-<ts>` can only ever have been created by an earlier attempt to save **this same run**. Remnants belonging to other runs carry other timestamps and are never touched. Without D7 — with an adapter-internal clock — this step would be unsafe and would have to be dropped, leaving stale staging directories to accumulate forever.

### The step 4 / step 9 race, stated rather than hidden

Between the collision check and the rename there is a TOCTOU window. Two concurrent saves of the same run can both pass step 4; one rename wins and the other fails. On POSIX, `rename` onto a **non-empty** directory fails with `ENOTEMPTY`, so the loser is caught — but it surfaces as `RunPersistenceError`, not the semantically nicer `RunAlreadyExistsError`.

This is accepted, not solved. Solving it properly needs an atomic create-exclusive on a directory, which Node does not offer portably. The pre-check earns its place by producing the correct error class in the normal, non-concurrent case; the rename failure is the correctness backstop. `save` never corrupts or merges a run in either ordering, which is the property that actually matters. Recorded as `risk-005`.

## Affected Areas

### New files

| File | Layer | Contents |
|---|---|---|
| `src/core/history/ports/run-store.ts` | core | `RunStore`, `RunRecord`, `RunFailureRecord`, `RunDiffSummary` |
| `src/core/history/ports/run-store-schemas.ts` | core | `RunRecordPathFieldsSchema` (zod) |
| `src/core/history/ports/run-store-errors.ts` | core | `HistoryError` base + three subclasses |
| `src/adapters/driven/storage/run-layout.ts` | adapter | pure: `formatRunTimestamp`, `deriveRunPaths`, `serializeRunMetadata` |
| `src/adapters/driven/storage/run-store-fs.ts` | adapter | `createRunStoreFsAdapter(runsRoot)` — all fs I/O |
| `src/adapters/driven/storage/__test__/RunStore.contract.ts` | test | portable port-level suite |
| `src/adapters/driven/storage/__test__/run-store-fs.test.ts` | test | fs-specific: layout, atomicity, determinism, redaction |

### Modified files

| File | Change |
|---|---|
| `src/core/history/index.ts` | replace the `export {}` placeholder with the real barrel |
| `src/adapters/driven/storage/index.ts` | add `export { createRunStoreFsAdapter } from "./run-store-fs.js";` — the file's doc comment **already** says it implements "ConfigStore, HarnessLoader and RunStore", so only the export line is missing |

### Untouched, and verified so

`src/core/run/**` — AC-3 requires an empty diff over that directory for the whole story. `src/main/**` — no composition-root wiring (D2). `src/adapters/driven/engines/**`, `git/**`, `exec/**` — the `adapters-isolated` guard forbids the new adapter from importing any of them anyway.

## Interfaces, Data, And State

### `src/core/history/ports/run-store.ts`

```ts
import type { RunStage, TerminalState, Verdict, ReviewUsage } from "../../run/index.js";

/** Diff facts worth keeping; deliberately NOT the diff bodies (D8, AC-10). */
export interface RunDiffSummary {
  readonly fileCount: number;
  readonly totalLines: number;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
}

/** No `cause`, no stack, no exception — a raw throwable cannot reach disk (AC-16). */
export interface RunFailureRecord {
  readonly stage: RunStage;
  readonly message: string;
}

export interface RunRecord {
  readonly repoName: string;
  readonly startedAtEpochMs: number;
  readonly durationMs: number;
  readonly harness: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly state: TerminalState;
  readonly engine?: string;
  readonly verdict?: Verdict;
  readonly prompt?: string;
  readonly engineOutput?: string;
  readonly diff?: RunDiffSummary;
  readonly usage?: ReviewUsage;
  readonly validationOutput?: readonly string[];
  readonly failure?: RunFailureRecord;
}

export interface RunStore {
  /** Resolves with the absolute path of the created run directory. */
  save(record: RunRecord): Promise<string>;
}
```

The `run`-module types arrive through `../../run/index.js` — the public barrel — which is what the `core-modules-via-index` guard requires. `history → run` introduces no cycle: `run` imports `repos`, `review` and `workspace`, and none of them imports `history`.

`RunDiffSummary` is a new shape rather than `ReviewDiff` because `ReviewDiff.files[]` carries `content: string | null` per file — the full per-file diff text. Accepting `ReviewDiff` directly would make it *possible* for a careless serializer to write the entire diff into `metadata.json`; accepting a summary makes it impossible. The caller does the one-line projection.

### `src/core/history/ports/run-store-schemas.ts`

```ts
import { z } from "zod";

/**
 * Validates ONLY the two fields that become filesystem path segments.
 * Every other field is a TypeScript union or primitive already guaranteed
 * at compile time; re-declaring those as zod enums would duplicate the
 * literal lists and reintroduce exactly the drift hazard `[E4.F2.H3]`
 * removed with the shared `EngineNameSchema`.
 */
export const RunRecordPathFieldsSchema = z.object({
  repoName: z
    .string()
    .min(1)
    .refine((v) => !v.includes("/") && !v.includes("\\"), {
      message: "repoName must not contain path separators",
    })
    .refine((v) => !v.startsWith("."), {
      message: "repoName must not start with '.'",
    }),
  startedAtEpochMs: z.number().int().nonnegative().finite(),
});
```

The `.` and `..` cases from AC-19 are subsumed by the leading-dot rule, which is strictly stronger — and it is the rule that keeps "entries starting with `.` are not runs" the single scanning invariant at both levels of `runs/` for `[E5.F2.H2]`.

### `src/core/history/ports/run-store-errors.ts`

Mirrors `config-store-errors.ts` exactly (dec-006's base-class-plus-subclass hierarchy, `cause` stored conditionally for `exactOptionalPropertyTypes`):

```
HistoryError            (base, readonly cause?)
├── InvalidRunRecordError   (+ readonly fields: {path, message}[])
├── RunAlreadyExistsError   (+ readonly path: string)
└── RunPersistenceError
```

`InvalidRunRecordError.fields` carries zod's issues mapped through the same `zodToFields` shape `config-store-yaml.ts` already uses, so E6 can render a field-level message.

### `src/adapters/driven/storage/run-layout.ts` (pure)

```ts
export function formatRunTimestamp(epochMs: number): string;
// 1787404200123 → "20260822T131000123Z"   (verified with node)
// new Date(epochMs).toISOString() then strip "-", ":", "."

export function deriveRunPaths(runsRoot, repoName, ts): {
  readonly repoDir: string; readonly finalDir: string; readonly stagingDir: string;
};

export function serializeRunMetadata(record: RunRecord): string;
// hand-written, field by field; JSON.stringify(obj, null, 2) + "\n"
```

`serializeRunMetadata` is the single most important function in the change. It is written as an explicit field-by-field construction — never `{...record}`, never `JSON.stringify(record)` — because that is what makes AC-4 (exactly the declared field set), AC-10 (no diff bodies) and AC-18 (no decoy leak) *structurally* true rather than merely currently true. Being pure and taking no fs, it is directly unit-testable without a temp directory.

### `src/adapters/driven/storage/run-store-fs.ts` (impure)

`createRunStoreFsAdapter(runsRoot: string): RunStore`, following the `createConfigStoreAdapter` factory-function convention (no class). Imports `node:fs/promises` (`mkdir`, `writeFile`, `rename`, `rm`, `stat`) and `node:path` (`join`). Every fs call sits inside the try whose catch produces `RunPersistenceError`.

### State considerations

The adapter holds no mutable state — `runsRoot` is captured at construction, every `save` is self-contained. The only state is on disk, and the only lifecycle question is the `.partial-` remnant, which D7's determinism scopes to a same-run retry.

## Testing Design

### `RunStore.contract.ts` (portable — behavior observable through `save`)

Harness shape mirrors `ConfigStoreContractHarness`: `build(root)`, `setupFixture()`, `teardownFixture(fixture)`.

Covers: a valid record resolves with a non-empty absolute path; `InvalidRunRecordError` for empty / separator-bearing / leading-dot `repoName` and for non-integer, negative and non-finite `startedAtEpochMs`; `RunAlreadyExistsError` on a genuine second save of the same record; first save into an empty root succeeds (AC-15). These are the assertions a sqlite-backed store would also have to satisfy.

### `run-store-fs.test.ts` (fs-specific)

Covers the on-disk contract: exact file set and omissions (AC-4..AC-8), byte-for-byte `result.md` / `prompt.md`, zero-padded `validations/NNN.log`, lexicographic chronological ordering (AC-9), the diff-marker absence test (AC-10), the decoy-token test (AC-18), and the pre-existing-directory-unmodified half of AC-13.

Three tests need a specific technique:

- **AC-11 (atomicity)** — inject a mid-staging failure. Precedent exists verbatim in `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts`, which uses `vi.resetModules()` plus `vi.doMock("node:fs/promises", ...)` wrapping the real module and failing one specific call, then a dynamic import. Reused rather than invented. Assert: `finalDir` does not exist, and the error is `RunPersistenceError`.
- **AC-14 (clockless)** — `vi.useFakeTimers()`, set system time to T1 and save; remove the directory; set system time to a far-later T2 and save the same record; assert both calls returned the identical path. A wall-clock-dependent adapter cannot pass this. This is a behavioral proof, chosen over grepping the source for `Date.now(` — the grep would pass for the wrong reasons and fail on an unrelated refactor.
- **AC-17 (no env)** — genuinely not observable through behavior, so it is verified by inspection at QA (the adapter's only inputs are `runsRoot` and the record) rather than by a test that would merely appear to prove it. Stated here so QA does not mistake the absence of a test for an oversight.

Both files live under `src/adapters/**/__test__/`, so they run in vitest's `adapters` project.

## Design Decisions

| ID | Decision | Alternatives | Rationale | Level |
|---|---|---|---|---|
| D-1 | Validate via a zod schema exported from core, parsed at the adapter boundary | Hand-rolled checks in the adapter; a core `validateRunRecord` function | Exactly what `ConfigStore` does today. Puts the rule in core where every future `RunStore` inherits it, and yields field-level diagnostics matching `ConfigValidationError`'s established shape | A |
| D-2 | The schema validates only `repoName` and `startedAtEpochMs` | Model all of `RunRecord` in zod | Only those two become path segments and can arrive as unchecked data. Re-declaring `TerminalState`/`Verdict`/`RunStage` as zod enums would duplicate literal lists — the drift hazard `[E4.F2.H3]` explicitly removed | A |
| D-3 | Errors live at `ports/run-store-errors.ts`, not `history-errors.ts` as spec.md sketched | The spec's path | These are *port* errors; `repos` places port errors at `ports/config-store-errors.ts` and use-case errors at the module root. Following the established split. **A refinement of a spec detail, flagged rather than silently applied** | A |
| D-4 | Path derivation lives in the adapter, not core | Core, as pure string logic like `workspace/helpers.ts` | A filesystem layout is an adapter concern; a future sqlite store would have no use for it. The guard permits either, so this is judgment, not necessity | A |
| D-5 | Adapter splits into pure `run-layout.ts` + impure `run-store-fs.ts` | One file | Concentrates AC-4, AC-10 and AC-18 in a pure function testable without a temp directory, and makes the serializer auditable in isolation — it is the file a reviewer must read most carefully | A |
| D-6 | `RunDiffSummary` is a new shape; the port does not accept `ReviewDiff` | Accept `ReviewDiff`, project inside the serializer | Makes D8 structural: with no diff bodies in the input, no serializer bug can write them. Costs the caller a one-line projection | A |
| D-7 | Keep the step-4 collision pre-check despite the TOCTOU window | Rely solely on `rename` failing | The pre-check gives the correct error class in the normal case; `ENOTEMPTY` is the race backstop. Neither ordering corrupts a run | A |

## Alternatives Considered And Rejected

- **A `write`/`read` pair on the port to make the contract suite thicker.** Rejected: it pre-empts `[E5.F2.H2]`'s design of the read shape. The thin-suite cost is already recorded as `risk-004` and accepted at spec approval.
- **Writing `metadata.json` last as a completion marker, no staging directory.** Rejected at spec (D3). Noted here only because it resurfaces naturally at design time: it would make every reader depend on knowing the write order, whereas staging makes "the directory exists" sufficient.
- **`mkdtemp` for the staging directory.** Rejected: `mkdtemp` in `os.tmpdir()` risks `EXDEV` on rename, and a random staging name would break D7's determinism, which is what makes step 6's cleanup safe.
- **Serializing with `JSON.stringify(record)` plus a delete-list of forbidden fields.** Rejected: a denylist fails open — a field added to `RunRecord` later would silently start being persisted. The hand-written allowlist fails closed.

## Open Technical Questions

None blocking. Two items deliberately deferred to the executor as ordinary implementation judgment:

- Whether `serializeRunMetadata` returns a trailing newline (recommended: yes — POSIX-friendly for the `cat`-readability AC).
- The exact wording of error messages, subject only to the constraint that `RunPersistenceError` messages name the operation and path without embedding the raw `cause`.

## Approval Notes

- Design covers all 21 acceptance criteria. AC-17 is the one criterion with no automated test, by deliberate choice, and the reason is stated in Testing Design rather than left for QA to discover.
- One spec detail is refined here, not silently: **D-3** relocates the error module from `src/core/history/history-errors.ts` (as spec.md's scope boundary listed it) to `src/core/history/ports/run-store-errors.ts`, to match the port-error convention `repos` already follows. If that is unwelcome, it is a one-line change to the plan.
- New risk to carry forward: `risk-005`, the step-4/step-9 TOCTOU window under concurrent saves of the same run — bounded, never corrupting, surfacing as the less precise error class in the losing branch.
- Recommended next stage: `sddl-plan`. The natural staging is core-first (port + schema + errors + barrel), then the pure layout module with its unit tests, then the fs adapter with the contract suite, then the fs-specific tests — each stage independently green under `npm run check` and `npm test`.
