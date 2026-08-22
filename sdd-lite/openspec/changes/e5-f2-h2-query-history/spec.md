# Spec

## Routing Digest

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- digest_summary: Add `RunStore.list(repoName)`/`RunStore.get(repoName, id)` to the driven port, plus `listRuns`/`getRun` use cases in `src/core/history/` that delegate to them (the `listRepos`/`listBranches` shape). `list()` returns a `RunSummary[]` — one entry per `<ts>` child of `runs/<repoName>/`, in ascending chronological order, each tagged `status: "ok" | "partial" | "corrupt"` rather than throwing on a bad entry. `get()` returns the full `RunRecord` (all fields, including file bodies) for one `ok` run, or throws a typed error for a run that does not exist, is partial, or is corrupt.
- scope_digest: IN = `RunStore.list`/`RunStore.get`, `RunSummary` type, `listRuns`/`getRun` use cases, `RunNotFoundError`/`RunCorruptedError`, fs-adapter implementation of both, `RunStore.contract.ts` thickened with read assertions. OUT = `RunStore.save()` changes, CLI wiring, pagination/filtering, cross-repo listing, cost/tokens.
- acceptance_digest: 12 ACs. AC-1..AC-4 cover `list()` ordering and empty-repo behavior; AC-5..AC-8 cover the partial/corrupt marker distinction; AC-9..AC-11 cover `get()`'s success and error paths; AC-12 pins the architecture guards (no `src/core/run` diff, no adapters-import-adapters, core-no-io-libs).

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- spec_status: complete, 12 acceptance criteria, all four proposal open questions resolved (D1..D4)

## Scope Boundary

### In Scope

- `RunStore` gains two read methods: `list(repoName: string): Promise<RunSummary[]>` and `get(repoName: string, id: string): Promise<RunRecord>`.
- New `RunSummary` type in `src/core/history/ports/run-store.ts`: `{ id, repoName, startedAtEpochMs, durationMs?, harness?, baseRef?, targetRef?, state?, verdict?, engine?, status: "ok" | "partial" | "corrupt" }` — every field except `id`, `repoName`, `startedAtEpochMs` and `status` is optional, because a `partial`/`corrupt` entry cannot supply them (D1).
- `listRuns` and `getRun` use cases in `src/core/history/`, each a thin function over `{ store: RunStore }`, mirroring `listRepos`/`listBranches`.
- Two new errors in `src/core/history/ports/run-store-errors.ts`: `RunNotFoundError` (no such `id` under `repoName`) and `RunCorruptedError` (the `id` exists but its `metadata.json` is unreadable or schema-invalid).
- `run-store-fs.ts` implementation of both methods against the existing `runs/<repoName>/<ts>/` layout, including the `status` classification logic.
- `RunStore.contract.ts` thickened with `list`/`get` assertions (closing `risk-004` from `[E5.F2.H1]`, which explicitly deferred this).

### Out Of Scope

