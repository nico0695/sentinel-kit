# Spec

## Routing Digest

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- spec_status: complete, revision 2 (21 acceptance criteria; three B-level decisions resolved with recommendations, pending ratification at `cp-spec-approval`)
- digest_summary: Define the `RunStore` driven port in `src/core/history/ports/`, the `RunRecord` domain shape it persists, the module's error family, and a filesystem adapter (`run-store-fs.ts`) writing `runs/<repo>/<ts>/` as plain files — `result.md`, `prompt.md`, `metadata.json`, `validations/NNN.log`. The port has exactly one method, `save`. `runReview` is not modified. The adapter is clockless: `<ts>` derives deterministically from `record.startedAtEpochMs`, so the same record always maps to the same path. Atomicity comes from staging inside the runs root and a single `rename`, so a non-dot directory that exists is always complete and a crash leaves an identifiable `.partial-` remnant.

## Summary

The `history` core module gains its first real content. Issue #33's three checklist items become enforceable criteria: plain readable files (AC-4..AC-10), atomic write with identifiable partials (AC-11..AC-15), and no secrets on disk (AC-16..AC-18).

This is **revision 2** of the spec, produced by a directed re-analysis of revision 1 before any design work. Revision 1's decisions D1–D6 all survived re-examination unchanged; what did not survive were five specification gaps, one of them a self-contradictory acceptance criterion. The Revision Notes section at the end records exactly what changed and why, so the approval covers the deltas knowingly.

## Resolved Decisions (from proposal's open questions)

| # | Question | Resolution | Level |
|---|---|---|---|
| D1 | Where do `harness`, `branch`, `duration` come from? | **The caller composes a `RunRecord`.** `save(record)` takes an already-composed value; `runReview` is untouched and grows no fields. | **B** |
| D2 | Who calls the store? | **Nobody, in this story.** Port + adapter ship without a caller; wiring is `E6.F1`. | **B** |
| D3 | Atomicity over a directory | **Staging directory inside the runs root + one `rename`.** No completion marker. | **B** |
| D4 | Precise redaction rule | Never persist a raw exception or any environment. `failure` is recorded as `{ stage, message }` with a caller-sanitized message; the store's guarantee is structural (the type admits no exception object), not content inspection. | A/B |
| D5 | What is `<repo>` | The `repos.yaml` **registry key** (repo name), supplied by the caller and validated as a single safe path segment. | A/B |
| D6 | Does the port need a read method? | **No.** `save` only. `list`/`get` are `[E5.F2.H2]`'s design. | A |
| D7 *(new in rev 2)* | Where does `<ts>` come from? | **Derived from `record.startedAtEpochMs`, in the adapter, deterministically.** The adapter contains no clock: it never calls `Date.now()` and takes no `now` seam. Same record → same path. | A |
| D8 *(new in rev 2)* | Is `record.diff` persisted whole? | **No — summary only.** `ReviewDiff.files[]` carries full per-file diff content; serializing it would duplicate the entire diff inside `metadata.json` while `prompt.md` already carries it verbatim. Metadata persists `{ fileCount, totalLines, estimatedTokens, truncated, warnings[] }` where `warnings` is the human-readable messages. | A |

### Why D1 is (a) and not (b) or (c)

Option (b) — growing `RunReviewResult` one field per missing datum — is what `[E4.F2.H3]` did for `engineName`, and its own artifacts recorded that as a compromise made *because no store existed*. Repeating it three more times would make `runReview` responsible for measuring wall-clock duration, which it does not do today and which is genuinely the caller's concern (the caller owns the clock around the call). Option (c) — passing request and result into the store — would make `history` depend on `run`'s **request** shape, coupling a persistence port to an orchestration input. Option (a) leaves `runReview` byte-identical and keeps the coupling one-directional: `history` imports `TerminalState`, `Verdict` and `RunStage` from `run`'s public barrel, which the architecture guards permit.

### Why D3 stages inside the runs root

