# Proposal

## Routing Digest

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- digest_summary: Give `history` its read side — `listRuns` and `getRun` use cases over the `RunStore` port and the on-disk layout `[E5.F2.H1]` just built (`runs/<repo>/<ts>/`). Today `RunStore` is write-only (`save()` alone); this story adds the read surface the port needs, plus the two use cases the CLI's future `runs list|show` (`[E6.F1.H1]`) depends on. Issue #34's two acceptance criteria are the shape of the story: chronological order, and corrupt/partial runs surfaced with a marker rather than breaking the whole listing.
- feasibility_signal: medium-high — `listRepos`/`listBranches` (`[E2.F2.H3]`) are a direct structural template for a read-only, dependency-injected use case over a driven port, and the on-disk layout (`<ts>` directories, `metadata.json`, the `.partial-<ts>` staging convention) is already fully specified by `[E5.F2.H1]`'s design and code. The genuine unknown is not mechanical: what "corrupt/partial, listed with a marker" means precisely, given that `[E5.F2.H1]`'s own scanning convention already treats a leading dot (`.partial-<ts>`) as something to skip, not surface.
- scope_sketch_digest: IN = `RunStore` gains a read method (or two), `listRuns`/`getRun` use cases in `src/core/history/`, a `RunSummary`-shaped listing entry, a defined marker for a corrupt/partial run. OUT = cost/tokens (`[E5.F2.H3]`, ⚪ optional), CLI wiring (`runs list|show` is `[E6.F1.H1]`, depends on this), any change to `RunStore.save()` or the write-side layout, pagination/filtering beyond "list all runs for a repo in order."

## Summary

- change_name: e5-f2-h2-query-history
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (four open questions, two of them material)
- exploration_performed: true

## Problem And Desired Outcome

`[E5.F2.H1]` gave `history` a `RunStore` that can persist a run to `runs/<repo>/<ts>/`, but nothing can read one back. `src/core/history/index.ts`'s own doc comment already names this story as the reason: *"`listRuns`/`getRun` use cases land in `[E5.F2.H2]`."* Until they exist, every run written to disk is exactly as unreachable as before `[E5.F2.H1]` — durable, but write-only.

The backlog (`docs/backlog-mvp-sentinel.md:289-293`) frames the goal precisely: `listRuns` returns a per-repo listing (date, branch, harness, state, verdict) and `getRun` retrieves one complete run. Two acceptance criteria make that concrete:

