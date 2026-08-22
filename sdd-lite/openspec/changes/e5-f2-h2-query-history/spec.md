# Spec

## Routing Digest

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- digest_summary: Add `RunStore.list(repoName)`/`RunStore.get(repoName, id)` to the driven port, plus `listRuns`/`getRun` use cases in `src/core/history/` that delegate to them (the `listRepos`/`listBranches` shape). `list()` returns a `RunSummary[]` — one entry per run under `runs/<repoName>/`, ascending chronological, each tagged `status: "ok" | "partial" | "corrupt"` rather than throwing on a bad entry. `get()` returns the full `RunRecord` (bodies included) for one `ok` run, or throws a typed error otherwise. Reading is validated: a new `RunMetadataSchema` (zod, in `history`) validates the persisted `metadata.json` document on every read, and `repoName`/`id` are validated as safe path segments before any fs access.
- scope_digest: IN = `RunStore.list`/`RunStore.get`, `RunSummary` type, `RunMetadataSchema`, `listRuns`/`getRun` use cases, `RunNotFoundError`/`RunCorruptedError`, fs-adapter read side (scan classification + metadata validation + body reads), `RunStore.contract.ts` thickened. OUT = `RunStore.save()` changes, CLI wiring, pagination/filtering, cross-repo listing, cost/tokens.
- acceptance_digest: 15 ACs. AC-1..AC-3 ordering + empty behavior; AC-4..AC-8 scan classification (partial, corrupt, ok, dedupe); AC-9..AC-11 `get()` success and error paths; AC-12 unrecognized-entry rule; AC-13 path-segment input validation; AC-14 raw-error translation; AC-15 architecture guards.

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- spec_status: complete at revision 2, 15 acceptance criteria (rev 1's 12 re-derived against `[E5.F2.H1]`'s actual code; five gaps fixed — see Revision Notes)

## Scope Boundary

### In Scope

