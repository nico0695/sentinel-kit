# Execution Log

## Stage Overview

| Stage Id | Goal | Status |
|---|---|---|
| ST-1 | Core surface: port extension, RunMetadataSchema, errors, use cases, barrel | completed |
| ST-2 | Pure adapter functions: parseRunTimestamp, classifyRunDirEntry | completed |
| ST-3 | Impure list()/get() flows + RunStore.contract.ts thickening | completed |
| ST-4 | Planted-state tests + closing gate | completed |

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

## ST-2 — Pure adapter functions

- **Approval reference**: blanket auto-mode authorization, same as ST-1.
- **Planned scope**: `src/adapters/driven/storage/run-layout.ts` (edit), `src/adapters/driven/storage/__test__/run-layout.test.ts` (edit).
- **Actual changed files**: exactly the planned set. No deviation.

### What was implemented

- `parseRunTimestamp(name): number | null` — exact inverse of `formatRunTimestamp`, returns `null` (never throws) for anything not shaped like a run directory name.
- `classifyRunDirEntry(name, isDirectory): RunDirEntryKind` — D9's three-way rule: non-directory → `other`; `.partial-<ts>` directory with a valid ts suffix → `partial` (prefix stripped from `id`, per D5's addressing contract — the same `id` a `list()` caller passes straight to `get()`); ts-named directory → `final`; anything else (stray file, `.DS_Store`, non-ts dir, malformed `.partial-` suffix) → `other`.

### Quick checks

- `npm run check`: green (biome clean, no import-order fix needed this time; `tsc --noEmit` clean; `depcruise`: 75 modules, 151 deps, 0 violations — unchanged from ST-1, no new import).
- `npm test`: 339/339 (331 + 8 new: 3 `parseRunTimestamp` round-trip/rejection tests, 5 `classifyRunDirEntry` branch tests).
- `git diff --stat -- src/core/run`: empty.
- **Non-vacuity proof (mutation)**: short-circuited the `.partial-` branch condition (`if (false && name.startsWith(PARTIAL_PREFIX))`). Ran only the `classifyRunDirEntry` tests: the "classifies a `.partial-<ts>` directory as partial" test failed for the right reason (`{ kind: "other" }` instead of `{ kind: "partial", ... }`); the other 4 tests in that block still passed, confirming the mutation was scoped correctly. Reverted, re-ran full suite (339/339) and `npm run check` (green).

### Blockers

None.

### Next action

