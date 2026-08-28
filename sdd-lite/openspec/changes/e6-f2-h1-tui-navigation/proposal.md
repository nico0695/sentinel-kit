# Proposal

## Routing Digest

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- digest_summary: Fill the `src/adapters/driving/tui/` placeholder with the interactive navigation flow repo → branch (fetch) → harness → confirmation → progress → result (story [E6.F2.H1], issue #38), driving existing core use cases only, wired in `src/main/`, reusing the CLI review path's resolution/persistence seams without adapter→adapter imports.
- feasibility_signal: high — every seam the flow needs already exists and is exported; risk is concentrated in UX decisions (dep, entry point, cancel/progress semantics), not in missing capabilities.
- scope_sketch_digest: IN — TUI adapter (nav flow, cancel, error rendering without stacks), first TUI runtime dep (design ratifies), main wiring, testability seam, CLAUDE.md refresh as mandatory closeout (e6f2h1-D0). OUT — result rendering detail ([E6.F2.H2]), `sentinel open` ([E6.F2.H3] ⚪), mid-run engine abort (likely), new core use cases.

## Summary

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- proposal_status: consolidated, pending checkpoint
- exploration_performed: true (directed: `tui/index.ts`, `create-cli.ts`, `cli-deps.ts`, `review-command.ts`, `main/cli.ts`, `main/container.ts`, core `repos`/`run` indexes)

## Problem And Desired Outcome

**Problem.** Sentinel's MVP promises an interactive experience (PRD §3.1-G, use cases 1–5) but only the scriptable CLI exists. `src/adapters/driving/tui/index.ts` is a documented placeholder (`export {}`). A user today must know alias, branch, and harness names up front and type a full `sentinel review` invocation; there is no guided path.

**Desired outcome.** A driving TUI adapter offering the full guided flow — select repo → select branch (after fetch) → select harness → confirmation summary → progress → result — completing without leaving the TUI, cancelable at every step, with errors shown as friendly one-liners (no raw stack traces). The TUI invokes core use cases only (`listRepos`, `listBranches`, `resolveReviewRequest`, `runReview`, `persistRun`), mirroring how `review-command.ts` resolves and persists a run so both surfaces stay behavior-equivalent (its comment already anticipates this: "the TUI will resolve a review exactly the way this command does").

## Initial Scope Sketch

### Likely In Scope

- `src/adapters/driving/tui/`: navigation flow, step components, cancel handling, error presentation (translate typed core errors to plain messages; never print stacks).
- First TUI runtime dependency (`@clack/prompts` + picocolors are the setup-doc recommendation; design must ratify or replace with justification — risk-e6f2h1-001).
- A `TuiDeps`-style injection contract analogous to `CliDeps` (bound use-case thunks, IO/prompt seam, clock), so the TUI is testable with doubles like the CLI (`cli-test-doubles.ts` pattern).
- Wiring in `src/main/` only: entry point + container extension; likely reuse of `createCliDeps`'s bound use cases via a shared or extended factory.
- Fetch-before-branch-listing using `listBranches` (which already fronts `GitPort` fetch + branch listing).
- Confirmation step summarizing repo/branch/harness/engine before running; progress display during `runReview`; handing the terminal state to a minimal result screen (detail is H2's).
- Persisting the run exactly once whatever the terminal state, matching the CLI path's D1/AC-6 contract.
- Mandatory closeout step before the PR (decision e6f2h1-D0, user, firm): update CLAUDE.md — the stale "Current state: pre-implementation" section plus whatever this story changes (TUI adapter, new dep, entry point). Spec and plan must carry this as an explicit final stage.

### Likely Out Of Scope

- Rich result rendering (highlighted sections/severities, run path emphasis) — [E6.F2.H2].
- `sentinel open` interactive session in the worktree — [E6.F2.H3], optional, explicitly OUT.
- Mid-run engine abort: `runReview` is a single awaited use case; "cancelable at every step" is proposed to mean every step up to and including the confirmation, with post-launch cancel semantics a spec decision (risk-e6f2h1-003) and true abort likely deferred.
- New core modules, new use cases, or changes to the five terminal states.
- CLI behavior changes (commands from [E6.F1.H1]/[E6.F1.H2] stay untouched).

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Use-case surface | Everything the flow needs is exported from core public indexes: `listRepos`, `listBranches` (fetch + branches), `resolveReviewRequest` (single owner of the flag→repo→global cascade "every driving adapter needs"), `runReview`, `persistRun`, `getRun`. No core work expected. | high |
| Wiring pattern | `createCliDeps` already builds bound use-case thunks, `loadContext`, a single clock, and injectable IO; the TUI needs the same graph plus prompt IO. Extension point is clear and confined to `src/main/`. | high |
| Testability | The CLI proves the pattern: injected IO, no `process` access, exit code as return value. A prompt library adds an interaction seam the CLI didn't need — doable (inject prompt functions) but it is the main new testing surface. | medium |
| Dependency | `@clack/prompts` is recommendation-only (setup doc §4: "covers all of MVP area G"); ratification is design work, not a blocker. | medium |
| Guards | dependency-cruiser rules already cover the constraints (no adapter→adapter, wiring only in main); reuse of CLI render/error helpers would violate `adapters-isolated`, so shared rendering must live elsewhere or be duplicated deliberately — design question (risk-e6f2h1-002). | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| B — Entry point: bare `sentinel` (no args) launches the TUI vs a `sentinel tui` subcommand | Public UX + how commander (which owns argv today, printing help on no command) coexists with the TUI adapter; affects `main/cli.ts` and help text | open — user decision with recommendation at spec/design |
| B — Ratify first TUI runtime dep (`@clack/prompts` + picocolors) or replace | First interactive dependency of the product; setup doc mandates re-evaluation with justification | open — design ratifies (risk-e6f2h1-001) |
| B — Cancel semantics after the engine run starts | "Cancelable at every step" is acceptance; mid-run abort may exceed scope — spec must set the firm boundary (pre-run cancel vs abort) | open (risk-e6f2h1-003) |
| A — Progress display shape (spinner vs staged messages) | `runReview` is one awaited call; what the TUI can honestly show is bounded by that — pick simplest honest form | open — spec/design decides |
| A/B — Where CLI/TUI-shared rendering or error-formatting lives | Adapters must not import each other; options: duplicate minimal formatting, or hoist a shared driving helper — location affects repo structure (B if new top-level folder) | open (risk-e6f2h1-002) |
| A — Harness listing source for the harness step | Container has factory + user `HarnessLoader`s; how the TUI enumerates harnesses (loader port vs config) must follow existing seams | open — spec confirms |
| A — Non-TTY behavior | What `sentinel` (TUI path) does when stdin is not a TTY: fail with a friendly pointer to `sentinel review` seems right; spec must state it | open |

## Approval Notes

- Seed decision carried, not re-decided: e6f2h1-D0 (user) — CLAUDE.md refresh is the mandatory last step before the PR; listed in scope so spec/plan inherit it.
- No new risks beyond the three already recorded in state.yaml; the non-TTY question is folded under UX spec work, not a new risk entry.
- B-level questions above are surfaced for the orchestrator to put to the user; nothing here decides them.

## Budget Notes

- Slightly above the lite word target because the story carries three medium risks and five-plus open questions; tables kept compact so spec can consume the digest directly.