- `RunStore` gains two read methods: `list(repoName: string): Promise<readonly RunSummary[]>` and `get(repoName: string, id: string): Promise<RunRecord>`.
- New `RunSummary` type in `src/core/history/ports/run-store.ts`: `{ id, repoName, startedAtEpochMs, status, durationMs?, harness?, baseRef?, targetRef?, state?, verdict?, engine? }` with `status: "ok" | "partial" | "corrupt"`. Every field beyond the first four is optional because a `partial`/`corrupt` entry cannot supply them (D1/D2). `id` is the run's `<ts>` directory name (for a partial entry, the name with the `.partial-` prefix stripped) — the same value `get()` accepts (D5).
- New `RunMetadataSchema` (zod) in `src/core/history/ports/`, validating the **persisted `metadata.json` document** that `[E5.F2.H1]`'s `serializeRunMetadata` writes — `version: 1`, `repo`, `startedAt` (ISO string), `durationMs`, optional `engine`/`verdict`/`diff`/`usage`/`failure`, `harness`, `baseRef`, `targetRef`, `state` (D6). Its `state`/`verdict` literal lists carry a compile-time drift guard (`satisfies` against the `run` unions) because AC-15 pins `src/core/run` untouched, so the canonical unions cannot move (D7).
- `listRuns` and `getRun` use cases in `src/core/history/`, each a thin function over `{ store: RunStore }`, mirroring `listRepos`/`listBranches`.
- Two new errors in `src/core/history/ports/run-store-errors.ts` extending `HistoryError`: `RunNotFoundError`, `RunCorruptedError`.
- `run-store-fs.ts` read-side implementation: scan classification, metadata validation via `RunMetadataSchema`, body reads, error translation. A pure inverse of `formatRunTimestamp` (ts-directory-name → epoch ms) in `run-layout.ts`.
- `RunStore.contract.ts` thickened with `list`/`get` assertions (closing `[E5.F2.H1]`'s `risk-004`, which explicitly deferred this to this story).

### Out Of Scope

- Any change to `RunStore.save()`, `run-layout.ts`'s existing write-side helpers, or atomicity/staging behavior.
- CLI wiring (`sentinel runs list|show`) — `[E6.F1.H1]` (#36), which depends on this story.
- Cost/tokens per run — `[E5.F2.H3]` (#35), ⚪ optional, skipped per workflow contract rule 7.
- Pagination, filtering, or any query beyond "all runs for one repo, ascending."
- Cross-repo listing — the backlog says "listing per repo."
- Composition-root wiring (unchanged from `[E5.F2.H1]`'s D2 — deferred to `E6.F1`).

### Non-Goals

- No repair, migration, or deletion of corrupt/partial run directories — detect and report only.
- No change to what `save()` writes; every run `[E5.F2.H1]`'s adapter already persisted is readable as-is.
- No tamper *detection* beyond schema validation (e.g. no cross-check that `metadata.json`'s `startedAt` matches the directory name; the directory name is the single ordering source, D8).

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `listRuns` for a repo with 3 valid runs saved in arbitrary order | 3 `RunSummary` entries ascending by `startedAtEpochMs` (oldest first) | AC-1, AC-2 |
| `listRuns` when `runs/<repoName>/` — or the `runsRoot` itself — does not exist | `[]`, no error | AC-3 |
| A `.partial-<ts>` staging leftover from a crashed `save()` sits next to 2 valid runs | 3 entries; the leftover has `status: "partial"` with only `id`/`repoName`/`startedAtEpochMs`/`status`; the others unaffected | AC-4, AC-5 |
| A final `<ts>` dir whose `metadata.json` is missing, invalid JSON, schema-invalid, or declares an unknown `version` | Entry appears with `status: "corrupt"`, same minimal field set; listing never throws | AC-6, AC-7 |
| A valid `<ts>` entry | `status: "ok"`, summary fields populated 1:1 from `metadata.json` | AC-8 |
| A stray file, `.DS_Store`, or non-ts-named directory under `runs/<repoName>/` | Silently ignored — not listed, not an error | AC-12 |
| `getRun` for a valid `ok` run | Full `RunRecord`, bodies read from `result.md`/`prompt.md`/`validations/*.log` when present, omitted when absent; `diff.warnings` defaults to `[]` | AC-9 |
| `getRun` for an unknown `id` | Rejects with `RunNotFoundError` | AC-10 |
| `getRun` for a `partial` or `corrupt` `id` | Rejects with `RunCorruptedError` | AC-11 |
| `list("../etc")` or `get(repo, "../../x")` | Rejects with a typed `HistoryError`-family validation error before any fs access | AC-13 |
| `readdir`/`readFile` raises `EACCES` (or any raw fs/JSON error) mid-read | Surfaced as a typed `HistoryError`-family error, never a raw exception | AC-14 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `RunStore.list(repoName)` returns entries in ascending `startedAtEpochMs` order. | Save 3 records out of order; assert sorted ascending. | must |
| AC-2 | Ordering derives from each entry's `startedAtEpochMs`, itself parsed **from the directory name** (uniformly, for all three statuses — D8), never from `readdir` order. | Unit test on the pure ts-parse function + a listing test whose correct order differs from creation order. | must |
| AC-3 | `list()` returns `[]` (not an error) when `runs/<repoName>/` does not exist — including when the `runsRoot` itself does not exist yet. | Fresh empty/absent root, `list("never-saved")` resolves `[]`. | must |
| AC-4 | A `.partial-<ts>` directory (the exact convention `save()` leaves on an interrupted write) is INCLUDED with `status: "partial"` — this scan deliberately diverges from `[E5.F2.H1]`'s AC-19 collision-check convention of skipping dot-entries (D1). If both `<ts>` and `.partial-<ts>` exist for the same ts (manual tampering; `save()` itself cannot produce this), the final dir wins and the remnant is not listed — one entry per `id`. | Plant a `.partial-<ts>`; assert listed as partial. Plant both; assert single `ok` entry. | must |
| AC-5 | A `partial` entry's summary has exactly `id` (prefix stripped), `repoName`, `startedAtEpochMs` (parsed from the name) and `status` populated; every other field `undefined`. | Exact-shape assertion. | must |
| AC-6 | A final ts-named dir whose `metadata.json` is missing, unparseable JSON, fails `RunMetadataSchema` validation, or declares a `version` other than `1`, is INCLUDED with `status: "corrupt"`, same minimal field set as AC-5. | Four cases: deleted file, invalid JSON, missing required field, `version: 2`. | must |
| AC-7 | One corrupt or partial entry never prevents the other entries of the same `list()` call from being returned correctly. | 3 entries — 1 ok, 1 partial, 1 corrupt — all present, each with its own `status`. | must |
| AC-8 | An `ok` entry's summary is populated from its `metadata.json`: `durationMs`, `harness`, `baseRef`, `targetRef`, `state`, `verdict`, `engine` map 1:1 to what `serializeRunMetadata` wrote. | Compare `list()` output against the record passed to `save()`. | must |
| AC-9 | `getRun` for an `ok` run resolves with a full `RunRecord`: metadata fields mapped back (`repo`→`repoName`, `startedAt` ISO→`startedAtEpochMs`), `engineOutput`/`prompt`/`validationOutput` read from `result.md`/`prompt.md`/`validations/*.log` (sorted by filename) when present and omitted when absent, `diff.warnings` defaulting to `[]` when the serializer omitted it (D3). | Round-trip tests: save with and without each optional body, `get()` back, compare. | must |
| AC-10 | `getRun` for an `id` with no matching `<ts>` or `.partial-<ts>` directory rejects with `RunNotFoundError`. | Unit test. | must |
| AC-11 | `getRun` for a `partial` or `corrupt` `id` rejects with `RunCorruptedError`, never a raw fs/parse exception. | Both cases. | must |
| AC-12 | Directory entries that are neither a ts-format directory nor a `.partial-<ts>` directory (stray files, `.DS_Store`, non-ts-named dirs) are silently ignored — never listed, never an error, never misclassified as `corrupt` (D9). | Plant a stray file + a non-ts dir; assert absent from `list()` and harmless. | must |
| AC-13 | `list()` and `get()` validate `repoName` (same rules as `save()`: non-empty, no separators, no leading dot) and `id` (ts-format) **before any fs access**; invalid input rejects with a typed `HistoryError`-family error. | Traversal-shaped inputs (`"../x"`, `"a/b"`, `".."`) reject; assert no fs call was made (fresh root untouched). | must |
| AC-14 | Every raw fs or JSON failure inside `list()`/`get()` beyond the classified cases surfaces as a typed `HistoryError`-family error — callers never see a raw `ENOENT`/`EACCES`/`SyntaxError`. | Failure-injection via mocked `node:fs/promises` (precedented in `[E5.F2.H1]`'s ST-4). | must |
| AC-15 | `git diff --stat -- src/core/run` is empty for the whole story; `depcruise src` reports 0 violations. The `RunMetadataSchema` drift guard is compile-time (`satisfies`), not a run-module edit. | Closing gate, same discipline as `[E5.F2.H1]`. | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `partial` and `corrupt` share one caller-facing error (`RunCorruptedError`) in `getRun`, distinguished only in `list()`'s `status` | A caller can't tell them apart from `get()` alone. Accepted: both demand the same response ("cannot retrieve"), and a second error class would model a distinction only `list()` needs. | low |
| `list()` reads and validates every entry's `metadata.json` per call | O(n) file reads per listing; no caching. Fine at per-repo human-history scale, not a hot path. | low |
| `RunMetadataSchema` duplicates the `TerminalState`/`Verdict` literal lists as zod enums | The exact drift hazard `[E5.F2.H1]`'s schema comment warned about — but read-side disk data is untrusted, so runtime validation is not optional here. Mitigated structurally: `satisfies`-based compile-time guard makes any future union drift a type error (D7), and AC-15 forbids the alternative (moving the unions into zod inside `src/core/run`). | medium |
| `startedAtEpochMs` uniformly from the directory name means a tampered `metadata.json` `startedAt` is not cross-checked | Ordering stays consistent with `get()` addressing either way; tamper detection is a non-goal. | low |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| **D1 — "corrupt/partial, listed with a marker" covers BOTH failure modes**: `.partial-<ts>` staging leftovers AND final ts-dirs with missing/invalid/unknown-version `metadata.json`, surfaced via `RunSummary.status`. Deliberately diverges from `[E5.F2.H1]`'s AC-19 scan (a collision pre-check has no listing consumer). | Defines the scan contract. | design | **open, B-level, recommended** |
| **D2 — `list()` returns a distinct, narrower `RunSummary`; `get()` returns the full `RunRecord`.** A partial/corrupt entry cannot supply `RunRecord`'s required fields; `RunSummary`'s mostly-optional shape avoids fabricating placeholders structurally. | Defines the port's type surface. | design | **open, B-level, recommended** |
| D3 — `getRun` returns file **bodies**, symmetric with what `save()` accepted; returning paths would leak the on-disk layout into the port contract. | Port contract. | design | open, A-level, recommended |
| D4 — Missing `runs/<repoName>/` (or `runsRoot`) → `[]`, never an error. | AC-3. | design | closed, A-level |
| D5 — `id` = the `<ts>` directory name (prefix-stripped for partial); the value `list()` reports is the value `get()` accepts. `<ts>`/`.partial-<ts>` for one ts are mutually exclusive under `save()`'s own semantics; tampering-induced coexistence resolves final-wins (AC-4). | Addressing contract between the two methods. | design | closed, A-level |
| D6 — `metadata.json` is validated on read by a new `RunMetadataSchema` describing the **persisted document** (ISO `startedAt`, `repo`, `version: 1`) — NOT by reusing `RunRecord`'s shape, which the document deliberately differs from. | Rev 1's AC-6 named a validation target that doesn't exist. | design | closed, A-level |
| D7 — `RunMetadataSchema`'s `state`/`verdict` enums live in `history` with a compile-time `satisfies` drift guard against the `run` unions, because AC-15 pins `src/core/run` untouched. | Guard-compatible runtime validation. | design | closed, A-level |
| D8 — `startedAtEpochMs` derives from the directory name for ALL statuses (single source; partial/corrupt have no trustworthy metadata to read it from anyway). | One rule instead of two. | design | closed, A-level |
| D9 — Scan classification is a three-way rule: ts-format dir → run (`ok`/`corrupt` by metadata), `.partial-<ts>` → `partial`, anything else → silently ignored. `corrupt` is reserved for things that ARE runs (a ts-named dir) with unreadable content — a stray `.DS_Store` is not a corrupt run. | Prevents misclassifying junk as corrupt runs. | design | closed, A-level |

## Revision Notes (rev 1 → rev 2)

Re-derived every AC against `[E5.F2.H1]`'s actual merged code (`run-layout.ts`, `run-store-fs.ts`, `RunStore.contract.ts`, `run-store-schemas.ts`). D1..D4 survived unchanged. Five gaps fixed:

1. **Rev 1's AC-6 named a nonexistent validation target** ("fails `RunRecord`-shape validation"): `metadata.json` is not `RunRecord`-shaped — `serializeRunMetadata` writes a distinct document (`version: 1`, `repo`, ISO `startedAt`, conditional sub-objects) and no schema for it exists anywhere. New D6/D7 introduce `RunMetadataSchema` with a compile-time drift guard, since AC-15 forbids relocating the `TerminalState`/`Verdict` unions into `src/core/run` zod schemas.
2. **No path-traversal validation on read inputs**: `list(repoName)`/`get(repoName, id)` turn caller input into path segments; rev 1 never required validating them. New AC-13, mirroring `save()`'s own `RunRecordPathFieldsSchema` discipline.
3. **No raw-error translation AC for the read paths** — rev 1 had no analogue of `[E5.F2.H1]`'s AC-20. New AC-14.
4. **Scan classification was implicitly two-way**: rev 1 forced every directory entry into ok/partial/corrupt, so a stray `.DS_Store` or `notes.txt` would have been listed as a corrupt run. New D9/AC-12: non-run entries are silently ignored; `corrupt` requires a ts-named dir. Also pinned: unknown `metadata.json` `version` → corrupt (AC-6), same-ts final+partial coexistence → final wins (AC-4).
5. **Under-specified data sourcing**: `id` semantics (D5), `startedAtEpochMs`'s single source for all statuses (D8), `diff.warnings` defaulting to `[]` on round-trip since the serializer omits empty arrays (AC-9), and `validations/*.log` read order (sorted by filename, AC-9) were all left to design's imagination in rev 1.

## Approval Notes

- Builds on `[E5.F2.H1]` (#33, merged), zero changes to its write-side contract.
- D1 and D2 remain the load-bearing B-level decisions; D5..D9 are A-level closures recorded with rationale per the decision protocol. Ratifying D1+D2 unblocks design.
- Recommended next stage: `sddl-design`.

## Budget Notes

- One port extension, two domain types (`RunSummary`, `RunMetadataSchema`), two use cases, two errors, one fs-adapter read side, one pure inverse-timestamp function, contract-suite extension. No new external dependency.
