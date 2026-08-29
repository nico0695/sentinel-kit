# Proposal

## Routing Digest

- change_name: e6-f2-h2-result-rendering
- objective: new-feature (the orchestrator's `implementer` objective; `state.schema.yaml` has no `implementer` member, so the schema-valid equivalent for a backlog feature story is recorded — same mapping `[E6.F2.H1]` used)
- route: continue-lite
- digest_summary: >-
  Backlog story `[E6.F2.H2]` (issue #39), last required story of E6. Rewrite the deliberately
  minimal TUI result surface (`src/adapters/driving/tui/render.ts`) so a finished review is
  readable at a glance — verdict, blockers, and the persisted run path — instead of the three-line
  `State:`/`Verdict:`/`Run directory:` block `[E6.F2.H1]` left as a placeholder.
- feasibility_signal: high on data availability, medium on the quality bar
- scope_sketch_digest: >-
  One driving adapter (`tui/render.ts` + its call sites in `tui-flow.ts` + `__test__/result.test.ts`).
  No core change in the recommended shape. Possible new runtime dep (picocolors, ±marked-terminal) —
  a B-level decision ratified at design, not here.

## Summary

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (gated by four B-level questions)
- exploration_performed: true

## Problem And Desired Outcome

`[E6.F2.H1]` shipped the TUI navigation flow and deliberately stopped at a placeholder result
block. `render.ts` says so in its own doc comment: *"Rich rendering is `[E6.F2.H2]`'s entire scope
and will rewrite this surface."* Today a user who waits minutes for a review sees three lines —
`State: ok`, `Verdict: request-changes`, `Run directory: …` — and must open a file to learn *why*
changes were requested. The engine's full review markdown is already in memory and already on disk;
nothing surfaces it.

Desired outcome: on completion the TUI shows the review's substance without leaving the terminal —
the verdict, the blocking findings, and where the full record lives — per the backlog's acceptance
("verdict and blockers visible at a glance · run path shown").

## Exploration Findings

Bounded read of the four unknowns the orchestrator flagged. All grounded in code, not assumption.

| # | Question | Finding |
|---|---|---|
| 1 | What data reaches the TUI? | `RunReviewResult` (`src/core/run/run-review.ts:192`) carries `state`, `verdict?`, **`engineOutput?` — the raw, unparsed engine markdown**, plus `failure?`, `diff?`, `prompt?`, `usage?`, `cleanup`. `persistRun` returns `{ runDir, record }` and `RunRecord` carries `engineOutput` too. `tui-flow.ts` holds both at the result step and currently ignores everything but three fields. **The markdown is available in memory — no core change is needed to render it.** |
| 2 | Where is the run persisted? | `RunStore.save` resolves the absolute run directory (`src/core/history/ports/run-store.ts:88`). `run-store-fs.ts` writes `metadata.json`, **`result.md` (the raw engine output)**, `prompt.md`, and `validations/`. The TUI already receives `persisted.runDir`; the file holding the full review is `result.md` inside it. |
| 3 | What does the CLI already render? | `cli/render/format-review.ts` emits a deliberately **machine-parseable** `key<TAB>value` block (`REVIEW_OUTCOME_FIELDS`), explicitly undecorated — "the terminal state is rendered, never interpreted". `format-runs.ts` dumps `engineOutput` as raw lines for `runs show`. The only real CLI/TUI overlap is the ~10-line `formatTuiErrorLine` ≈ `formatErrorLine` copy. A human-facing TUI renderer does **not** grow that overlap, so the guard-driven duplication note appears to stand. |
| 4 | Are blockers structured data? | **No.** The domain model stops at `Verdict = "approve" \| "request-changes" \| "comment"`; neither `RunReviewResult` nor `RunRecord` has a findings field. Blockers live only as free text inside `engineOutput`. **But** the factory harnesses' `output.md` pins a machine-recognizable convention: `VERDICT: <v>` as the first non-empty line, then `[SEV: blocker\|major\|minor\|nit] <file>:<line> — <summary>` per finding, highest severity first. `fixtures/claude-code/valid-verdict.json` confirms a real engine complies exactly. So "at a glance" is reachable by matching a **harness prompt convention**, not a core guarantee — user harnesses may declare any contract, and non-compliance is precisely what the `ambiguous` state exists for. |

## Initial Scope Sketch

### Likely In Scope

- Rewrite `src/adapters/driving/tui/render.ts` into the story's result surface (verdict, blockers/findings, run path).
- Update the call sites in `src/adapters/driving/tui/tui-flow.ts` (both the persisted and the persist-failure branches).
- Revise `src/adapters/driving/tui/__test__/result.test.ts`, which pins H1's minimal block as the literal tail of stdout.
- Render the non-`ok` states honestly (`engine-error`, `timeout`, `validation-failed` have no markdown; `ambiguous` has markdown but no verdict).
- Show where the persisted run lives, including the file that holds the full review.
- Possibly one new runtime dependency (`picocolors`, `±marked-terminal`) — ratified at design.

### Likely Out Of Scope

- Any change to `src/core/**` — including a structured findings/severity model next to the verdict parser.
- The CLI review/`runs show` surfaces (`format-review.ts`, `format-runs.ts`): machine-parseable by design, and `--json` was deferred by `[E6.F1.H1]` D6.
- Editing the `adapters-isolated` guard to share rendering between CLI and TUI (H1 risk-002's resolution stands unless the overlap materially grows).
- `[E6.F2.H3]` `sentinel open` (⚪ optional), interactive scrolling/pager, and E7 items (E2E smoke, EPIPE hardening, argv-dispatch coverage).

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Data availability | The review markdown, verdict, failure and run path are all already in the TUI's hands. Zero core work for the recommended shape. | High |
| Blast radius | One driving adapter: 1 renderer file, 1 flow file, 1 test suite (+ possibly `package.json`/lock and `main/` if a dep lands). Presentation layer only. | High |
| Precedent | `[E6.F2.H1]` established the pattern for a TUI-local renderer, dep ratification at design, and TTY-free tests via the `TuiDeps`/`TuiPrompter` seams. | High |
| "At a glance" quality | Depends on the harness `output.md` convention, which is a prompt instruction rather than an enforced contract. Degradation behavior must be specified. | Medium |
| Gate | `main` @ `59b806e`: `npm run check` clean, `npm test` 754/754 across 45 files. Nothing blocking. | High |

## Open Questions For Spec

Classified per the A/B/C decision protocol. Recommendations are given; B items are the user's call.

| # | Level | Item | Why It Matters | Recommendation | Status |
|---|---|---|---|---|---|
| Q1 | **B** | How much of the review markdown is rendered: a compact digest (verdict + blocking/major findings + path) vs a full styled render of the whole markdown. | Defines the UX and the backlog's "basic … marked-terminal optional" clause. | Compact digest by default — the AC is "at a glance"; the full markdown stays one path away in `result.md`. | open |
| Q2 | **B** | New runtime dependency: `picocolors` and/or `marked-terminal` (declared-only in setup §4, neither installed). | Any runtime dep is a B decision; `[E6.F2.H1]` set the precedent of ratifying at design, not pre-approving. | Evaluate at design per that precedent; lean to `picocolors` only, `marked-terminal` deferred (backlog marks it optional). | open |
| Q3 | **B** (escalates to **C** if it lands in core) | Where severity/finding extraction lives: (a) adapter-side presentation heuristic over the `[SEV: …]` convention, (b) a core findings parser beside the verdict parser, (c) no extraction — generic keyword highlighting only. | This is the AC's load-bearing question (finding 4). Option (b) turns a presentation story into a core hot-path change and is scope expansion. | (a): match the convention in the adapter, degrade to plain output when it is absent. If the spec wants (b), STOP and treat it as a separate story. | open |
| Q4 | **B** | Does the rich rendering also apply to the CLI, or TUI only? | Answering "both" changes a scripting contract and the guard/duplication calculus. | TUI only — the story sits in feature E6.F2 and the CLI block is deliberately machine-parseable. | open |
| Q5 | A | Revising H1's `result.test.ts` literal-tail assertions and H1 AC-7's pinned minimal block. | The pin was placed to stop H2's surface slipping in early; superseding it must be deliberate and recorded, not silently "fixed". | Spec states explicitly that H1 AC-7 is superseded by this story's ACs; the suite is rewritten, not deleted. | open |
| Q6 | A | What the result shows for non-`ok` states and for `ambiguous`. | `engine-error`/`timeout`/`validation-failed` have no markdown; the TUI currently renders neither failure stage nor message (the CLI does). | Render failure stage plus a one-line message, mirroring the CLI's field semantics; for `ambiguous`, render the markdown and say no single verdict was found. | open |
| Q7 | A | Run-path shape: directory only (current) vs directory plus a pointer to `result.md`. | "Run path shown" is an AC; `result.md` is the file that actually holds the full review. | Show the directory and name `result.md` as the full-review file. | open |
| Q8 | A | Long-output policy (no pager exists). | A large review could flood the terminal. | A digest is naturally bounded; no pager, no truncation in the MVP — terminal scrollback is enough. | open |
| Q9 | A | Whether H1's deliberate `formatTuiErrorLine` duplication should now be revisited (H1 instruction: "revisit only if `[E6.F2.H2]` materially grows the overlap"). | Prevents an unnecessary guard edit — or catches a real one. | Finding 3 says it does not grow: keep the duplication and record the revisit as performed with evidence. | open |

## Approval Notes

- Route stays `continue-lite`: bounded to one driving adapter, no core change in the recommended shape.
- Four B-level questions (Q1–Q4) are put to the user at the proposal checkpoint. Q3 is the one that can change the story's nature — a core findings model would be a scope expansion (level C) rather than this story.
- Spec must supersede `[E6.F2.H1]` AC-7 explicitly rather than work around its pinned assertions.
- No decisions are taken by this stage.
