# Proposal

## Routing Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    Story [E4.F2.H3] (issue #30): a pure resolution function selecting which
    ReviewEngine a run uses, per PRD §3.1-D / §6.2's cascade — global default
    (`config.yaml`) → per-repo override (`repos.yaml`) → per-run override
    (`--engine`) — validating the resolved name against the engines actually
    wired, and recording which engine was used in run metadata.
- feasibility_signal: high confidence, low risk
- scope_sketch_digest: >-
    In scope: a core resolution function/use case + its own validation error;
    exposing "which engine ran" on `RunReviewResult`. Out of scope: any new
    engine, `RunStore`/history persistence (not yet built), and CLI/TUI
    wiring beyond passing the resolved choice through (composition root work
    belongs to `E6.F1`).

## Summary

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- proposal_status: complete
- exploration_performed: true

## Problem And Desired Outcome

Both engine adapters exist (`[E4.F2.H1]` claude-code, merged; `[E4.F2.H2]`
opencode, PR #67 open) but nothing in the core selects between them. Today a
caller of `runReview` must already hold a concrete `ReviewEngine` instance —
there is no resolution step translating "global default / per-repo override /
per-run override" into "here is the engine to use", and no unknown-engine
validation. `GlobalConfigSchema.defaultEngine` and `RepoEntrySchema.defaultEngine`
(`src/core/repos/ports/config-schemas.ts`) already model the first two cascade
levels as zod-validated `"claude-code" | "opencode"` enums; the per-run
override (a `--engine` CLI flag) and the resolution logic tying all three
together do not exist yet. `RunReviewResult` also has no field recording which
engine actually ran a given review.

Desired outcome: a pure, core-owned resolution function that takes the three
cascade inputs (global config, repo override, run override) and returns
either a validated engine name or a clear "unknown engine" validation error —
plus a way for the caller of `runReview` to learn which engine was used,
satisfying issue #30's two acceptance criteria ("cascade respected with
tests", "engine used recorded in run metadata").

## Initial Scope Sketch

### Likely In Scope

- A pure resolution function/use case (precedence: run override > repo
  override > global default), validating the resolved value against the set
  of engines the composition root actually knows how to construct.
- A dedicated validation error for an unrecognized engine name, wired into
  `runReview`'s existing `classifyFailure` → `validation-failed` path (or an
  equivalent pre-flight the caller runs before invoking `runReview`).
- Exposing the resolved/used engine identifier somewhere inspectable from a
  completed run (exact shape — `RunReviewRequest` input vs. `RunReviewResult`
  output field — is a spec-level decision, not decided here).
- Unit tests covering the three-level cascade and the unknown-engine case.

### Likely Out Of Scope

- Any new `ReviewEngine` implementation — both engines already exist.
- `RunStore`/history persistence — that core module does not exist yet in
  this repo (confirmed: no `src/core/history/`); "recorded in run metadata"
  is scoped to the in-memory result shape this story can actually touch.
- CLI/TUI `--engine` flag parsing and composition-root engine-name-to-adapter
  wiring — `src/adapters/driving/cli/index.ts` is still a scaffold stub, and
  that wiring is `E6.F1` territory (scripting mode, issue's own dependency
  chain: `E6.F1.H1` depends on `E4.F2.H3`, not the other way around).

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Schema readiness | `GlobalConfigSchema.defaultEngine` and `RepoEntrySchema.defaultEngine` already exist and validate against the same `["claude-code","opencode"]` enum — the cascade's first two levels are pre-modeled, no schema design needed. | high |
| Core precedent | `runReview`'s existing pattern (pure pipeline stage + a dedicated `*Error` class feeding `classifyFailure`) is a direct template for an "engine resolution" stage/error. | high |
| Dependency status | Depends on `[E4.F2.H1]` (merged) and `[E4.F2.H2]` (PR #67 open, not yet merged) per the backlog. Resolution logic itself does not need the adapters merged to be designed/implemented against the `ReviewEngine` port, but the story's own AC framing implies both engines exist — worth flagging for spec. | medium |
| Scope boundary | No `RunStore`/history module exists yet, so "recorded in run metadata" needs spec to pin down exactly what surface this story can honestly claim (result field vs. a store write). | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Where does the per-run override (`--engine`) enter the core? A new field on `RunReviewRequest`, or a separate pre-`runReview` resolution use case the caller invokes first? | Determines whether this story touches `run-review.ts` itself or stays fully additive (new file only) — a guard/blast-radius call. | open |
| Exact shape of "engine used" on the result — a new `RunReviewResult` field, or deferred until a `RunStore` exists? | AC-2 ("engine used recorded in run metadata") needs a concrete, honest target given no history module exists yet. | open |
| Does `[E4.F2.H2]` need to be merged before this story starts, or can it proceed against the port alone? | `[E4.F2.H3]`'s backlog entry lists both H1 and H2 as dependencies; H2 is only PR'd, not merged, as of this proposal. | open |

## Approval Notes

- User directed this proposal to start immediately after `[E4.F2.H2]`'s
  closeout (session decision, 2026-08-22): sequential, not parallel with H2.

## Budget Notes

- Keep this artifact lightweight. Target roughly 200 to 400 words.
- This artifact consolidates the idea before investing in a formal spec.