- Any change to `RunStore.save()`, `run-layout.ts`'s write-side helpers, or atomicity/staging behavior.
- CLI wiring (`sentinel runs list|show`) — `[E6.F1.H1]` (#36), which the backlog marks as depending on this story.
- Cost/tokens per run — `[E5.F2.H3]` (#35), ⚪ optional, skipped per workflow contract rule 7.
- Pagination, filtering by date/state/verdict, or any query beyond "all runs for one repo, in `list()`'s defined order."
- Cross-repo listing (all repos at once) — the backlog says "listing per repo."
- Composition-root wiring of the adapter (unchanged from `[E5.F2.H1]`'s D2 — deferred to `E6.F1`).

### Non-Goals

- This story does not attempt to repair, migrate, or delete a corrupt/partial run directory. It only detects and reports.
- This story does not change what `save()` writes, so no existing on-disk run written by `[E5.F2.H1]`'s adapter needs migration to be readable by `list()`/`get()`.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `listRuns` for a repo with 3 valid runs, saved out of `<ts>` order | Returns 3 `RunSummary` entries in ascending `startedAtEpochMs` order (oldest first), regardless of `readdir`'s own order | AC-1, AC-2 |
| `listRuns` for a `repoName` with no `runs/<repoName>/` directory at all | Returns `[]`, no error | AC-3 |
| `listRuns` where one of three `<ts>` entries is a `.partial-<ts>` staging leftover from a crashed `save()` | Returns 3 entries; the partial one has `status: "partial"` and only `id`/`repoName`/`startedAtEpochMs`/`status` populated; the other two are unaffected | AC-4, AC-5 |
| `listRuns` where one `<ts>` entry's `metadata.json` is missing or fails to parse as JSON or fails `RunRecord` shape validation | That entry appears with `status: "corrupt"`, same minimal field set as `partial`; listing does not throw and the other entries are unaffected | AC-6, AC-7 |
| `listRuns` where a valid `<ts>` entry's `metadata.json` parses and validates | That entry has `status: "ok"` and every `RunSummary` field populated from `metadata.json` | AC-8 |
| `getRun(repoName, id)` for a valid `ok` run | Resolves with the full `RunRecord`, including `engineOutput`/`prompt`/`validationOutput` bodies read from `result.md`/`prompt.md`/`validations/*.log` when present | AC-9 |
| `getRun(repoName, id)` for an `id` with no matching directory under `repoName` | Rejects with `RunNotFoundError` | AC-10 |
| `getRun(repoName, id)` for a `partial` or `corrupt` `id` | Rejects with `RunCorruptedError` (partial and corrupt share the same caller-facing error — see D1) | AC-11 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `RunStore.list(repoName)` returns entries in ascending `startedAtEpochMs` order. | Unit test: save 3 records with out-of-order `startedAtEpochMs`, assert `list()` returns them sorted ascending. | must |
| AC-2 | Ordering is derived from each entry's own `startedAtEpochMs` (read from `metadata.json` or parsed from the `<ts>` directory name for a partial entry), never from filesystem `readdir` order. | Unit test with a fake/mocked `readdir` returning entries out of chronological order; assert `list()` still sorts correctly. | must |
| AC-3 | `list()` for a `repoName` with no `runs/<repoName>/` directory returns `[]`, not an error. | Unit test: fresh `runsRoot`, `list("never-saved")` resolves to `[]`. | must |
| AC-4 | A `.partial-<ts>` staging directory (the exact convention `[E5.F2.H1]`'s `save()` leaves behind on an interrupted write) is INCLUDED in `list()`'s result with `status: "partial"` — this story's scan does not skip dot-prefixed entries the way `[E5.F2.H1]`'s AC-19 collision-check scan does; the two scans serve different consumers (D1). | Unit test: leave a `.partial-<ts>` directory (with or without partial file contents) under `runs/<repo>/`, assert it appears in `list()` with `status: "partial"`. | must |
| AC-5 | A `partial` entry's `RunSummary` has only `id`, `repoName`, `startedAtEpochMs` (parsed from the directory name, stripping the `.partial-` prefix) and `status` populated; every other field is `undefined`. | Unit test asserts the exact shape. | must |
| AC-6 | A final (non-dot) `<ts>` directory whose `metadata.json` is missing, unparseable JSON, or fails `RunRecord`-shape validation is INCLUDED in `list()` with `status: "corrupt"`, using the same minimal field set as AC-5 (`startedAtEpochMs` parsed from the directory name). | Unit tests: (a) delete `metadata.json`, (b) write invalid JSON, (c) write JSON missing a required field — each still appears with `status: "corrupt"`. | must |
| AC-7 | One corrupt or partial entry never prevents other entries in the same `list()` call from being returned correctly. | Unit test: 3 entries, 1 corrupt, 1 partial, 1 ok — assert all 3 present with correct individual `status`. | must |
| AC-8 | An `ok` entry's `RunSummary` is populated from its `metadata.json`: `harness`, `baseRef`, `targetRef`, `state`, `verdict`, `engine`, `durationMs` map 1:1 to the persisted fields `[E5.F2.H1]`'s `serializeRunMetadata` writes. | Unit test compares a saved record's `list()` summary against the fields passed to `save()`. | must |
| AC-9 | `getRun(repoName, id)` for a valid `ok` run resolves with a `RunRecord` whose `engineOutput`/`prompt`/`validationOutput` are read from `result.md`/`prompt.md`/`validations/*.log` when those files exist, and omitted when they don't (mirroring `save()`'s own conditional-write behavior) (D3). | Unit test: save a record with and without optional bodies, assert `get()` round-trips each case. | must |
| AC-10 | `getRun(repoName, id)` for an `id` with no matching `<ts>` or `.partial-<ts>` directory rejects with `RunNotFoundError`. | Unit test. | must |
| AC-11 | `getRun(repoName, id)` for a `partial` or `corrupt` `id` rejects with `RunCorruptedError`, never a raw fs/parse exception. | Unit test for both cases. | must |
| AC-12 | `git diff --stat -- src/core/run` is empty for the whole story; `depcruise src` reports 0 violations (core-no-io-libs, core-modules-via-index, adapters-isolated, adapter-instantiation-in-main all hold). | Re-verified at the story's closing gate, same discipline as `[E5.F2.H1]`'s AC-3/AC-21. | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `partial` and `corrupt` share one caller-facing error (`RunCorruptedError`) in `getRun`, but are distinguished in `listRuns`'s `status` | A caller cannot tell the two apart from `getRun` alone, only from a prior `list()` call. Accepted: the two failure modes need the same caller response ("I can't retrieve this run"), and inventing a second error type for a distinction only `listRuns` needs would be over-modeling. | low |
| Classifying `corrupt` requires reading and parsing every `<ts>`'s `metadata.json` on every `list()` call | O(n) file reads per listing, same cost order as any directory scan; no caching in this story. Acceptable at expected run-history scale (per-repo, human-reviewed history, not a hot path). | low |
| `startedAtEpochMs` for a `partial`/`corrupt` entry is parsed from the directory name (via the existing `formatRunTimestamp` inverse), not read from `metadata.json` (which may not exist or be trustworthy) | Requires a new parse function inverse to `formatRunTimestamp`; must handle the `.partial-` prefix stripping. Contained entirely in `run-layout.ts`, unit-testable in isolation like its sibling functions. | low |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| **D1 — What does "corrupt/partial, listed with a marker" mean?** Resolved: BOTH `.partial-<ts>` staging leftovers AND final `<ts>` dirs with unreadable/invalid `metadata.json` are surfaced, tagged via `RunSummary.status`. This deliberately diverges from `[E5.F2.H1]`'s AC-19 scan (which skips dot-prefixed entries for its own narrower purpose — a collision pre-check has nothing useful to do with a partial entry). Recommendation, needs ratification. | design | **open, B-level, recommended** |
| **D2 — Read method shape.** Resolved: `list()` returns a distinct, narrower `RunSummary` (not full `RunRecord[]`), and `get()` returns the full `RunRecord`. Rationale: a listing's fields are a strict subset per the backlog, and a `partial`/`corrupt` entry cannot supply a full `RunRecord` at all — forcing `list()` to return `RunRecord[]` would require fabricating placeholder values for required `RunRecord` fields, which `RunSummary`'s all-optional-except-4 shape avoids structurally. Recommendation, needs ratification. | design | **open, B-level, recommended** |
| **D3 — `getRun` bodies vs paths.** Resolved: return bodies (full text), symmetric with what `save()` accepted. No caller need for paths has been named yet (no TUI story reads runs this way today), and returning paths would leak the on-disk layout into the port's public contract, which `[E5.F2.H1]`'s design deliberately kept adapter-internal. Recommendation, needs ratification. | design | open, A-level, recommended |
| **D4 — Empty-repo behavior.** Resolved: `list()` returns `[]`, never an error, for a `repoName` with no `runs/<repoName>/` directory — symmetric with `save()`'s own `mkdir(recursive: true)` treating a missing repo directory as normal, not exceptional. | design | closed, A-level |

## Approval Notes

- Builds on `[E5.F2.H1]` (#33, merged), zero changes to its write-side contract.
- The two B-level decisions (D1, D2) are the load-bearing ones: D1 determines what a "corrupt" scan must check, D2 determines the port's exact type surface. Both are recommended with clear rationale above; ratifying both together is sufficient to unblock design.
- Recommended next stage: `sddl-design`.

## Budget Notes

- Comparable size to `[E5.F2.H1]`: one port extension, one new domain type, two use cases, two new errors, one fs-adapter extension, one contract-suite extension. No new external dependency.