`mkdtemp` in the OS temp dir is the reflex, but `rename` across filesystems fails with `EXDEV`, and `os.tmpdir()` is routinely a different mount. Staging at `runs/<repo>/.partial-<ts>/` guarantees the same filesystem. It also answers "partial run identifiable" for free: a completed run directory is only ever created by an atomic `rename`, so **a directory whose name does not start with `.` is always complete**, and a reader needs no marker file and no knowledge of a write order. `[E5.F2.H2]`'s "corrupt/partial runs listed with mark" then has a mechanical signal: list non-dot directories as runs, surface `.partial-` remnants as partials. (This is also why AC-19 forbids a leading `.` in `repoName` — it keeps "skip dot-entries" the single scanning rule at both directory levels.)

### Why D7 makes the adapter clockless

The codebase's convention for time is an injectable seam (`now?: () => number` in `createReviewWorktree` and `runReview`), and the record already must carry `startedAtEpochMs` for the metadata. Giving the adapter its own clock would create two sources of truth — the directory name and `metadata.json.startedAt` could disagree — and make every path assertion in tests race-prone. Deriving `<ts>` from the record removes the clock entirely: determinism for tests, one timestamp with three representations (epoch in the record, ISO in metadata, compact in the path), and `RunAlreadyExistsError` becomes meaningful (a true re-save of the same run, not a clock accident).

## Scope Boundary

### In Scope

- `src/core/history/ports/run-store.ts` — the `RunStore` port and the `RunRecord` / `RunFailureRecord` / `RunDiffSummary` domain shapes.
- `src/core/history/history-errors.ts` — `RunPersistenceError`, `InvalidRunRecordError`, `RunAlreadyExistsError`.
- `src/core/history/index.ts` — becomes a real barrel replacing the `export {}` placeholder.
- `src/adapters/driven/storage/run-store-fs.ts` — `createRunStoreFsAdapter(runsRoot: string): RunStore`.
- `src/adapters/driven/storage/__test__/RunStore.contract.ts` — shared port-level contract suite.
- `src/adapters/driven/storage/__test__/run-store-fs.test.ts` — adapter tests asserting the on-disk layout, atomicity, determinism and redaction.
- Export of the new adapter from `src/adapters/driven/storage/index.ts`.

### Out Of Scope

