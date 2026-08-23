# S25 — [E5.F1.H2] Declared validations, end to end

- **Date**: 2026-08-23
- **Branch**: `claude/e5-f1-h2-declared-validations`
- **Scope**: project-state validation (PR #71 merge confirmed, E5 status re-synced) + `[E5.F1.H2]` Declared validations in the review flow (issue #32) complete: full lite flow, spec revision 2 (directed adversarial re-analysis), design, plan, ST-1..ST-4, full-4r review (1 confirmed CRITICAL, user-ratified and closed), final QA `pass_with_warnings`, change `completed`
- **sdd-lite changes**: [`e5-f1-h2-declared-validations`](../../sdd-lite/openspec/changes/e5-f1-h2-declared-validations/)

## Objective

Validate that `[E5.F1.H1]` (PR #71) was correctly merged and E5's GitHub state was in sync, then run the last required E5 story — `[E5.F1.H2]`: repo-declared validation scripts run inside the review worktree, in order, with a per-script timeout, and their output injected into the review prompt without ever aborting the review.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S25-D1 | Continue with `[E5.F1.H2]` after confirming PR #71 merged; the only remaining required E5 story. | Ask again vs. proceed unilaterally given only one candidate remained. | Session precedent asks explicitly even when one option is "obvious"; user confirmed. | `user` |
| S25-D2 | DC-1: `runValidations` is a standalone, independently unit-testable use case that `runReview` calls at stage 5 when `deps.processRunner` is present. | (a) fold into `runReview` only — buries the "never aborts" guarantee inside the pipeline's try. (b) standalone-only, caller-driven — makes "output visible in the persisted prompt" depend on a CLI that doesn't exist until E6. | (c) covers both without the drawbacks of either. | `claude→user` |
| S25-D3 | DC-2: keep `RepoEntry.validations` as `string[]`; add one additive optional `validationTimeoutMs`. | Widen `validations` to a `(string\|object)[]` union; hard-code a constant. | Satisfies the criterion literally without re-litigating a config format shipped one story earlier. | `claude→user` |
| S25-D4 | DC-3: whitespace-split tokenization + reject any entry containing a pinned shell-metacharacter set, throwing `validation-failed`. | Naive whitespace split only; a quote-aware shell-like tokenizer. | Refusing what `shell:false` cannot honor beats a silent misparse (`"npm test 2>&1"` would otherwise pass `2>&1` as a literal arg). | `claude→user` |
| S25-D5 | DC-4: a malformed *declaration* → `validation-failed` at pre-flight; a *runtime* failure (non-zero exit, missing binary, timeout) → pure evidence, review continues. `InvalidProcessRequestError` joins `classifyFailure`'s `validation-failed` branch; `ProcessSpawnError` deliberately does not. | Never influence terminal state; any spawn failure aborts. | Matches the story's literal acceptance criterion while still surfacing a genuinely broken config. | `claude→user` |
| S25-D6 | DC-5/DC-6/DC-7 (RunStage gains `"validations"`; head-100/tail-100 line window with elision marker + 2000-char per-line backstop; one `validationOutput` element per declared script) settled at A level in `spec.md`, not escalated. | — | One-way trade-offs with clear rationale (see `spec.md` §Interface Notes / D5-D7). | `claude` |
| S25-D7 | Ran a second, directed adversarial re-analysis of `spec.md` before ratification (empirical probes, not just re-reading), per explicit request. | Ratify spec revision 1 as-is. | Precedent from prior sessions (S23/S24) found real defects on this pass every time; this session found 8 (R2-1..R2-8), including a confirmed internal contradiction (AC-12 vs AC-9/D5) and a zod probe confirming `validationTimeoutMs` accepted `0`/negative/non-integer values. | `user` |
| S25-D8 | R1-001 (CRITICAL, full-4r review): a declared validation string with no rejected shell character (e.g. `env`) leaks the reviewing process's environment into the persisted prompt/log. Ratified as already-decided: matches `risk-007` (proposal stage, "low" severity, self-inflicted by the repo owner's own config) — closed `wont-fix`, no code change. | (B) require a mitigation (warning banner/docs) before closing. (C) treat as a fix-now blocker, route through `sddl-plan`. | A denylist of "dangerous" bare commands would be trivially bypassable (`env -i`, `/usr/bin/env`, a 2-line wrapper) and give false confidence; the mechanism is the repo owner's own declared config. Raised via `review_gate` rather than resolved unilaterally, since a fresh unbiased lens disagreed with an earlier A-level severity call. | `claude→user` |

## Deviations

- The `sddl-executor` handoff for ST-1 pointed at `src/core/run/ports/process-run-request.ts` for the request-validation function; the real path is `src/core/run/process-run-request.ts` (not under `ports/`). Caught by the spec worker during grounding, before any code was written — no rework.
- `ProcessRunResult` was assumed (per the proposal's DC-7 recommendation) to carry a `duration` field for the evidence-element header; it does not. Duration was excluded from the pinned format entirely, which also preserves PRD §6.3's "same input → same prompt" (became AC-21).
- `dec-004`'s "fail before a worktree exists" conflicted with the design's original placement of the declaration check at stage 5 (after worktree creation). Resolved by hoisting the check to stage 1, conditional on `processRunner` being wired and declarations being non-empty (R2-3), so the byte-identical no-op guarantee (AC-1) still holds when no runner is present.
- A `state.yaml` update script (Python heredoc with an embedded apostrophe) silently failed its `sed`-style substitution twice this session — once after ST-4 (caught immediately by re-reading the file, fixed in a follow-up commit `b7376e6`) and once while inserting `review_summary` (caused a YAML nesting break that dropped `sddl-qa-review` out of the `stages` map; caught before commit by parsing the file with `yaml.safe_load` and inspecting `list(data['stages'].keys())`, fixed with a plain `Edit` before anything was committed). No corrupted state was ever pushed. Lesson: prefer `Edit` over heredoc-based YAML rewrites for anything with nested structure or embedded quotes.
- `sddl-executor` for ST-1 recorded `state.yaml`'s `sddl-executor.status` as `implementing`, which is not a valid enum value (schema requires `in_progress`); caught by the orchestrator's own post-write schema validation and fixed in a same-session follow-up commit (`7427d8d`) before the next stage began.
- ST-3's second mutation-testing round (per `plan.md`: "add `ProcessSpawnError` to `classifyFailure`'s branch, confirm the review-continues test fails") had no observable effect — `runValidations` already catches every `ProcessSpawnError` internally and never rethrows it, so the mutation was structurally inert. Recorded as a finding, not a defect: both layers (the internal catch and the classifier's omission) were independently verified to enforce the same invariant redundantly.
- Full-4r review's R1-002 (risk lens: `truncated` flag doesn't reflect a per-line character cut) was reconciled as spec-conformant, not a defect, after cross-checking R3's independent identical reading against `spec.md` AC-14's exact text ("`truncated` is `true` when either capture flag was set **or** D6's window elided anything" — a per-line cut is neither).

## Work done

- Re-validated project state: confirmed PR #71 (`[E5.F1.H1]`) merged into `main` at `beb5d48`; issue #31 closed; E5 milestone re-synced (`#32` open/required, `#35` optional/skipped).
- Full `sdd-lite` lite flow for `e5-f1-h2-declared-validations`: `proposal.md` (7 decision candidates), `spec.md` (21 ACs, revision 2 with a directed adversarial re-analysis fixing 8 defects), `design.md` (7 decisions D-1..D-7), `plan.md` (4 stages ST-1..ST-4), `execution-log.md`, two stage QA passes (`qa-report.md`, stage then final), `review-ledger.md` (full-4r).
- 17 commits on `claude/e5-f1-h2-declared-validations`, `5a904cb`..`9dd45dc` (see `git log --oneline beb5d48..HEAD`), implementing: additive `validationTimeoutMs` config field (ST-1); the pure validation surface — tokenizer, rejection set, truncation window, evidence formatter, `ProcessRunner` fake (ST-2); wiring into `runReview` — hoisted stage-1 guard, stage-5 execution, `classifyFailure` extension, `RunStage`/`RUN_STAGES` (ST-3); closing gate verification (ST-4).
- Full-4r code review (4 lenses in parallel): R2 Readability clean; R1 Risk found 1 CRITICAL (env-leak, closed per S25-D8) + 2 lower-severity; R3 Reliability found 1 WARNING (`MAX_TIMEOUT_MS` not self-enforced by `runValidations`); R4 Resilience found 1 WARNING (no cap on declaration count/aggregate duration, deduped against R1's equivalent). No refuter pass needed — the sole CRITICAL was `evidence_class: deterministic`.
- Final QA: 21/21 ACs independently re-verified against HEAD; `npm run check` clean; full suite 494/494 (up from 408 at session start); blast radius confirmed as exactly the 11 pinned files against base `beb5d48`. `lifecycle_status: completed`.
- Mutation testing performed and reverted at every stage introducing a load-bearing pure function or a compile-time guard (AC-7's rejection set, AC-14/AC-15's formatter, `RUN_STAGES`'s exhaustiveness guard, `classifyFailure`'s `ProcessSpawnError` omission).

## Pending and next steps

- Open a PR for `e5-f1-h2-declared-validations` (`Closes #32`) — not yet requested by the user this session.
- Per workflow contract rule 6: once this PR is open, E5's only remaining item is `[E5.F2.H3]` (⚪ optional, cost/tokens per run) — post the epic summary and STOP per the contract, unless the user explicitly asks to continue into the optional story.
- Follow-up candidates surfaced but deliberately not actioned this session: `risk-006`/`risk-007` (no process-group kill; inherited from `[E5.F1.H1]`, unchanged), `R3-001`/`R4-001` (info-tier, non-blocking scope observations from the 4R review).

## Open questions for the user

—
