# Spec

## Routing Digest

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- spec_status: complete (18 acceptance criteria; three B-level decisions resolved with recommendations, pending ratification at `cp-spec-approval`)
- digest_summary: Define the `RunStore` driven port in `src/core/history/ports/`, the `RunRecord` domain shape it persists, the module's error family, and a filesystem adapter (`run-store-fs.ts`) writing `runs/<repo>/<ts>/` as plain files — `result.md`, `prompt.md`, `metadata.json`, `validations/NNN.log`. The port has exactly one method, `save`. `runReview` is not modified. Atomicity comes from staging inside the runs root and a single `rename`, so a directory that exists is always complete and a crash leaves an identifiable partial.

## Summary

The `history` core module gains its first real content. Issue #33's three checklist items become enforceable criteria: plain readable files (AC-4..AC-9), no secrets on disk (AC-13..AC-15), and an atomic write whose partials are identifiable (AC-10..AC-12).

The proposal's six open questions are all resolved below. Three were B-level; each is answered with a stated recommendation and recorded as a decision requiring ratification before design.

## Resolved Decisions (from proposal's open questions)

| # | Question | Resolution | Level |
|---|---|---|---|
| D1 | Where do `harness`, `branch`, `duration` come from? | **The caller composes a `RunRecord`.** `save(record)` takes an already-composed value; `runReview` is untouched and grows no fields. | **B** |
| D2 | Who calls the store? | **Nobody, in this story.** Port + adapter ship without a caller; wiring is `E6.F1`. | **B** |
| D3 | Atomicity over a directory | **Staging directory inside the runs root + one `rename`.** No completion marker. | **B** |
| D4 | Precise redaction rule | Never persist a raw exception or any environment. `failure` is recorded as `{ stage, message }` with a sanitized message. | A/B |
| D5 | What is `<repo>` | The `repos.yaml` **registry key** (repo name), supplied by the caller and validated as a single safe path segment. | A/B |
| D6 | Does the port need a read method? | **No.** `save` only. `list`/`get` are `[E5.F2.H2]`'s design. | A |

### Why D1 is (a) and not (b) or (c)

Option (b) — growing `RunReviewResult` one field per missing datum — is what `[E4.F2.H3]` did for `engineName`, and its own artifacts recorded that as a compromise made *because no store existed*. Repeating it three more times would make `runReview` responsible for measuring wall-clock duration, which it does not do today and which is genuinely the caller's concern (the caller owns the clock around the call). Option (c) — passing request and result into the store — would make `history` depend on `run`'s **request** shape, coupling a persistence port to an orchestration input. Option (a) leaves `runReview` byte-identical and keeps the coupling one-directional: `history` imports `TerminalState`, `Verdict` and `RunStage` from `run`'s public barrel, which the architecture guards permit.

### Why D3 stages inside the runs root

`mkdtemp` in the OS temp dir is the reflex, but `rename` across filesystems fails with `EXDEV`, and `os.tmpdir()` is routinely a different mount. Staging at `runs/<repo>/.partial-<ts>/` guarantees the same filesystem. It also answers "partial run identifiable" for free: a completed run directory is only ever created by an atomic `rename`, so **a directory whose name is not `.partial-` prefixed is always complete**, and a reader needs no marker file and no knowledge of a write order. `[E5.F2.H2]`'s "corrupt/partial runs listed with mark" then has a mechanical signal to read.

## Scope Boundary

### In Scope

- `src/core/history/ports/run-store.ts` — the `RunStore` port and the `RunRecord` / `RunFailureRecord` domain shapes.
- `src/core/history/history-errors.ts` — `RunPersistenceError`, `InvalidRunRecordError`, `RunAlreadyExistsError`.
- `src/core/history/index.ts` — becomes a real barrel replacing the `export {}` placeholder.
- `src/adapters/driven/storage/run-store-fs.ts` — `createRunStoreFsAdapter(runsRoot: string): RunStore`.
- `src/adapters/driven/storage/__test__/RunStore.contract.ts` — shared port-level contract suite.
- `src/adapters/driven/storage/__test__/run-store-fs.test.ts` — adapter tests asserting the on-disk layout, atomicity and redaction.
- Export of the new adapter from `src/adapters/driven/storage/index.ts`.

### Out Of Scope