- `listRuns` / `getRun` use cases — `[E5.F2.H2]` (#34).
- Cost/tokens per run — `[E5.F2.H3]` (#35), ⚪ optional, skipped per workflow contract rule 7.
- Running validations — `E5.F1` (#31, #32). This story persists strings it is handed.
- Composition-root wiring — `E6.F1`. No file under `src/main/` is touched.
- Retention, pruning, size caps on `runs/`; cleanup of `.partial-` remnants from *other* runs.
- Any modification to `src/core/run/**`, including `runReview`, its request, its result, and its pipeline.

### Non-Goals

- Not a general-purpose object store. `save` persists one run.
- Not a concurrency-control mechanism. Two distinct runs colliding on the same directory name is an error, not a merge.
- Not a schema-versioned format. `metadata.json` carries a `version` field so a future reader can branch, but no migration machinery ships here.
- Not a content scanner. The store guarantees no *structural* path for secrets (typed failure, no env reads, exact metadata field set); it does not inspect the strings it is told to carry verbatim.

## Expected Behavior

### On-disk layout

```
<runsRoot>/<repo>/<ts>/
  result.md              # engineOutput verbatim; omitted when the engine stage never produced output
  prompt.md              # the exact prompt sent; omitted when the prompt stage never completed
  metadata.json          # always present
  validations/001.log    # one file per validationOutput entry; directory omitted when there are none
```

`<ts>` is `record.startedAtEpochMs` rendered as compact ISO-8601 UTC with milliseconds and no separators — `20260822T131000123Z`. It is human-readable, filesystem-legal on Windows (no colons), and lexicographically sortable, which is what `[E5.F2.H2]`'s "chronological order" criterion needs without parsing.

### Precedence and failure table

| Scenario | Behavior |
|---|---|
| Valid record, target directory free | `<runsRoot>/<repo>/` is created if missing (recursive). Files staged under `<runsRoot>/<repo>/.partial-<ts>/`, then one `rename` to `<runsRoot>/<repo>/<ts>/`. Resolves with the absolute run-directory path. |
| `record.repoName` empty, containing `/` or `\`, equal to `.` or `..`, or starting with `.` | `InvalidRunRecordError`. Nothing is written, no directory is created. |
| `record.startedAtEpochMs` not a finite non-negative integer | `InvalidRunRecordError`. Nothing is written. |
| Final `<ts>` directory already exists | `RunAlreadyExistsError`. The existing run is never overwritten, merged, or partially touched. |
| Staging `.partial-<ts>` directory already exists (crash remnant of a previous attempt at this same run) | Removed and re-staged. Deterministic paths (D7) make this safe: the same record owns the same staging path, so clearing it is retrying, not destroying another run's work. Remnants of *other* timestamps are never touched. |
| Any fs failure during staging | `RunPersistenceError` with `cause`. Staging directory removed best-effort; a leftover `.partial-` directory is the identifiable-partial signal, not a correctness failure. |
| `rename` fails | `RunPersistenceError` with `cause`. No complete run directory exists, so no reader can observe a partial as complete. |
| `record.engineOutput` absent | `result.md` is not created. `metadata.json` is still written. |
| `record.prompt` absent | `prompt.md` is not created. |
| `record.validationOutput` absent or empty | `validations/` is not created. |

### `metadata.json`

Field names are a user-facing contract (AC-4), not an implementation detail:

```json
{
  "version": 1,
  "repo": "sentinel-kit",
  "startedAt": "2026-08-22T13:10:00.123Z",
  "durationMs": 42137,
  "engine": "claude-code",
  "harness": "pr-review",
  "baseRef": "main",
  "targetRef": "feature/x",
  "state": "ok",
  "verdict": "approve",
  "diff": {
    "fileCount": 3,
    "totalLines": 412,
    "estimatedTokens": 5100,
    "truncated": true,
    "warnings": ["diff truncated: kept 400 of 900 lines across 2 of 3 files"]
  },
  "usage": { "inputTokens": 4800, "outputTokens": 900, "totalTokens": 5700 },
  "failure": { "stage": "engine", "message": "Engine exited with code 1" }
}
```

- `startedAt` is the ISO-8601 UTC rendering of `record.startedAtEpochMs` — the same value that names the directory, in a second representation. They cannot disagree because there is one source.
- `engine` is sourced from `[E4.F2.H3]`'s `engineName`; `harness`, `baseRef`, `targetRef`, `startedAtEpochMs` and `durationMs` come from the caller under D1.
- `diff` is the **summary** under D8: `fileCount` is `files.length`, `warnings` is each warning's `message` string; per-file entries and their `content` are deliberately not persisted (`prompt.md` already carries the diff verbatim). `warnings` is omitted when empty.
- `verdict`, `usage`, `diff` and `failure` are omitted when the corresponding datum is absent — omitted, not `null`.
- `failure.message` is caller-composed under D4. It appears here because that is its contract; the guarantee against leaking exception internals is that `RunFailureRecord` cannot *hold* an exception, stack, or `cause` (AC-16).

## Acceptance Criteria

**Port and domain shape**

- **AC-1** — `src/core/history/ports/run-store.ts` declares `RunStore` with exactly one method: `save(record: RunRecord): Promise<string>`, resolving with the absolute path of the created run directory.
- **AC-2** — `RunRecord` carries every metadata field the backlog names. `repoName`, `startedAtEpochMs`, `durationMs`, `harness`, `baseRef`, `targetRef` and `state` are required; `engine`, `verdict`, `prompt`, `engineOutput`, `diff`, `usage`, `validationOutput` and `failure` are optional. `startedAtEpochMs` and `durationMs` are numbers (epoch milliseconds / milliseconds), matching the codebase's `now(): number` clock convention.
- **AC-3** — `src/core/history/index.ts` exports the port, the record types and the error family, and no longer contains `export {}`. `src/core/run/**` is byte-for-byte unchanged; a diff of that directory over the whole story is empty.

**Plain-file readability (issue #33, item 1)**

- **AC-4** — A saved run produces `metadata.json` whose parsed object has exactly the field names in the Expected Behavior table, with absent data omitted rather than set to `null`, and no field beyond the declared set.
- **AC-5** — `result.md` contains `record.engineOutput` byte-for-byte, with nothing prepended or appended.
- **AC-6** — `prompt.md` contains `record.prompt` byte-for-byte.
- **AC-7** — Each `validationOutput` entry is written to `validations/NNN.log` in order, zero-padded to three digits from `001`.
- **AC-8** — Each of `result.md`, `prompt.md` and `validations/` is omitted entirely when its source datum is absent or empty; the run directory is still created and `metadata.json` is still written.
- **AC-9** — Two runs saved for the same repo sort chronologically by directory name under a plain lexicographic string sort, with no timestamp parsing.
- **AC-10** — `metadata.json.diff` is the D8 summary. A test saves a record whose `diff.files[].content` holds a distinctive marker string and asserts the marker is absent from `metadata.json`.

**Atomicity and determinism (issue #33, item 3)**

- **AC-11** — Files are staged under `<runsRoot>/<repo>/.partial-<ts>/` and moved into place by a single `rename`. A test that injects a failure after some files are staged proves no directory exists at the final path.
- **AC-12** — The staging directory is a sibling of the final directory, under the same `runsRoot`, so the `rename` cannot cross a filesystem boundary.
- **AC-13** — `save` rejects with `RunAlreadyExistsError` when the final directory already exists, and the pre-existing directory's contents are unmodified.
- **AC-14** — The adapter is clockless and deterministic (D7): it never calls `Date.now()` or `new Date()` without an argument, `<ts>` is a pure function of `record.startedAtEpochMs`, and saving two equal-timestamp records for the same repo yields exactly one run directory plus one `RunAlreadyExistsError`. A pre-existing `.partial-<ts>` remnant for the *same* timestamp is cleared and the save proceeds; remnants with other timestamps are untouched.
- **AC-15** — A first save into an empty `runsRoot` succeeds: `<runsRoot>/<repo>/` is created recursively as part of the save, and a missing `runsRoot` is not an error.

**No sensitive data (issue #33, item 2)**

- **AC-16** — `RunFailureRecord` is `{ stage: RunStage; message: string }`, reusing `RunStage` from `src/core/run/index.js` rather than a loose `string`. It is structurally impossible to hand the store a raw exception, so no stack trace, `cause` chain, or spawned command line can reach disk through this path.
- **AC-17** — No adapter code path reads `process.env` or writes any environment-derived value. (Together with AC-14's no-clock rule: the adapter's only inputs are `runsRoot` and the record.)
- **AC-18** — A test saves a record with a decoy secret-looking token planted in `prompt`, `engineOutput` and each `validationOutput` entry, then asserts the token appears **only** in the files whose contract is to carry those fields verbatim (`prompt.md`, `result.md`, `validations/*.log`) and never in `metadata.json`. `failure.message` is excluded from the decoy set — metadata.json *is* its carrier file, and its sanitization is the caller's duty under D4. This test must fail if a future edit serialized the record wholesale into metadata.

**Validation and errors**

- **AC-19** — `save` rejects with `InvalidRunRecordError`, before creating any directory, when `repoName` is empty, contains `/` or `\`, is `.` or `..`, or starts with `.` — path traversal cannot escape `runsRoot`, and the "non-dot entries are runs" scanning invariant holds at the repo level too. It also rejects a `startedAtEpochMs` that is not a finite non-negative integer, since that value names the directory.
- **AC-20** — Every raw fs failure is translated into `RunPersistenceError` with the original preserved in `cause`. No caller ever sees a raw `ENOENT`/`EACCES`.

**Architecture and quality**

- **AC-21** — `npm run check` and `npm test` are green. `src/core/history/**` imports nothing from `src/adapters/**` or `src/main/**`; it imports `run`'s types only through `src/core/run/index.js`. The adapter is exported from the storage barrel and instantiated nowhere.

## Risks And Trade-offs

| Risk | Assessment |
|---|---|
| Shipping a port with no caller | Accepted, and precedented one story ago: `[E4.F2.H3]` shipped `resolveEngine` uncalled for the same reason (`E6.F1` owns wiring). The cost is that the first real end-to-end use may reveal an awkward `RunRecord` field; the mitigation is that `RunRecord` is a plain data shape, cheap to amend before it has consumers. |
| Thin contract suite | Real. With a write-only port, `RunStore.contract.ts` can only assert behavior observable through `save` (resolution, error classes, traversal rejection, already-exists); the on-disk assertions necessarily live in the fs-adapter test, which is not portable to a future sqlite store. Adding `read` now would fix this but would pre-empt `[E5.F2.H2]`'s design. Accepted deliberately; `[E5.F2.H2]` is where the suite thickens. |
| Same-millisecond collision | Two *distinct* runs for one repo starting in the same millisecond collide; the second gets `RunAlreadyExistsError`. Judged acceptable: reviews take seconds to minutes, and erroring is strictly safer than overwriting. Under D7 this is now clearly distinguishable from a retry (same record = legitimate re-save attempt = same path, surfaced as the same error for the caller to interpret; `[E5.F2.H2]` would surface any occurrence plainly). |
| `repoName` is caller-supplied and unverified against `repos.yaml` | The store validates the string is a safe path segment (AC-19) but cannot confirm the repo is registered — `history` has no `ConfigStore` dependency, and adding one for a naming check would be disproportionate coupling. Windows-reserved characters beyond `/` and `\` (e.g. `:`) are likewise not policed; the registry key is the user's own naming choice, and policing one OS's full reserved set is `E6`-surface polish, not a persistence-correctness rule. Recorded, not solved. |
| Leftover `.partial-` directories | A crash between staging and rename leaves one. By design this is the "partial run identifiable" signal, not a defect. This story clears only its own timestamp's remnant on retry (AC-14); global cleanup belongs with retention, which is out of scope. |

## Open Questions

None blocking design. D1–D8 are resolved above; D1, D2 and D3 are B-level and carried to `cp-spec-approval` for ratification. D7 and D8 are A-level (technical, reversible, convention-aligned) and are recorded for ratification-by-visibility rather than as separate checkpoint options.

## Revision Notes (rev 1 → rev 2)

Directed re-analysis before design. D1–D6 unchanged. The deltas:

1. **AC-15(rev1) was self-contradictory** — it planted a decoy in "every optional string field" and then required its absence from `metadata.json`, but `failure.message`'s contract is precisely to be written into `metadata.json`. Rewritten as AC-18: the decoy set is `prompt`/`engineOutput`/`validationOutput`, and `failure.message` is explicitly excluded with the rationale stated.
2. **`<ts>` sourcing was unspecified.** An adapter-internal `Date.now()` would have broken the codebase's injectable-clock convention, allowed the directory name and `metadata.startedAt` to disagree, and made tests racy. New D7: the adapter is clockless; `<ts>` derives from `record.startedAtEpochMs`. New AC-14.
3. **`startedAt`'s record type was never fixed.** Now `startedAtEpochMs: number` (AC-2), rendered to ISO in metadata and compact form in the path — one source, three representations.
4. **`ReviewDiff` wholesale persistence was an unstated hazard**: `files[].content` carries full per-file diff text, so serializing `record.diff` as-is would duplicate the entire diff inside `metadata.json`. New D8 (summary-only) and AC-10 pin this with a marker test.
5. **First-save directory creation and stale-staging retry were unspecified.** New AC-15 (recursive create) and the AC-14 retry clause (clear only the same timestamp's remnant).
6. AC-19 additionally forbids a leading `.` in `repoName`, making "skip dot-entries" the single scanning rule at both levels of `runs/` for `[E5.F2.H2]`.

## Approval Notes

- Scope is `[E5.F2.H1]` / issue #33 alone. Its only declared dependency, `[E4.F1.H1]` (#26), is merged.
- The single most consequential claim to check before approving: **this story does not touch `src/core/run/**` at all** (AC-3). If ratification of D1 goes the other way — i.e. `runReview` should grow `harness`/`branch`/`duration` result fields — the scope boundary, AC-2 and AC-3 all change materially, and spec must be amended before design.
- Recommended next stage: `sddl-design`, which should fix the adapter's internal layout (path derivation, serializer, staging sequence with its best-effort cleanup), the `RunRecord` → `metadata.json` serialization function (the natural home for AC-4/AC-10/AC-18's guarantees — a hand-written field-by-field serializer is what makes wholesale serialization impossible rather than merely discouraged), and the split of assertions between the portable contract suite and the fs-adapter test.
