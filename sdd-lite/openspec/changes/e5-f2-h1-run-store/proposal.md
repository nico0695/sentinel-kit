# Proposal

## Routing Digest

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- digest_summary: Give the `history` core module its first real content — the `RunStore` driven port (PRD §4.3) and a filesystem-backed adapter under `src/adapters/driven/storage/` — so that a completed run stops evaporating in memory and lands on disk as `runs/<repo>/<ts>/` in plain files: the md result, the exact prompt used, a json metadata document, and validation logs. Issue #33's three acceptance criteria are the shape of the whole story: readable without the tool, nothing sensitive persisted, atomic write with partial runs identifiable.
- feasibility_signal: medium-high — the port/adapter/contract-suite pattern is thoroughly precedented (`ConfigStore` + `config-store-yaml.ts` + `ConfigStore.contract.ts` is a direct structural template), and `RunReviewResult` already carries most of what must be persisted. The genuine unknowns are not mechanical: what the metadata record contains when `RunReviewResult` does not carry three of the five fields the backlog names, how atomicity is achieved on a *directory* of files rather than one file, and who calls the store.
- scope_sketch_digest: IN = `RunStore` port in `core/history/ports`, the persisted record's domain shape, a filesystem adapter writing `runs/<repo>/<ts>/`, atomic-write strategy, an explicit no-secrets rule with a test that pins it, and a shared `RunStore.contract.ts` suite. OUT = `listRuns`/`getRun` use cases (`[E5.F2.H2]`, #34, depends on this), cost/tokens (`[E5.F2.H3]`, ⚪ optional), validations (`E5.F1`), composition-root wiring (`E6.F1`), and any change to `runReview`'s pipeline.

## Summary

- change_name: e5-f2-h1-run-store
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (six open questions, three of them material)
- exploration_performed: true

## Problem And Desired Outcome

`src/core/history/index.ts` is a three-line placeholder that exports nothing and says so: *"Its driven port (RunStore) lands under ./ports in E5.F2.x."* That is this story.

Today `runReview` assembles a genuinely valuable artifact — terminal state, verdict, the exact prompt sent to the engine, raw engine output, diff statistics, usage — and then returns it into memory, where it dies with the process. PRD §3.1-F requires the opposite ("persist each run: md result + prompt used + metadata + validation logs"), and the PRD glossary *defines* a Run as "a review execution, **fully persisted**". The gap between the definition and the code is the problem.

The backlog frames the goal as **"self-contained run — requirement for the future daemon"**, and that framing is load-bearing: a daemon, or a second process, or a human with `cat`, must be able to reconstruct what happened without the tool being running and without a database. Issue #33's three checklist items are the concrete tests of that:

1. **Run readable without the tool (plain files)** — md and json on disk, no binary format, no index that must be replayed.
2. **Nothing sensitive persisted (no tokens/env)** — PRD §7 risk #6 states plainly that "each engine's auth is the user's responsibility and is **never persisted in runs/logs**". Once runs land on disk this stops being a property that happens to hold and becomes one that must be enforced and tested.
3. **Atomic write (partial run identifiable)** — a crash mid-persist must not produce a directory that later reads as a complete, trustworthy run.