1. **Chronological order** — the on-disk `<ts>` directory names are already lexicographically sortable as chronological (`[E5.F2.H1]`'s `formatRunTimestamp`), so this is a listing-order guarantee, not a sort-algorithm problem.
2. **Corrupt/partial runs listed with a marker, without breaking the listing** — a scan that throws on the first bad entry defeats the point of a history feature (the user could not see *any* run, including the good ones, after one bad write). This acceptance criterion is the story's real design question: what counts as "corrupt/partial," and what does a caller see for it.

Desired outcome: `E6`'s `sentinel runs list` and `sentinel runs show` (`[E6.F1.H1]`, which depends on this story) have real use cases to call, with zero logic of their own per the workflow contract's use-case discipline.

## Initial Scope Sketch

### Likely In Scope

- **A read surface on `RunStore`** (`src/core/history/ports/run-store.ts`) — the port currently declares only `save()`; this story adds what `listRuns`/`getRun` need (likely `list(repoName)` returning per-run summaries, and `get(repoName, id)` returning one full record — exact shape is a spec question).
- **`listRuns` and `getRun` use cases** in `src/core/history/`, mirroring `listRepos`/`listBranches`'s shape: a thin function taking a request plus injected deps (`{ store: RunStore }`), delegating everything to the port.
- **A `RunSummary`-like domain type** for a listing entry — the backlog's five listed fields (date, branch, harness, state, verdict) are a subset of the full `RunRecord`; whether the port returns full records for `list()` too (letting the use case project) or a narrower summary type is a design/spec choice.
- **A precise, testable definition of "corrupt/partial"** and the marker a caller sees for it — extending the fs adapter (`run-store-fs.ts`) to implement the read side against the existing `.partial-<ts>` / `<ts>` layout.
- **A `RunStore.contract.ts` extension** for the new read method(s), continuing the shared-suite discipline `[E5.F2.H1]` established (currently thin by design per that story's own `risk-004`, explicitly deferred to "when `[E5.F2.H2]` thickens it").

### Likely Out Of Scope

- **Cost/tokens per run** — `[E5.F2.H3]` (#35) is ⚪ optional, skipped per workflow contract rule 7.
- **CLI wiring** (`sentinel runs list|show`) — that is `[E6.F1.H1]` (#36), which the backlog itself marks as depending on this story.
- **Any change to `RunStore.save()` or the write-side layout/atomicity** — this story only reads what `[E5.F2.H1]` already writes.
- **Pagination, filtering, or querying beyond "all runs for one repo, in order."** Not named in the backlog's two acceptance criteria.
- **Cross-repo listing** (all repos at once). The backlog says "listing per repo," singular.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Use-case pattern | `listRepos`/`listBranches` (`[E2.F2.H3]`) are a direct structural template: thin function, injected port dependency, no logic beyond delegation and light shaping. | high |
| On-disk layout availability | `[E5.F2.H1]`'s `run-layout.ts`/`run-store-fs.ts` fully define the directory structure, `metadata.json` schema, and the `.partial-<ts>` staging convention this story must read against. Nothing to invent here. | high |
| Chronological order | `formatRunTimestamp` already produces lexicographically-sortable directory names (verified by `[E5.F2.H1]`'s own tests), so ordering is a `readdir` + string-sort, not new machinery. | high |
| "Corrupt/partial, with a marker" precision | Genuinely open. `[E5.F2.H1]`'s AC-19 already treats a leading-dot entry (`.partial-<ts>`, a crash-interrupted `save()`) as something a scanner *skips*, not surfaces — the opposite of what this AC asks for. Separately, a `<ts>` directory with unreadable or schema-invalid `metadata.json` (disk corruption, manual tampering, a future format change) is a different failure mode with no existing precedent. The story must decide which of these — or both — "corrupt/partial" covers, and what a caller receives for each. | medium |
| Port read-method shape | Whether `list()` returns full `RunRecord`s or a narrower summary, and whether `get()` is a separate method or `list()` with a filter, is undecided. Low implementation risk either way once chosen; genuinely a B-level design fork. | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **What does "corrupt/partial, listed with a marker" mean precisely?** Two distinct failure modes exist on disk: (a) a `.partial-<ts>` staging leftover from a crashed `save()` — currently the AC-19 scanning convention *skips* dot-prefixed entries rather than surfacing them; (b) a `<ts>` directory that completed its atomic rename but whose `metadata.json` is unreadable or fails schema validation. The AC could mean either, or both, and the two need different handling (a partial run has no valid `metadata.json` to read fields from at all). | **open, B-level** |
| **What shape does `RunStore`'s read side return?** Options: (a) `list()` returns full `RunRecord[]` and the use case projects the five listing fields; (b) `list()` returns a narrower `RunSummary[]` and `get()` returns the full `RunRecord`, keeping the port's two methods aligned with the two use cases' actual needs. Determines the port signature and how much the fs adapter must parse just to produce a listing. | **open, B-level** |
| **Does `getRun` return `engineOutput`/`prompt`/`validationOutput` bodies, or paths to them?** `metadata.json` does not contain the md result or prompt text — those are separate files (`result.md`, `prompt.md`, `validations/*.log`) per `[E5.F2.H1]`'s layout. `getRun` "retrieving a complete run" could mean reading all of them into memory, or returning a record plus file paths for a caller (e.g. a future TUI) to read on demand. | open, A/B-level |
| **Does `list()` need to work if `runs/<repo>/` does not exist yet** (no run ever persisted for that repo)? Almost certainly an empty list rather than an error, but worth pinning as an AC rather than leaving implicit. | open, A-level |

## Contradictions Found

- **None blocking.** One worth flagging explicitly for spec: issue #34's acceptance criterion ("corrupt/partial runs listed with a marker") reads, on a literal interpretation of "partial," as being in tension with `[E5.F2.H1]`'s own AC-19 convention of skipping dot-prefixed staging directories during any scan. This is not a bug in the prior story — `[E5.F2.H1]` only had to define scanning for its own collision check, not for a full listing — but spec must decide explicitly whether this story's scan treats `.partial-<ts>` entries differently than `[E5.F2.H1]`'s did, and say why.

## Approval Notes

- Scope is `[E5.F2.H2]` / issue #34 alone. Its only declared dependency, `[E5.F2.H1]` (#33, `RunStore.save()` and the fs layout), is merged to `main`.
- Branch: `claude/e5-f2-h2-query-history`, cut fresh from `origin/main` (includes the merged `[E5.F2.H1]` PR #69). 0 open PRs at the time of writing, well within the max-5 limit.
- Recommended next stage: `sddl-spec`, which must resolve the two B-level questions above — the corrupt/partial definition and the port's read-method shape — as firm acceptance criteria before any design work.

## Budget Notes

- Lite artifact. One port extension (read method(s) on the existing `RunStore`), two small use cases, one new domain type, one fs-adapter extension, one contract-suite extension. Comparable in size to `[E2.F2.H3]` (`listRepos`/`listBranches`), with the open design fork concentrated in defining "corrupt/partial" rather than in mechanical novelty.