ST-3 (impure `list()`/`get()` flows in `run-store-fs.ts`, replacing ST-1's stubs, plus `RunStore.contract.ts` thickening), pending its own stage_approval (already covered by the blanket auto-mode authorization).

## ST-3 — Impure list()/get() flows + contract thickening

- **Approval reference**: blanket auto-mode authorization, same as ST-1/ST-2.
- **Planned scope**: `src/adapters/driven/storage/run-store-fs.ts` (edit — replacing ST-1's stubs), `src/adapters/driven/storage/__test__/RunStore.contract.ts` (edit).
- **Actual changed files**: exactly the planned set. No deviation.

### What was implemented

- `list(repoName)`: validates `repoName` via `RunQueryFieldsSchema.pick({ repoName: true })`; `readdir(repoDir, { withFileTypes: true })`, `ENOENT` → `[]`; classifies every entry via `classifyRunDirEntry`; a `final` entry's `metadata.json` is read+parsed+`RunMetadataSchema`-validated (helper `readMetadata`, shared with `get()`), `"missing"`/`"corrupt"` both become a minimal `corrupt` summary, success becomes a full `ok` summary; partials and finals merge into one `Map` (finals inserted after partials, so a same-id collision resolves final-wins per AC-4); sorted ascending by `startedAtEpochMs`. Any raw fs error beyond `ENOENT` on the top-level `readdir`, or beyond the classified missing/corrupt cases while reading one entry's metadata, surfaces as `RunPersistenceError` (AC-14).
- `get(repoName, id)`: validates both fields via `RunQueryFieldsSchema`; `parseRunTimestamp(id) === null` → `RunNotFoundError` pre-fs (D5); reads `metadata.json` at the resolved `finalDir` via the same `readMetadata` helper — `"corrupt"` → `RunCorruptedError`; `"missing"` → checks the sibling `.partial-<id>` staging dir (`exists()`, already used by `save()`) to decide `RunCorruptedError` vs `RunNotFoundError`; on success, reads `result.md`/`prompt.md`/`validations/*.log` (sorted by filename) via `readOptionalFile`/`readOptionalValidationLogs`, each `ENOENT` → omitted; composes the full `RunRecord`, defaulting `diff.warnings` to `[]` when the persisted document omitted it (AC-9).
- `RunStore.contract.ts` thickened: `list()` empty-repo (AC-3), `list()` ascending order across out-of-order saves (AC-1), `list()` field mapping for an `ok` entry (AC-8), `get()` full round-trip including `diff`/`usage`/`prompt`/`engineOutput`/`validationOutput` (AC-9), `get()` round-trip with no optional fields — omitted keys, not invented empty values (AC-9), `get()` `diff.warnings` defaulting to `[]` (AC-9), `get()` unknown id → `RunNotFoundError` (AC-10).

### Deviation: `exactOptionalPropertyTypes` forced explicit per-field `usage` reconstruction

Directly assigning `metadata.usage` (zod's inferred type carries an explicit `| undefined` per optional field) to `RunRecord.usage: ReviewUsage` failed `tsc` under the project's `exactOptionalPropertyTypes`. Fixed by reconstructing `usage` field-by-field with the same conditional-spread idiom already used for the record's other optional fields, rather than assigning the zod-inferred object directly — mechanical, no behavior change (a fully-populated `usage` round-trips identically; a partially-populated one now round-trips without leaking spurious `undefined` values, since the file-wide idiom is stricter than a raw assignment would have been).

### Quick checks

- `npm run check`: green (one mechanical biome `--write` for import order, `tsc --noEmit` clean including the `exactOptionalPropertyTypes` fix above, `depcruise`: 76 modules, 152 deps, 0 violations).
- `npm test`: 346/346 (339 + 7 new contract tests).
- `git diff --stat -- src/core/run`: empty.
- **Non-vacuity proof (mutation), attempt 1 — discovered a real gap, not silently passed over**: removed the `.sort()` call from `list()`'s return, expecting the "ascending order" contract test to fail. It did NOT fail — all 16 contract tests stayed green. Root cause: the fixture's real filesystem (`readdir` on a fresh temp directory in this environment) happened to already return entries in an order consistent with ascending `startedAtEpochMs`, so the contract-level test cannot distinguish "sorts explicitly" from "got lucky with readdir order" — it is filesystem-behavior-dependent, not a property of the code. This is exactly what design's own AC-2 validation hint anticipated: *"Unit test with a fake/mocked `readdir` returning entries out of chronological order"* — that proof requires controlling `readdir`'s return order directly, which belongs to the fs-specific test (ST-4), not the portable contract suite. Reverted the mutation; the `.sort()` call stays (it is still correct, defensive code — AC-2 explicitly forbids relying on `readdir` order even where a given filesystem happens to cooperate). Flagging this now rather than letting ST-4 silently discover it undocumented.
- **Non-vacuity proof (mutation), attempt 2 — succeeded**: neutralized `usage.inputTokens`'s conditional spread in `get()`'s reconstruction (made it always contribute `{}`). The "get() round-trips a full record" contract test failed for the right reason (`inputTokens: 4800` missing from the received object, all other fields matched). Reverted, re-ran full suite (346/346) and `npm run check` (green).

### Blockers

None.

### Next action

ST-4: fs-specific planted-state tests (partial/corrupt/stray-entry/dedupe/injection, including the readdir-order-independence proof AC-2 actually needs — see the attempt-1 finding above) and the story's closing gate, pending its own stage_approval (already covered by the blanket auto-mode authorization).

## ST-4 — Planted-state tests + closing gate

- **Approval reference**: blanket auto-mode authorization, same as ST-1/ST-2/ST-3.
- **Planned scope**: `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (edit).
- **Actual changed files**: exactly the planned set. No deviation.

### What was implemented

14 new tests, added as 5 new `describe` blocks, all planting real on-disk state (via `mkdirSync`/`writeFileSync`) rather than only going through `save()`:

- **`list()` partial/corrupt classification (AC-4..AC-8)**: a lone `.partial-<ts>` → `partial`; same-id `<ts>` + `.partial-<ts>` coexistence → final wins, single `ok` entry (AC-4); missing `metadata.json`, invalid JSON, a required field dropped, and `version: 2` → `corrupt` (AC-6, all 4 cases design named); one `list()` call with an `ok` + a `partial` + a `corrupt` entry together, none affecting the others (AC-7); a stray file (`.DS_Store`) and a non-ts-named directory → silently ignored, not listed (AC-12).
- **`get()` on partial/corrupt (AC-11)**: a `.partial-<ts>` id and a corrupt-metadata id both reject with `RunCorruptedError`.
- **Query input validation (AC-13)**: path-traversal-shaped `repoName`/`id` (`"../etc"`, `"a/b"`, `"../../x"`, `"."`) reject with `InvalidRunQueryError` for both `list()` and `get()`, proven pre-fs by asserting `runsRoot` has zero entries afterward (no directory was ever created or read). A well-formed-but-non-ts `id` correctly resolves to `RunNotFoundError` instead (design's D5 distinction, not a query error).
- **Raw fs failure translation (AC-14)**: `vi.doMock("node:fs/promises")` forcing `readdir` to throw `EACCES` — `list()` surfaces `RunPersistenceError`, not a raw exception. Same injection technique `[E5.F2.H1]`'s ST-4 precedented.
- **`readdir`-order independence (AC-2)**: the proof ST-3's attempt-1 mutation discovered was needed. Planted 3 valid runs, then mocked `readdir` to return them in the exact reverse of chronological order; asserted `list()`'s result is still ascending. This is the test that actually proves AC-2's claim — the earlier contract-suite attempt could not, because the real filesystem in this environment already returns entries pre-sorted.

### Quick checks

- `npm run check`: green (one mechanical biome `--write` for import order and a manual `_args` rename for an unused mock parameter biome flagged as unsafe-fixable; `tsc --noEmit` clean; `depcruise`: 76 modules, 152 deps, 0 violations — unchanged from ST-3, no new production import).
- `npm test`: 360/360 (346 + 14 new).
- **AC-17 (no `process.env` reads)**: `grep -rn "process\.env" src/core/history src/adapters/driven/storage --include="*.ts" | grep -v "__test__"` → zero matches across every production file this story touched.
- **Non-vacuity proof (mutation)**: swapped the merge order in `list()`'s dedupe (`[...finals, ...partials]` instead of `[...partials, ...finals]`, making partial win over final). The new "resolves a same-id final+.partial- coexistence to the final entry only" test failed for the right reason (`expected 'partial' to be 'ok'`). Reverted, re-ran full suite (360/360) and `npm run check` (green).

### Closing gate

- `git diff --stat -- src/core/run` (against `origin/main`, the story's base): **empty**. AC-15 holds across the entire story.
- Full story diff (`git diff --stat origin/main...HEAD`, code only): exactly the 14 files plan.md's ST-1..ST-4 named collectively — `run-store.ts`, `run-metadata-schemas.ts`, `run-store-errors.ts`, `run-store-schemas.ts`, `list-runs.ts`, `get-run.ts`, `index.ts`, `list-runs.test.ts`, `get-run.test.ts` (ST-1); `run-layout.ts`, `run-layout.test.ts` (ST-2); `run-store-fs.ts`, `RunStore.contract.ts` (ST-3); `run-store-fs.test.ts` (ST-4). No file outside `src/core/history/**` and `src/adapters/driven/storage/**`; no `src/main/` file; no adapter other than `storage`.
- `depcruise src`: 0 violations — `core-no-io-libs`, `core-modules-via-index`, `adapters-isolated`, `adapter-instantiation-in-main` all hold (AC-15).
- All 15 ACs from `spec.md` revision 2 now covered. `plan.md`'s ST-1..ST-4 fully executed.

### Blockers

None.

### Next action

`sddl-code-review` (4R protocol) over the whole-story diff, then `sddl-qa-review` in final mode.

## ST-5 — Fix stage (review-ledger.md R3-001, R4-001)

- **Approval reference**: `cp-review-gate` (user: "Sí, arreglá ambos (recomendado)") authorized this fix stage; `cp-st5-approval` records the same response as this stage's own `stage_approval`.
- **Planned scope**: `src/adapters/driven/storage/run-store-fs.ts` (edit), `src/adapters/driven/storage/__test__/run-store-fs.test.ts` (edit).
- **Actual changed files**: exactly the planned set. No deviation.

### What was implemented

- **R3-001 fix**: `get()`'s `metadata === "missing"` branch now checks `exists(finalDir)` before falling back to the staging-sibling check. A final directory that exists but has lost its `metadata.json` now throws `RunCorruptedError`, matching `list()`'s classification of the identical on-disk state, instead of `RunNotFoundError`. `RunNotFoundError` is now reserved for the case where `finalDir` genuinely doesn't exist (and no `.partial-<id>` staging remnant exists either).
- **R4-001 fix**: `list()`'s per-entry `readMetadata` call now catches ANY failure (not just the ones `readMetadata` itself classifies) and degrades that one entry to `status: "corrupt"` rather than rethrowing out of the `for` loop. **A-level decision, recorded here**: this resolves the tension the review identified between spec.md's AC-7 ("one corrupt or partial entry never prevents other entries... from being returned correctly") and AC-14 ("every raw fs or JSON failure... surfaces as a typed error") in favor of AC-7's graceful-degradation intent, since a caller that specifically needs to know about a raw fs failure on one run still gets it distinctly through `get(repoName, id)` on that same id (unaffected by this change — `get()`'s own raw-error path still throws `RunPersistenceError`). Judged technical, reversible, and within the already-authorized fix scope (the review's own finding named this exact resolution as the fix), so no separate consultation was raised beyond the blanket fix authorization already given.

### Quick checks

- `npm run check`: green (one mechanical biome `--write` for a line-wrap format nit; `tsc --noEmit` clean; `depcruise`: 76 modules, 152 deps, 0 violations — unchanged).
- `npm test`: 362/362 (360 + 2 new regression tests).
- `git diff --stat -- src/core/run`: empty.
- **Non-vacuity proof (mutation), R3-001**: reverted the `finalDirExists` check (restored the pre-fix logic). The new "rejects a final dir that exists but has no metadata.json..." test failed for the right reason (`RunNotFoundError` received where `RunCorruptedError` was expected). Reverted the mutation, re-verified clean.
- **Non-vacuity proof (mutation), R4-001**: reverted the per-entry catch to rethrow as `RunPersistenceError` (pre-fix logic). The new "a raw non-ENOENT failure reading ONE entry's metadata..." test failed for the right reason (the whole `list()` call rejected with `RunPersistenceError` instead of returning both entries with the bad one marked `corrupt`). Reverted the mutation, re-verified clean (362/362, `npm run check` green).

### Scoped re-review outcome

Both fix deltas resolve their findings exactly as authorized, touch nothing else, and are independently verified above by mutation (not merely by re-reading the code). Recorded in `review-ledger.md`'s Fix Rounds table; both findings' `Status` updated `open` → `fixed`.

### Blockers

None.

### Next action

`sddl-qa-review` in final mode (the 4R review's remaining `info` findings — R2-001, R2-002, R3-002, R3-003 — are non-blocking and not part of this fix stage's scope; they were surfaced to the user as optional follow-up, not required for this story).
