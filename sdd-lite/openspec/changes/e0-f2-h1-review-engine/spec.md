# Spec

## Routing Digest

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- digest_summary: Formalize backlog story [E0.F2.H1] (issue #5): declare the `ReviewEngine` driven port in `src/core/run/ports` (input = worktree ref + prompt + timeout; output = raw output + optional usage) and the run-domain terminal-state model `ok | ambiguous | engine-error | timeout | validation-failed`, re-exported via `src/core/run/index.ts`, with zero I/O imports (depcruise `core-no-io-libs` green; core whitelist is `zod` only). Types-only, no runtime behavior.
- scope_digest: In — port types + terminal-state type + public re-export, guard-green. Out — FakeEngine, `ReviewEngine.contract` suite, `--passWithNoTests` removal (all E0.F2.H2 #6); runReview flow (E4.F1.H1); verdict parser (E4.F1.H2); ProcessRunner (E5); real adapters (E4.F2).
- acceptance_digest: AC1 port typed in `core/run/ports`; AC2 five terminal states modeled as a run-domain type; AC3 zero I/O imports — `npm run check` (biome + tsc --noEmit + depcruise src) is 0-violation.

## Summary

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- spec_status: complete — two design-gate confirmations pending (Q2, Q3)

This story turns the single `export {}` placeholder in `src/core/run/` into the product's central border contract: the `ReviewEngine` driven port plus the run-domain terminal-state model. It is a pure type contract that unblocks every downstream engine/spike/adapter story (H2, E1, E4). No runtime code, no algorithm, no I/O.

## Scope Boundary

### In Scope

- `ReviewEngine` driven port declared under `src/core/run/ports/` — named by domain role, invocation-only signature.
- Port input type: worktree reference + prompt + timeout.
- Port output type: raw output + optional usage. No verdict / terminal state on the engine's return (see Q2).
- Run-domain terminal-state model: the union `ok | ambiguous | engine-error | timeout | validation-failed` as a first-class run type, distinct from the port's output.
- A minimal run-local worktree reference type at the port boundary (see Q3), owned by `run`, zero I/O.
- Public re-export of the port + run-domain types via `src/core/run/index.ts`, replacing the placeholder.
- Guard-green endpoint: `npm run check` stays 0-violation; no `adapters/**`, `main/**`, or I/O-library imports (whitelist `zod` only).

### Out Of Scope

- `FakeEngine` and the `ReviewEngine.contract` shared suite — E0.F2.H2 (#6).
- Removing `--passWithNoTests` from the `test` script — deferred duty (e0-f1-h3 risk-004); fires with the first real test file, which lands in H2.
- `runReview` orchestration (worktree→diff→prompt→engine→parse→cleanup) — E4.F1.H1.
- Verdict parsing that assigns `ok`/`ambiguous` from raw output — E4.F1.H2.
- `ProcessRunner` port — E5.F1.x. Real engine adapters — E4.F2.x.

### Non-Goals

- No runtime behavior, no engine invocation, no process spawning.
- No coupling of the port signature to verdict/parse outcomes.
- No `zod` runtime schemas unless a design-gate decision reverses Q5.
- No import of another core module's internals (e.g. `workspace`).

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| A future adapter (`engines/claude-code`) implements `ReviewEngine` | It satisfies a stable input (worktree ref + prompt + timeout) → output (raw + optional usage) signature with no source change to core | PRD §4.3 declares `ReviewEngine` on `run` |
| A downstream story needs the five run terminal states | It imports the terminal-state type from `run`'s public `index` | PRD §4.6: every run ends in one of the five states |
| `npm run check` runs on the branch | 0 violations; `depcruise src` confirms `core-no-io-libs` and no-adapters guards hold | `.dependency-cruiser` `pathNot: ["^zod(/|$)", ...]` |
| Another core module imports run's types | Only via `src/core/run/index.ts`, never a deep path | PRD §4.5 guard 3 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC1 | `ReviewEngine` port is typed under `src/core/run/ports/`, named by domain role, with input = worktree ref + prompt + timeout and output = raw output + optional usage, re-exported via `src/core/run/index.ts` | Read `src/core/run/ports/*` + `index.ts`; `tsc --noEmit` green | must (issue #5 box 1) |
| AC2 | The run domain models the terminal states `ok | ambiguous | engine-error | timeout | validation-failed` as a first-class type, exported via run's `index`, and NOT carried on the engine's return type | Type resolves to exactly the five members; grep the union | must (issue #5 box 2) |
| AC3 | Zero I/O imports: `npm run check` (biome + `tsc --noEmit` + `depcruise src`) reports 0 violations; no `adapters/**`/`main/**`/I/O-lib import; at most `zod` if used | Run `npm run check`; inspect module imports | must (issue #5 box 3) |
| AC4 | No test file is added in H1 (types-only); `--passWithNoTests` stays as-is and its removal remains deferred to H2 | `git diff` shows no `*.test.ts`; `package.json` test script unchanged | should (Q1) |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| PRD §4.3 vs backlog H1 wording | medium | PRD table says `ReviewEngine` returns "raw output + **verdict**"; backlog §E0.F2.H1 says "raw output + **optional usage**" and splits the verdict parser to E4.F1.H2. Reconciliation: PRD's "verdict" is the eventual *run* outcome produced downstream by the parser, not the engine's direct return. Q2 locks the thin-invocation reading; flag to user at design gate. |
| Over-specifying `usage` now | low | A rigid token/cost shape risks churn when E1 fixtures reveal real engine output. Kept optional + loose (Q4). |
| Worktree representation choice | medium | A wrong choice risks a core-to-core coupling (importing `workspace`) or an I/O leak. Q3 keeps it a run-local plain ref. |
| Types-only ⇒ no test lands | low | AC3 is verified by `npm run check` (depcruise), which does not need a vitest file; the contract suite is correctly H2. |

## Open Questions And Decisions

| Item | Decision | Class | Needed Before | Status |
|---|---|---|---|---|
| **Q1** Test in H1 or defer to H2? | Types-only in H1. Defer `ReviewEngine.contract` suite + FakeEngine to H2 (#6); `--passWithNoTests` removal stays deferred to H2. Rationale: matches the backlog's explicit H1/H2 split; AC3 is provable without a test file. | **[A]** | — | decided |
| **Q2** Does the port output carry a terminal state, or only raw output + optional usage? | Port output = raw output + optional usage ONLY (thin invocation contract). The terminal-state union is a SEPARATE run-domain type, populated downstream by the verdict parser (E4.F1.H2) / run flow (E4.F1.H1), never returned by the engine. Rationale: avoids leaking E4 parse/verdict scope into H1 and matches the story's two distinct deliverables; reconciles the PRD §4.3 "verdict" wording (that is the run outcome, not the engine return). | **[B] proposed — pending user confirmation at design gate** | design | proposed |
| **Q3** How is "worktree" represented at the boundary? | A minimal run-local plain type `WorktreeRef { path: string }` owned by `run`, carrying only what invocation needs (a filesystem path today). Chosen over a bare `string` for a named, extensible reference and over a `workspace`-owned type to avoid a core-to-core coupling (PRD §4.5 guard 3). Zero I/O — it is a value object, not a handle. | **[B] proposed — pending user confirmation at design gate** | design | proposed |
| **Q4** Shape of `usage` / raw output type | Raw output = plain `string`. `usage` = optional and minimal/loose (e.g. optional token-count fields, open to extension) so E1 fixture reality can refine it without churn. | **[A]** | — | decided |
| **Q5** `zod` schemas vs plain TS types | Plain TS `type`/`interface` for this pure contract port. Reserve `zod` (guard-whitelisted) for where runtime validation is actually needed — parsing/E4. Rationale: keeps the run module's dependency footprint at zero for a types-only contract. | **[A]** | — | decided |

## Approval Notes

- Whole-change scope and continue-lite/auto route pre-approved at session kickoff (ckp-001). Phase checkpoints implicitly approved under that pre-approval.
- Q1, Q4, Q5 are [A] autonomous decisions — decided here, recorded with rationale, reversible.
- Q2 and Q3 are [B] items affecting the central public contract shape; recorded as recommendations, marked "proposed — pending user confirmation" so the orchestrator consults the user at the design gate before `sddl-design` locks the API.
- No protocol-C trigger: the story adds no scope beyond issue #5 and does not contradict the PRD (the §4.3 "verdict" wording is reconciled above, not overridden).

## Budget Notes

- Lite mode; firm scope + AC mapping to issue #5's three checkboxes plus AC4 for the types-only boundary.