- `listRuns` / `getRun` use cases — `[E5.F2.H2]` (#34).
- Cost/tokens per run — `[E5.F2.H3]` (#35), ⚪ optional, skipped per workflow contract rule 7.
- Running validations — `E5.F1` (#31, #32). This story persists strings it is handed.
- Composition-root wiring — `E6.F1`. No file under `src/main/` is touched.
- Retention, pruning, size caps on `runs/`.
- Any modification to `src/core/run/**`, including `runReview`, its request, its result, and its pipeline.

### Non-Goals

- Not a general-purpose object store. `save` persists one run.
- Not a concurrency-control mechanism. Two runs colliding on the same directory name is an error, not a merge.
- Not a schema-versioned format. `metadata.json` carries a `version` field so a future reader can branch, but no migration machinery ships here.

## Expected Behavior

### On-disk layout

```
<runsRoot>/<repo>/<ts>/
  result.md              # engineOutput verbatim; omitted when the engine stage never produced output
  prompt.md              # the exact prompt sent; omitted when the prompt stage never completed
  metadata.json          # always present
  validations/001.log    # one file per validationOutput entry; directory omitted when there are none
```

`<ts>` is compact ISO-8601 UTC with milliseconds and no separators — `20260822T131000123Z`. It is human-readable, filesystem-legal on Windows (no colons), and lexicographically sortable, which is what `[E5.F2.H2]`'s "chronological order" criterion needs without parsing.

### Precedence and failure table

| Scenario | Behavior |
|---|---|
| Valid record, target directory free | Files staged under `<runsRoot>/<repo>/.partial-<ts>/`, then one `rename` to `<runsRoot>/<repo>/<ts>/`. Resolves with the run directory path. |
| `record.repoName` empty, or containing `/`, `\`, or equal to `.` / `..` | `InvalidRunRecordError`. Nothing is written, no staging directory is created. |
| Target `<ts>` directory already exists | `RunAlreadyExistsError`. The existing run is never overwritten or merged. |
| Any fs failure during staging | `RunPersistenceError` with `cause`. The staging directory is removed on a best-effort basis; a leftover `.partial-` directory is not a correctness failure. |
| `rename` fails | `RunPersistenceError`. No complete run directory exists, so no reader can observe a partial as complete. |
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
  "diff": { "totalLines": 412, "estimatedTokens": 5100, "truncated": false },
  "usage": { "inputTokens": 4800, "outputTokens": 900, "totalTokens": 5700 },
  "failure": { "stage": "engine", "message": "Engine exited with code 1" }
}
```

`verdict`, `usage`, `diff` and `failure` are omitted when the corresponding datum is absent. `engine` is sourced from `[E4.F2.H3]`'s `engineName`; `harness`, `baseRef`, `targetRef`, `startedAt` and `durationMs` come from the caller under D1.

## Acceptance Criteria

**Port and domain shape**

- **AC-1** — `src/core/history/ports/run-store.ts` declares `RunStore` with exactly one method: `save(record: RunRecord): Promise<string>`, resolving with the absolute path of the created run directory.
- **AC-2** — `RunRecord` carries every metadata field the backlog names. `repoName`, `startedAt`, `durationMs`, `harness`, `baseRef`, `targetRef` and `state` are required; `engine`, `verdict`, `prompt`, `engineOutput`, `diff`, `usage`, `validationOutput` and `failure` are optional.
- **AC-3** — `src/core/history/index.ts` exports the port, the record types and the error family, and no longer contains `export {}`. `src/core/run/**` is byte-for-byte unchanged; a diff of that directory over the whole story is empty.

**Plain-file readability (issue #33, item 1)**

- **AC-4** — A saved run produces `metadata.json` whose parsed object has exactly the field names in the Expected Behavior table, with absent data omitted rather than set to `null`.
- **AC-5** — `result.md` contains `record.engineOutput` byte-for-byte, with nothing prepended or appended.
- **AC-6** — `prompt.md` contains `record.prompt` byte-for-byte.
- **AC-7** — Each `validationOutput` entry is written to `validations/NNN.log` in order, zero-padded to three digits from `001`.
- **AC-8** — Each of `result.md`, `prompt.md` and `validations/` is omitted entirely when its source datum is absent or empty; the run directory is still created and `metadata.json` is still written.
- **AC-9** — Two runs saved for the same repo sort chronologically by directory name under a plain lexicographic string sort, with no timestamp parsing.

**Atomicity (issue #33, item 3)**

- **AC-10** — Files are staged under `<runsRoot>/<repo>/.partial-<ts>/` and moved into place by a single `rename`. A test that injects a failure after some files are staged proves no directory exists at the final path.
- **AC-11** — The staging directory is a sibling of the final directory, under the same `runsRoot`, so the `rename` cannot cross a filesystem boundary.
- **AC-12** — `save` rejects with `RunAlreadyExistsError` when the target directory already exists, and the pre-existing directory's contents are unmodified.

**No sensitive data (issue #33, item 2)**

- **AC-13** — `RunRecord.failure` is typed `{ stage: RunStage; message: string }`, reusing `RunStage` from `src/core/run/index.js` rather than a loose `string`, so the persisted stage name cannot drift from the pipeline's own vocabulary. It is structurally impossible to hand the store a raw exception, so no stack trace, `cause` chain, or spawned command line can reach disk through this path.
- **AC-14** — No adapter code path reads `process.env` or writes any environment-derived value.
- **AC-15** — A test saves a record whose every optional string field contains a decoy secret-looking token, then asserts that the token appears **only** in the files whose contract is to carry it verbatim (`result.md`, `prompt.md`, `validations/*.log`) and never in `metadata.json`. This test must fail if a future edit serialized the record wholesale into metadata.

**Validation and errors**

- **AC-16** — `save` rejects with `InvalidRunRecordError`, before creating any directory, when `repoName` is empty, contains `/` or `\`, or is `.` or `..`. Path traversal cannot escape `runsRoot`.
- **AC-17** — Every raw fs failure is translated into `RunPersistenceError` with the original preserved in `cause`. No caller ever sees a raw `ENOENT`/`EACCES`.

**Architecture and quality**

- **AC-18** — `npm run check` and `npm test` are green. `src/core/history/**` imports nothing from `src/adapters/**` or `src/main/**`; it imports `run`'s types only through `src/core/run/index.js`. The adapter is exported from the storage barrel and instantiated nowhere.

## Risks And Trade-offs

| Risk | Assessment |
|---|---|
| Shipping a port with no caller | Accepted, and precedented one story ago: `[E4.F2.H3]` shipped `resolveEngine` uncalled for the same reason (`E6.F1` owns wiring). The cost is that the first real end-to-end use may reveal an awkward `RunRecord` field; the mitigation is that `RunRecord` is a plain data shape, cheap to amend before it has consumers. |
| Thin contract suite | Real. With a write-only port, `RunStore.contract.ts` can only assert behavior observable through `save` (resolution, error classes, traversal rejection); the on-disk assertions necessarily live in the fs-adapter test, which is not portable to a future sqlite store. Adding `read` now would fix this but would pre-empt `[E5.F2.H2]`'s design. Accepted deliberately, and `[E5.F2.H2]` is the natural place the suite thickens. This trade-off is stated rather than hidden — the suite is thin by choice, not by oversight. |
| `<ts>` collision within the same millisecond | Two runs for one repo starting in the same millisecond collide and the second gets `RunAlreadyExistsError`. Judged acceptable: reviews take seconds to minutes, and erroring is strictly safer than overwriting a run. `[E5.F2.H2]` would surface it plainly if it ever occurred. |
| `repoName` is caller-supplied and unverified against `repos.yaml` | The store validates the string is a safe path segment (AC-16) but cannot confirm the repo is registered — `history` has no `ConfigStore` dependency and giving it one to satisfy a naming check would be disproportionate coupling. |
| Leftover `.partial-` directories | A crash between staging and rename leaves one. By design this is the "partial run identifiable" signal, not a defect. Nothing in this story cleans them up; if that becomes desirable it belongs with retention, which is out of scope. |

## Open Questions

None blocking design. D1–D6 are resolved above; D1, D2 and D3 are B-level and carried to `cp-spec-approval` for ratification.

## Approval Notes

- Scope is `[E5.F2.H1]` / issue #33 alone. Its only declared dependency, `[E4.F1.H1]` (#26), is merged.
- The single most consequential claim to check before approving: **this story does not touch `src/core/run/**` at all** (AC-3). If ratification of D1 goes the other way — i.e. `runReview` should grow `harness`/`branch`/`duration` result fields — the scope boundary, AC-2 and AC-3 all change materially, and spec must be amended before design.
- Recommended next stage: `sddl-design`, which should fix the adapter's file layout, the staging/rename sequence including its best-effort cleanup, and the `RunRecord` → `metadata.json` serialization function (the natural home for AC-15's guarantee, since a hand-written serializer is what makes wholesale serialization impossible rather than merely discouraged).