Desired outcome: `[E5.F2.H2]` (#34, `listRuns`/`getRun`) can be built on a store that already exists, and `E6` can show a user their history.

## Initial Scope Sketch

### Likely In Scope

- **`RunStore` port** under `src/core/history/ports/`, owned by `history` (PRD §4.3 assigns it there explicitly), plus the domain shape of a persisted run record and the module's error family. `core/history/index.ts` becomes a real barrel.
- **The persisted layout**, fixed as an acceptance criterion rather than left to the adapter: `runs/<repo>/<ts>/` containing the md result, the prompt, a json metadata document, and validation logs. Because AC-1 is "readable without the tool", the file names and the json field names are a **user-facing contract**, not an implementation detail.
- **A filesystem-backed adapter** under `src/adapters/driven/storage/`, alongside the existing `config-store-yaml.ts` and `harness-loader-fs.ts`, translating raw fs failures into port errors — the discipline both existing storage adapters already follow.
- **Atomic-write strategy** for a multi-file directory, and a defined way for a reader to tell a complete run from a partial one.
- **An explicit redaction/omission rule** for what must never reach disk, pinned by a test rather than asserted in a comment.
- **`RunStore.contract.ts`**, a shared contract suite in `src/adapters/driven/storage/__test__/`, mirroring `ConfigStore.contract.ts` — so a future store (sqlite, remote) is held to the same behavior.

### Likely Out Of Scope

- **`listRuns` / `getRun` use cases** — that is `[E5.F2.H2]` (#34), which depends on this story. Whether the *port* needs a read method to make the write testable is a spec question (see Open Questions); the *use cases* are not this story.
- **Cost/tokens per run** — `[E5.F2.H3]` (#35) is ⚪ optional, skipped per workflow contract rule 7. `RunReviewResult.usage` may be persisted if it falls out naturally, but no work is done to obtain it.
- **Validations and their logs' content** — `E5.F1` (#31, #32) owns producing validation output. This story persists the `validationOutput` seam that `RunReviewRequest` already declares; it does not run anything.
- **Composition-root wiring** — instantiating the adapter is `src/main/`, i.e. `E6.F1`. Same boundary `[E4.F2.H3]` deliberately respected for `resolveEngine`.
- **Any change to `runReview`'s pipeline shape.** If persistence turns out to require calling the store from inside `runReview`, that is a design decision with real architectural weight (see Open Questions) and must be spec'd, not smuggled in.
- **Retention, pruning, or size caps** on `runs/`. Not in the backlog, not in the PRD.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Port + adapter + contract-suite pattern | Directly precedented three times over (`ConfigStore`/`config-store-yaml`, `HarnessLoader`/`harness-loader-fs`, `ReviewEngine`/two engine adapters). `ConfigStore.contract.ts` is a structural template requiring no invention. | high |
| Source data availability | `RunReviewResult` already carries `state`, `verdict`, `prompt`, `engineOutput`, `diff`, `usage`, `failure`, `cleanup` — the md result and the prompt are directly at hand. | high |
| Module placement | PRD §4.3's port catalog and `docs/architecture.md:66` both assign `RunStore` to `history`, backed by `storage`. `src/core/history/index.ts` already documents its own arrival. No ambiguity. | high |
| Metadata completeness | **The backlog names five metadata fields — engine, harness, branch, state, duration — and `RunReviewResult` carries two (`state`, and `engineName` from the just-merged `[E4.F2.H3]`).** `harnessType` and `targetRef` live on the *request*; duration lives nowhere. This is the story's first real design problem, not a detail. | medium |
| Atomicity on a directory | Single-file atomic replace (`write tmp` → `rename`) is a solved idiom; a *directory* of four files is not the same problem. Needs a decided strategy (staging dir + one rename, or a completion marker written last), which is spec-able but genuinely open. | medium |
| "Nothing sensitive" as a testable property | The prompt legitimately contains the repo's own source diff — that is the point, not a leak. The real hazards are narrower and need naming: `failure.error` is typed `unknown` and may be a raw exception whose message or stack carries a command line or environment, and engine adapters spawn processes with env. Provable, but only once the rule is precise. | medium |

## Judgment Calls Made Autonomously (for orchestrator ratification)

- **Treat `[E5.F2.H3]` (cost/tokens, ⚪) as out of scope without asking.** Workflow contract rule 7 is unambiguous: optional stories are skipped unless explicitly requested.
- **Do not open `runs/` retention or pruning.** Neither the PRD nor the backlog mentions it; inventing a retention policy here would be scope expansion of exactly the kind rule 8 forbids.
- **Reuse the existing `storage` adapter folder rather than creating a new one.** `RunStore`'s backing technology in PRD §4.3's own catalog is `storage`; a sibling `runs/` adapter directory would fragment a layer for no stated reason.

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **Where do `harness`, `branch` and `duration` come from?** The backlog requires five metadata fields; `RunReviewResult` carries only `state` and `engineName`. (`engine` is already sourced — `[E4.F2.H3]`'s `engineName` echo exists for exactly this reason.) Options: (a) the `RunStore.save` input is a composed record the *caller* builds from request + result, keeping `runReview` untouched; (b) `runReview` grows a result field per missing datum, as `[E4.F2.H3]` did for `engineName`; (c) the store receives request and result and composes internally, coupling `history` to `run`'s request shape. This single choice determines the port's signature and how much of `run` this story touches. | **open, B-level** |
| **Who calls the store?** Nothing calls `runReview` yet either — there is no composition root. Persisting *inside* `runReview` would give the pipeline a ninth stage and an I/O dependency it has carefully avoided; persisting *outside* keeps `runReview` pure but means this story ships a store with no caller, exactly as `[E4.F2.H3]` shipped `resolveEngine` with no caller. The latter is precedented and consistent; it should still be a stated decision. | **open, B-level** |
| **What makes a directory-write atomic, and how is a partial run identified?** Staging directory + single `rename` (atomic per-run, but the temp location must share a filesystem with the target) versus writing files in a fixed order with a completion marker last (simpler, but a reader must know the rule). AC-3's "partial run identifiable" is satisfiable by either, differently. | **open, B-level** |
| **Precise redaction rule.** "Nothing sensitive" needs a decidable definition. Proposal for spec: persist no `process.env` in any form, and never persist a raw exception object — a failure is recorded as its stage plus a sanitized message, not a serialized `unknown`. Needs confirming, and pinning with a test that would fail if a future edit serialized `failure.error` wholesale. | open, A/B-level |
| **What is `<repo>` in `runs/<repo>/<ts>/`?** `RunReviewRequest.repoPath` is an absolute filesystem path; `repos.yaml` entries have names. A path cannot be a directory segment as-is, and a basename collides across two repos of the same name. Affects AC-1 (a human must be able to find their repo's runs). | open, A/B-level |
| **Does the port need a read method now?** `getRun` is `[E5.F2.H2]`'s use case, but a write-only port is awkward to contract-test and AC-1's "readable" arguably wants proof-by-reading. Reading files directly in tests keeps the port minimal; adding `read` risks pre-empting #34's design. | open, A-level |

## Contradictions Found

- **None blocking.** One inherited-context note worth recording: `[E4.F2.H3]` (#30, PR #68) merged into `main` as `4497f01` while this proposal was being written, and this branch was fast-forwarded onto it before any commit. That story added an `engineName` echo field to `RunReviewRequest`/`RunReviewResult` explicitly as a stand-in *because no `RunStore` existed*, naming this story as the follow-up that would persist the engine for real. So `result.engineName` **is** available here — it partially answers the metadata-source question below for the `engine` field specifically, and spec should treat that field as already-sourced rather than re-deriving it. `harness`, `branch` and `duration` remain unsourced.
- No contradiction between the PRD, the backlog, and the current code.

## Approval Notes

- Scope is `[E5.F2.H1]` / issue #33 alone, the first story of the E5 milestone. Its only declared dependency, `[E4.F1.H1]` (#26, `runReview`), is merged.
- Branch: `claude/e5-f2-h1-run-store`, cut from `origin/main` on explicit user instruction and fast-forwarded to `4497f01` once PR #68 merged. 0 open PRs at the time of writing, well within the max-5 limit.
- Recommended next stage: `sddl-spec`, which must resolve the three **B-level** questions above — the metadata source, the store's caller, and the atomicity strategy — as firm acceptance criteria before any design work. The first two are genuine architectural forks, not preferences, and getting them wrong is what would force a `runReview` change this story has no mandate to make.

## Budget Notes

- Lite artifact. One new core port with its record shape and error family, one new filesystem adapter, one shared contract suite. Comparable in size to `[E2.F2.H1]` (`ConfigStore` schemas + persistence), with more up-front design risk concentrated in the three B-level questions and less mechanical novelty.
