# Proposal

## Routing Digest

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- digest_summary: Add the `runReview` use case to `src/core/run` — the first code that composes workspace (worktree + diff), review (prompt), and the `ReviewEngine` port into one flow ending in a `TerminalState`, with guaranteed worktree cleanup. Verified against FakeEngine and in-memory fakes only.
- feasibility_signal: high — every dependency is merged on `main` @ `f294af2`; no new module, no adapter change, no guard change. Residual risk is design-level, not availability-level.
- scope_sketch_digest: IN = `core/run` use case + its dependency shape + failure→terminal-state mapping + cleanup guarantee + unit tests. OUT = verdict parser (#27), real engine adapters (#28-30), all of E5.

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (with open questions)
- exploration_performed: true

## Problem And Desired Outcome

`src/core/run` currently exports types only: the `ReviewEngine` port, `ReviewRequest`/`ReviewResult`/`ReviewUsage`, `TerminalState`, and `WorktreeRef`. The four capabilities the product's central flow needs already exist as separate, individually tested core use cases — `createReviewWorktree`, `computeReviewDiff`, `cleanupWorktree` (workspace) and `assemblePrompt` (review) — but nothing composes them. There is no code path in the repo that turns "review this branch of this repo" into a result, so no terminal state is ever produced and the e2e vitest project is still empty.

Desired outcome: one core use case, `runReview`, that orchestrates **worktree → diff → (E5 validation seam, left open) → prompt → engine → terminal state → cleanup per policy**, ends every path in exactly one of the five terminal states, and removes the ephemeral worktree on every path — including engine failure — without swallowing the originating error. Correctness is demonstrated with in-memory port fakes plus FakeEngine; no real engine, no filesystem, no `git` binary.

This story fixes the shape every later E4/E5/E6 story plugs into: the verdict parser (#27) slots into its parse step, real adapters (#28-30) slot in behind `ReviewEngine`, and E5 validations and `RunStore` slot into seams this flow defines. That makes it hot-path work despite being one module.

## Initial Scope Sketch

### Likely In Scope

- A `runReview` use case in `src/core/run/`, exported from the module's public `index.ts`, following the established request/deps/result shape of the workspace use cases.
- Composition of the existing core use cases via their public module indexes only (`../workspace/index.js`, `../review/index.js`), preserving the cross-module import guard.
- An explicit mapping from each failure family (`WorktreeCreationError`, `InvalidWorktreeRequestError`, `DiffSizePolicyError`, harness errors, engine rejection, timeout) onto a `TerminalState`.
- A cleanup guarantee that runs on success and on every error path, honouring the existing `CleanupPolicy` (`always | on-success | keep`) and the `reviewSucceeded` flag `cleanupWorktree` already takes.
- Run-domain error type(s) in `src/core/run/`, if the mapping requires them (naming per `docs/coding-standards.md`: `Error` suffix, owned by the module).
- Unit tests under `src/core/run/__test__/` (vitest `core` project) covering the happy path and each reachable terminal state.
- The E5 validation seam: a named, unimplemented step between diff and prompt. `assemblePrompt` already accepts an optional `validationOutput`, so the seam is a pass-through parameter, not new machinery.

### Likely Out Of Scope

- `[E4.F1.H2]` verdict parser (#27) — defensive `VERDICT:` extraction, ANSI/markdown normalization, contradiction handling, real E1 fixtures. `runReview` must reach a terminal state without owning that parser (see open questions).
- `[E4.F2.*]` real engine adapters (#28-30) and cascading engine resolution.
- Anything from E5: `ProcessRunner`, declared validations, `RunStore` persistence. No run is written anywhere by this story.
- CLI/TUI wiring and exit codes (E6), and adapter instantiation (that stays in `src/main/`).
- Changes to the `ReviewEngine` port contract or to `FakeEngine`, unless an open question below forces one — in which case it is a checkpoint, not a silent edit.
- Any e2e smoke test; the empty `e2e` project stays empty unless spec explicitly claims it.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Dependency availability | E2.F3.H1/H2, E3.F1.H2 and E0.F2.H2 are all merged on `main` @ `f294af2`; their public indexes were read directly. Nothing is stubbed. | high |
| Architecture fit | Pure composition inside `src/core`, consuming other core modules through their public `index`. No adapter import, no I/O library, no new folder. All five guards remain satisfiable by construction. | high |
| Test infrastructure | `core` vitest project, in-memory `GitPort` fake (`workspace/__test__/workspace-git-fake.ts`), fake harness loader, and scriptable `createFakeEngine` all exist and are green (163 tests / 14 files). | high |
| Cleanup mechanics | `cleanupWorktree` already encapsulates the policy decision; the story needs a `try`/`finally`-shaped guarantee around it, not new cleanup logic. | high |
| Terminal-state coverage | Only `ok` and the run's own error mapping are natively producible here. `timeout` and `engine-error` depend on how engine failures are typed at the port; `validation-failed` has no native producer in this story. Unresolved — see open questions. | low |
| Dependency surface size | `runReview` needs a `GitPort`, an engine, a resolved harness (or a `HarnessLoader`), a worktrees dir, limits, a cleanup policy and a timeout. Large but assemblable; the risk is API sprawl, not infeasibility. | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| How does `runReview` reach a terminal state without the H2 parser? The backlog description says "parsing → terminal state" but the parser is a separate story (#27). Candidate framings: a deliberately minimal internal extraction that H2 replaces, or an injected parse function with a trivial default. | Decides whether H1 pre-empts H2's scope or leaves an unproven seam. Also decides whether `ok` vs `ambiguous` is even distinguishable in this story. | open |
| Are `timeout` and `engine-error` distinguishable through the current `ReviewEngine` port? The port has no typed error channel and `FakeEngine` rejects with a plain `Error`; nothing today lets the run domain tell a timeout apart from a crash. Options: introduce typed port errors in `core/run/ports`, or have the run domain enforce `timeoutMs` itself as a wall-clock race. | This is `r-terminal-state-coverage` made concrete. It may require touching the frozen port (dec-004) or FakeEngine — both scope-expanding, so a checkpoint rather than an autonomous call. | open |
| Is `validation-failed` reachable in this story at all? Declared validations are E5. `DiffSizePolicyError` exists today but is only raised for invalid limit *configuration*, not for an oversized diff (oversized diffs truncate with a warning), so mapping it to `validation-failed` would be a stretch. | The acceptance criterion "each terminal state reachable by test" cannot be met honestly without either a defensible non-E5 producer or an explicit, recorded partial deferral. Do not narrow silently. | open |
| Does `runReview` receive a `ResolvedHarness` as input, or resolve it internally via `loadHarnesses` + `resolveHarnessSkills` (pulling in the `HarnessLoader` port)? | Sets the use case's dependency surface and how much of E3 the CLI must assemble later. Affects public API shape, so B-level. | open |
| Does cleanup failure change the terminal state? `cleanupWorktree` can throw `WorktreeCleanupError` after the review already succeeded or already failed. | Determines whether the original outcome survives a cleanup fault, and whether the error is reported, logged in the result, or rethrown — the core of `r-cleanup-on-error`. | open |
| Does the result carry the worktree path, diff metadata, raw engine output and usage, or only the terminal state? | E5's `RunStore` and E6's rendering both consume this shape; under-returning here forces a later breaking change. | open |

## Approval Notes

- Scope is `[E4.F1.H1]` / issue #26 alone. The scope split from `[E4.F1.H2]` was recorded as A-level decision `d-change-scope`; this proposal upholds it and does not absorb parser work.
- Three questions above are material enough to gate a clean spec: the parse seam, the timeout/engine-error distinction, and whether `validation-failed` is reachable. Two of them may imply touching the frozen `ReviewEngine` port or `FakeEngine`; if spec concludes they do, that is a B/C escalation to the user, not an autonomous change.
- Recommended next stage: `sddl-spec`, which must convert the acceptance criterion "each terminal state reachable by test" into either a full, defensible mapping or an explicitly recorded partial deferral with the deferred states named.
- No conflict with the PRD was found. The flow, the five terminal states, and the ephemeral-worktree rule all match PRD §4 and §5.1.

## Budget Notes

- Lite artifact; sections above are intentionally compact. Detailed interface shapes belong to `sddl-design`, firm boundaries and acceptance criteria to `sddl-spec`.
