# S05 — Story [E0.F2.H1]: ReviewEngine driven port and run terminal-state model

- **Date**: 2026-08-02
- **Branch**: `claude/e0-f2-h1-review-engine-p3ikk3`
- **Scope**: `[E0.F2.H1]` (issue #5) — the central `ReviewEngine` border contract + run-domain terminal states
- **sdd-lite changes**: [e0-f2-h1-review-engine](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/) (`lifecycle_status: completed`) — [proposal](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/proposal.md) · [spec](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/spec.md) · [design](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/design.md) · [plan](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/plan.md) · [execution-log](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/execution-log.md) · [review-ledger](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/review-ledger.md) · [qa-report](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/qa-report.md)

## Objective

Define the `ReviewEngine` driven port (the border contract the whole review flow converges on, PRD §4.3) plus the run-domain terminal-state model, as a types-only core contract under `src/core/run`, guard-green and validated end to end.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S05-D1 | Start the change in `interactive` / `continue-lite` mode, scope = issue #5 | — | User began the story ("comienza") and picked the mode; story fully pinned by #5 + PRD §4.3 | `user` |
| S05-D2 | Standing gate: surface every deviation/suggestion with alternatives + a recommendation **before** formalizing design | Proceed silently on A-level calls | Explicit user constraint at kickoff | `user` |
| S05-D3 | After proposal, switch to `auto` mode; stop only on discrepancy/required interaction; run **two blind parallel validators per stage** | Manual confirmation at each stage routing | User directive to keep momentum while guarding against drift | `user` |
| S05-D4 | Q1: H1 is types-only — defer the `ReviewEngine.contract` suite + `FakeEngine` to E0.F2.H2 (#6); `--passWithNoTests` removal stays with H2 | Land a first test in H1 | Keeps H1 bounded to the type contract; matches the backlog H1/H2 split | `claude` |
| S05-D5 | Q2 (dec-004): `ReviewEngine` returns raw output + optional `usage` only; `TerminalState` is a **separate** run type assigned downstream (E4.F1.H2) | Carry the terminal state on the engine return | Thin invocation contract; prevents E4 scope leaking into H1 (PRD §4.6) | `claude→user` |
| S05-D6 | Q3 (dec-005): worktree at the boundary = run-local `WorktreeRef { readonly path }`, zero I/O | Bare `string`; a `workspace`-owned type | Extensible, no stringly-typing, no core→core coupling (guard 3) | `claude→user` |
| S05-D7 | Design shape (dec-006..009): three concern-separated files + types-only index; `review()` async; `readonly` DTOs; `import type`/`export type` throughout | Single combined `types.ts`; sync method; plain re-exports | Adapter spawns an external CLI (async forced); `verbatimModuleSyntax` makes type-only im/exports mandatory for green `tsc` | `claude` |
| S05-D8 | Q4/Q5: raw output = plain `string`, `usage` all-optional/loose; plain TS types, no `zod` | zod runtime schema; strict usage shape | Pure type contract; lets E1 fixtures refine `usage` later without churn | `claude` |
| S05-D9 | Approve the code-touching executor stage S1 ("si comienza") | Hold at the gate | Planning validated end to end (3 dual-validator passes); explicit gate per CLAUDE.md | `user` |

## Deviations

- **Committer identity / unsigned commits** — early commits landed with a committer email other than `noreply@anthropic.com` (flagged by the stop-hook). Fixed at the spec stage via `git config` + `--amend --reset-author` and a force-push. Commits remain **Unverified/unsigned** (no signing key in this environment); no further action possible here.
- **Mode switch mid-change** (S05-D3) — the change started `interactive` but moved to `auto` after the proposal at the user's direction. The code stage still stopped for explicit approval (S05-D9): CLAUDE.md requires an approval gate for code-touching stages even under auto mode, so auto mode never bypassed it.
- **Proposal worker mis-recorded an auto-mode implicit approval** — corrected by the orchestrator; the session was interactive at that point. Recorded in the change `state.yaml`.
- **Stale `state.yaml` duplicate stage keys** — a mid-change edit left leftover `sddl-plan`/`sddl-executor` pending stubs (duplicate YAML keys); detected and removed during the executor-approval update; validated no duplicates remain.
- No deviation from the PRD/backlog scope: QA confirmed zero creep into H2/E4/E5.

## Work done

- **12 commits** `f5b555c`..`829e38a` on the session branch. Feature: `1d4a710 feat(run): define ReviewEngine driven port and run terminal-state model` (4 files: `worktree-ref.ts`, `terminal-state.ts`, `ports/review-engine.ts`, `index.ts` rewrite). Process artifacts: `476c20e` (executor + 4R) and `829e38a` (final QA). The rest are the per-stage sdd-lite artifacts + validations.
- **sdd-lite lite flow, fully validated**: proposal → spec → design → plan → executor → 4R review → final QA. Three **planning dual-validator passes** (spec, design, plan — acceptance/scope + PRD/architecture-or-tooling), **all no-drift**; validators verified claims against the real `.dependency-cruiser.cjs`, `tsconfig.json`, `package.json`.
- **4R code review** (dec-003 role for the code stage): triaged `standard` → 1 `readability` lens → **clean, 0 findings**; verdict `pass`. [review-ledger](../../sdd-lite/openspec/changes/e0-f2-h1-review-engine/review-ledger.md).
- **Final QA** (adversarial, final mode): independently re-ran the gates and judged **AC1–AC4 all PASS**, zero gaps → `lifecycle_status: completed`.
- **Gates green** (re-run by the orchestrator): `npm run check` exit 0 (biome + `tsc --noEmit` + depcruise, 0 violations, 17 modules) · `npm test` exit 0 (`--passWithNoTests` retained). `package.json` byte-unchanged; no `*.test.ts` added.

## Pending and next steps

- **PR not opened** — per the task rule (no PR unless the user explicitly asks). Branch is pushed and green. **Owner: user** to request; Claude opens `[E0.F2.H1] ReviewEngine port and run domain` (`Closes #5`) on request. (Workflow caps at 5 open PRs; never merge / never push main.)
- **E0.F2.H2 (#6)** — the `ReviewEngine.contract` shared suite + `FakeEngine`, and the deferred `--passWithNoTests` removal, land there. **Owner: next session.**

## Open questions for the user

—
