# Plan

## Execution Digest

- change_name: e0-f2-h1-review-engine
- objective: new-feature — story [E0.F2.H1], issue #5, milestone E0
- route: continue-lite
- digest_summary: One execution stage writes the four types-only files locked by design.md (`worktree-ref.ts`, `terminal-state.ts`, `ports/review-engine.ts`, `index.ts` rewrite), in leaf→port→index dependency order. Verbatim type source is frozen in design.md; the executor transcribes, it does not redesign.
- stage_plan_digest: Single code-touching stage S1 (all four files, one atomic diff). Precondition P0: `npm ci` (node_modules absent). No split — the diff is tiny, cohesive, and only checkable as a whole (`tsc`/`depcruise` need the index re-export resolving the leaves).
- validation_digest: Acceptance gate = `npm run check` (biome check . && tsc --noEmit && depcruise src) reporting 0 violations; `npm test` (`vitest run --passWithNoTests`) still green; AC4 boundary = `git diff` shows no `*.test.ts` and the `package.json` `test` script unchanged.

## Summary

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete — one execution stage, no new [B] items; STOP at the sddl-executor approval gate before S1 runs.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| P0 | Toolchain readiness — install locked deps so the gate commands exist | — | `npm ci` (node_modules is absent; package-lock.json present). No repo-source edit. | `npx tsc --version`, `npx depcruise --version`, `npx biome --version` all resolve | no | no (env prep, A-level) | pending |
| S1 | Write the four types-only files verbatim from design.md, in leaf→port→index order | P0 | NEW `src/core/run/worktree-ref.ts`; NEW `src/core/run/terminal-state.ts`; NEW `src/core/run/ports/review-engine.ts`; REWRITE `src/core/run/index.ts` (`export {}` → types-only `export type` re-exports of all six identifiers). No other file touched, no dependency added. | `npm run check` = 0 violations; `npm test` green; AC4: `git diff --name-only` lists no `*.test.ts`, `package.json` `test` script byte-unchanged | yes | yes — executor gate (CLAUDE.md, even under auto mode) | pending |

## Validation Strategy

- **Per-file transcription check (within S1):** each file must match design.md byte-for-intent — `WorktreeRef { readonly path: string }`; `TerminalState` = the five-member union; `ReviewEngine.review(ReviewRequest): Promise<ReviewResult>` + `ReviewRequest`/`ReviewResult`/`ReviewUsage`, importing `import type { WorktreeRef } from "../worktree-ref.js"`; `index.ts` re-exporting the six identifiers via `export type { … }`. All `import type`/`export type` (dec-009, mandatory under `verbatimModuleSyntax: true`); NodeNext `.js` specifiers.
- **Change-wide acceptance gate (S1):** `npm run check` resolves to `biome check .` (house style: 2-space, double quotes, trailing commas, semicolons, ≤80 cols) **&&** `tsc --noEmit` (NodeNext + `verbatimModuleSyntax` + `exactOptionalPropertyTypes` — plain optionals with no `| undefined` keep AC1/AC2 compiling) **&&** `depcruise src` (auto-discovers `.dependency-cruiser.cjs`). Must report **0 violations**. This single command covers AC1 (port typed + index re-export compiles), AC2 (union resolves), and AC3 (no forbidden edge; the only import is the intra-module `import type` from `../worktree-ref.js`, which is not in the `core-no-io-libs` forbidden `dependencyTypes` and satisfies `core-modules-via-index`).
- **Boundary check (AC4):** `git diff --name-only` shows only the four target paths and no `*.test.ts`; `git diff package.json` is empty (the `--passWithNoTests` removal stays deferred to H2). `npm test` runs `vitest run --passWithNoTests` and stays green with no test file present.

## Dependencies And Sequencing

- **P0 → S1.** node_modules is absent; `biome`, `tsc`, and `depcruise` cannot run until deps are installed. package-lock.json is present, so `npm ci` is the deterministic install. Flagged as a hard precondition: without it the S1 gate cannot be evaluated.
- **Intra-S1 write order (leaf → port → index):** write `worktree-ref.ts` and `terminal-state.ts` first (leaf types, no intra-repo imports), then `ports/review-engine.ts` (imports `WorktreeRef` from `../worktree-ref.js`), then rewrite `index.ts` (re-exports all six identifiers from the other three). Rationale: the port file's `import type` and the index re-exports resolve only once their targets exist, so `tsc`/`depcruise` are green only after the whole set lands — which is exactly why this is **one stage, not four**.
- **Granularity — single stage, justified:** the diff is ~4 small files with zero runtime and one intra-module edge. Splitting per file would create stages that cannot pass `tsc --noEmit`/`depcruise` in isolation (a lone `index.ts` re-exporting not-yet-written modules fails to compile), so each split stage would not be independently checkable — violating the stage-plan rule. A single atomic stage is the smallest independently verifiable unit here.

## AC Traceability

- **AC1** (`ReviewEngine` typed under `core/run/ports`, input = worktree ref + prompt + timeout, output = raw + optional usage, re-exported via `index.ts`): S1 files + `tsc --noEmit` green.
- **AC2** (five terminal states as a first-class run-domain type, exported via `index`, NOT on the engine return): S1 `terminal-state.ts` + union resolves; design keeps it off `ReviewResult`.
- **AC3** (zero I/O imports; `npm run check` 0 violations): S1 acceptance gate (`depcruise src`).
- **AC4** (no test file added; `package.json` test script unchanged): S1 boundary check (`git diff`).

## Planner Stop Note

- objective is `new-feature`, not `planner`: this plan is execution-ready, not terminal-and-frozen.
- Route is `continue-lite`, not `macro-plan-first`: no macro-plan.md; the stage table is the executable plan.

## Approval Notes

- **STOP at the sddl-executor approval gate.** S1 is code-touching; per CLAUDE.md it requires explicit user approval before it runs, even under auto mode (dec-003). The orchestrator must not auto-route into execution.
- No new **[B]** items introduced by this stage. All shape/naming/layout calls were locked upstream (dec-004..dec-009); this plan only sequences them. P0 (`npm ci`) and the single-stage granularity are **[A]** — technical, reversible, PRD-aligned.
- **Risk/rollback:** trivial. S1 is three new files plus one index rewrite, zero runtime, zero dependency. Rollback = delete the three new files and restore `src/core/run/index.ts` to `export {}` (`git checkout -- src/core/run/`). No migration, no data, no downstream side effects.

## Budget Notes

- Proportional single-stage plan for a types-only contract; prose kept minimal, tables carry the executable detail.
