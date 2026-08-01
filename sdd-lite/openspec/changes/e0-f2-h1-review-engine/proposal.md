# Proposal

## Routing Digest

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- digest_summary: Backlog story [E0.F2.H1] (issue #5): define the `ReviewEngine` driven port (input worktree + prompt + timeout; output raw output + optional usage) in `src/core/run/ports`, plus the run-domain terminal-state model `ok | ambiguous | engine-error | timeout | validation-failed`, exported via run's public `index`, with zero I/O imports (depcruise stays green; core whitelist is `zod` only). This is THE central contract that unblocks all downstream engine/spike/adapter work.
- feasibility_signal: very high — types-only, greenfield core module, no runtime behavior; guards are trivially satisfied. The only real work is pinning the exact type shapes and whether a test lands now.
- scope_sketch_digest: In: `core/run/ports/` ReviewEngine port + run-domain terminal-state types + public re-export via `core/run/index.ts`, guard-green. Out (park to H2 #6): FakeEngine, `ReviewEngine.contract` suite, `--passWithNoTests` removal. Out (later epics): runReview flow (E4.F1.H1), verdict parser (E4.F1.H2), ProcessRunner (E5.F1.x), real adapters (E4.F2.x).

## Summary

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- proposal_status: complete
- exploration_performed: true (targeted: backlog §E0.F2 + PRD §4.3 port catalog read to fix the H1/H2 boundary; `src/core/run/index.ts` placeholder and sibling module port-comment convention confirmed. All toolchain/repo-state facts injected pre-verified by the orchestrator handoff.)

## Problem And Desired Outcome

**Problem.** `ReviewEngine` is the border contract the whole product converges on (PRD §4.3: declared by `run`, implemented by `engines/claude-code` and `engines/opencode`). Today `src/core/run/` is a single placeholder `export {}` whose comment merely reserves `./ports`. Nothing engine-related can proceed without it: E0.F2.H2 (FakeEngine + contract suite), E1 spikes, E4.F1.H1 (runReview flow), E4.F1.H2 (verdict parser), and E4.F2.x (real adapters) all depend on this type existing. Until the port and the run-domain terminal states are typed, every downstream story is blocked on an undefined interface.

**Desired outcome.** `src/core/run/ports/` declares the `ReviewEngine` driven port — input = worktree + prompt + timeout, output = raw output + optional usage — and the run domain models the five terminal states `ok | ambiguous | engine-error | timeout | validation-failed`. Both are exported through run's public `index.ts` (core modules import each other only via `index`). The module imports no I/O library (depcruise `core-no-io-libs` / no-adapters guards stay green; whitelist is `zod` only). No runtime behavior ships — this story defines the contract that decouples all engine/spike development.

## Initial Scope Sketch

### Likely In Scope

- `ReviewEngine` driven port typed under `src/core/run/ports/` (named by domain role, never implementation).
- Port input type: worktree reference + prompt + timeout. Port output type: raw output + optional usage.
- Run-domain terminal-state model: the union `ok | ambiguous | engine-error | timeout | validation-failed` as a first-class run type.
- Public re-export of the port + run-domain types via `src/core/run/index.ts` (replacing the `export {}` placeholder).
- Guard-green endpoint: `npm run check` (biome + tsc --noEmit + depcruise src) stays 0-violation; no adapter/main/I/O imports.

### Likely Out Of Scope

- `FakeEngine` implementation and the `ReviewEngine.contract` shared contract suite — owned by **E0.F2.H2 (issue #6)**, the next story.
- Removing `--passWithNoTests` from the `test` script — deferred duty (e0-f1-h3 risk-004 / dec-002) that fires when the **first real test file** lands; stays with H2 if H1 is types-only.
- `runReview` use case / worktree→diff→prompt→engine→parse→cleanup orchestration — E4.F1.H1.
- Verdict parsing that assigns `ok`/`ambiguous` from raw output — E4.F1.H2.
- `ProcessRunner` port (also `run`-declared) — E5.F1.x, per the module comment.
- Any real engine adapter — E4.F2.x.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Change surface | Types-only in a greenfield core module; no runtime code, no algorithm, no I/O | very high |
| Guard compliance | A pure-type port with no imports (or `zod` only) satisfies `core-no-io-libs` and no-adapters guards by construction | very high |
| Spec pinning | Story text fixes input/output shape and the exact terminal-state union; little interpretive room | high |
| Test boundary | Contract suite + FakeEngine are explicitly H2, so H1 is very likely types-only — the one open decision that shapes whether any test/`--passWithNoTests` change lands here | medium |
| Cross-module shape | How "worktree" is represented at the port boundary touches the `workspace` module's future domain; must stay a plain reference, no I/O | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **Test in H1 or defer to H2?** Does H1 land any test now, or is the `ReviewEngine.contract` suite + FakeEngine strictly deferred to E0.F2.H2? Surface (not decide) recommendation: **types-only in H1, defer suite to H2**. | Determines whether a test file lands, and therefore whether the `--passWithNoTests` removal (e0-f1-h3 risk-004) fires in this story or stays with H2. This is the primary framing decision. | open → spec |
| Does the `ReviewEngine` return type carry a terminal state, or only raw output + usage (states assigned later by parse/flow)? Story lists them as two separate deliverables — port output is raw, the terminal-state model is a distinct run type populated downstream (E4.F1.H2). | Sets whether the port signature couples to verdict outcomes or stays a thin invocation contract. Mis-coupling would leak E4 scope into H1. | open → spec |
| How is "worktree" represented at the port boundary — a path string, a run-local `WorktreeRef`, or a type owned by the `workspace` module? Must be a plain reference with zero I/O. | Cross-module ownership + guard safety; a wrong choice risks a core-to-core coupling or an I/O leak. | open → spec/design |
| Shape of `usage` (optional): typed token/cost fields vs an open record, and whether raw output is a plain `string`. | Keeps the output minimal without pre-empting E1 fixture reality; over-specifying now risks churn in E4. | open → spec/design |
| `zod` vs plain TS types: does H1 introduce `zod` schemas (whitelisted) for the run types, or stay pure `type`/`interface`? Surface recommendation: **pure TS types for a contract port**; reserve `zod` for where runtime validation is actually needed (parsing, E4). | Affects the module's dependency footprint and how downstream validates; both are guard-legal, so this is a design-texture call for spec to frame. | open → spec |

## Approval Notes

- Whole-change scope and auto/continue-lite route pre-approved by the user session-kickoff for the current epic; phase checkpoints are implicitly approved per that pre-approval (recorded as ckp-001).
- The open questions above are resolution work routed to `sddl-spec`, not blockers for framing — the problem and the H1/H2 boundary are unambiguous.
- No protocol-B/C consultation is triggered by this proposal: the story does not contradict the PRD/backlog and adds no scope beyond issue #5.

## Budget Notes

- Kept lightweight per lite mode; `sddl-spec` owns firm scope boundaries and acceptance criteria (AC mapping to issue #5's three checkboxes).
