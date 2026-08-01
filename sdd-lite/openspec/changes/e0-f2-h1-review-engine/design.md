# Design

## Routing Digest

- change_name: e0-f2-h1-review-engine
- objective: new-feature — story [E0.F2.H1], issue #5, milestone E0
- route: continue-lite (dec-003 auto-continue; dec-002 design gate honored — Q2/Q3 locked as dec-004/dec-005)
- digest_summary: Replace the `export {}` placeholder in `src/core/run/` with a pure type contract — the `ReviewEngine` driven port under `run/ports/`, plus the run-domain `TerminalState` union and the `WorktreeRef` boundary value — re-exported (types-only) via `run/index.ts`. Zero I/O imports; guard-green by construction. No runtime behavior.
- affected_areas_digest: NEW `src/core/run/ports/review-engine.ts`, NEW `src/core/run/terminal-state.ts`, NEW `src/core/run/worktree-ref.ts`; REWRITE `src/core/run/index.ts`. No adapter/main/other-core-module edit; no dependency added.
- interfaces_digest: `ReviewEngine.review(req: ReviewRequest): Promise<ReviewResult>`; `ReviewRequest { worktree: WorktreeRef; prompt: string; timeoutMs: number }`; `ReviewResult { output: string; usage?: ReviewUsage }`; `ReviewUsage { inputTokens?; outputTokens?; totalTokens? }`; `WorktreeRef { path: string }`; `TerminalState = "ok" | "ambiguous" | "engine-error" | "timeout" | "validation-failed"`.

## Summary

- change_name: e0-f2-h1-review-engine
- objective: new-feature
- route: continue-lite
- design_status: complete — no new [B] items; ready for sddl-plan

This is a types-only core contract. It introduces the product's central border interface (`ReviewEngine`, PRD §4.3) as a thin invocation port and models the run's five terminal states (PRD §4.6) as a distinct run-domain type. All decisions are locked by spec Q1–Q5 and dec-004/dec-005; the residual choices here are A-level naming/layout. `run/` becomes the first core module to own a `ports/` folder, establishing the port-declaration convention siblings will follow.

## Design Overview

### File layout (dec-006, A, claude)

`run/` is the first module to materialize `ports/`. Three concerns → three files, plus the public index:

```
src/core/run/
├── index.ts             # REWRITE: types-only public re-export (was `export {}`)
├── ports/
│   └── review-engine.ts # NEW: ReviewEngine port + ReviewRequest/ReviewResult/ReviewUsage
├── terminal-state.ts    # NEW: TerminalState union (run-domain, NOT on the port return)
└── worktree-ref.ts      # NEW: WorktreeRef value object (port-input boundary type)
```

`WorktreeRef` and `TerminalState` are run-domain types, so they sit at the module root, not under `ports/` (which is reserved for driven-port interfaces). The port file imports `WorktreeRef` intra-module (`../worktree-ref.js`) — allowed, since guard rule 3 only governs cross-module imports.

### The types (the deliverable of this stage)

`src/core/run/worktree-ref.ts`
```ts
/**
 * Core module: run — worktree boundary value.
 *
 * The minimal, run-owned reference handed to a ReviewEngine: the on-disk
 * location of the ephemeral git worktree a review runs in (PRD §5.1). A pure
 * value object — zero I/O, no handle, no coupling to the `workspace` module
 * that creates worktrees (dec-005 / Q3). Kept a named type (not a bare
 * `string`) so it can grow extra invocation-relevant fields without churn.
 */
export interface WorktreeRef {
  /** Absolute filesystem path of the review's worktree. */
  readonly path: string;
}
```

`src/core/run/terminal-state.ts`
```ts
/**
 * Core module: run — terminal state model (PRD §4.6, §9 glossary).
 *
 * Every run ends in exactly one of these five domain states. This union is a
 * RUN-domain type, assigned downstream by the verdict parser (E4.F1.H2) and
 * the runReview flow (E4.F1.H1). It is deliberately NOT part of the
 * ReviewEngine return type (dec-004 / Q2): the engine yields raw output; the
 * run domain decides the terminal state.
 */
export type TerminalState =
  | "ok"
  | "ambiguous"
  | "engine-error"
  | "timeout"
  | "validation-failed";
```

`src/core/run/ports/review-engine.ts`
```ts
import type { WorktreeRef } from "../worktree-ref.js";

/**
 * Core module: run — driven port `ReviewEngine` (PRD §4.3).
 *
 * The border contract the whole product converges on: given a prepared
 * worktree, a prompt, and a timeout, run the review with a delegated engine
 * (Claude Code, OpenCode, …) and return its raw output plus optional usage.
 *
 * THIN invocation contract (dec-004 / Q2): it returns only what the engine
 * produced. It does NOT parse a verdict and does NOT decide a TerminalState —
 * that is run-domain work done downstream (E4.F1.H1/H2). Adapters implement
 * this port in `src/adapters/driven/engines/*`; the core never knows which
 * engine runs. Its shared contract suite + FakeEngine land in E0.F2.H2 (#6).
 */
export interface ReviewEngine {
  /**
   * Run one review in the given worktree and return the engine's raw output.
   * Asynchronous by nature — the implementing adapter spawns an external CLI.
   */
  review(request: ReviewRequest): Promise<ReviewResult>;
}

/** Invocation input: what an engine needs to run one review. */
export interface ReviewRequest {
  /** The ephemeral worktree the review runs in. */
  readonly worktree: WorktreeRef;
  /** Fully assembled prompt (harness + skills + diff + validations). */
  readonly prompt: string;
  /** Hard wall-clock budget for the invocation, in milliseconds. */
  readonly timeoutMs: number;
}

/** Invocation output: the engine's raw result, nothing interpreted. */
export interface ReviewResult {
  /** Raw, unparsed engine output (markdown / text / JSON as produced). */
  readonly output: string;
  /** Optional, best-effort resource usage if the engine exposes it. */
  readonly usage?: ReviewUsage;
}

/**
 * Minimal, intentionally loose usage shape. Every field optional so E1
 * engine-spike fixtures can refine it without churn (Q4). Not a cost/billing
 * model — only what an engine happens to report.
 */
export interface ReviewUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}
```

`src/core/run/index.ts` (REWRITE — replaces `export {}`)
```ts
/**
 * Core module: run — review orchestration, states, verdict (PRD §4.2).
 *
 * Public API (types only in H1): the `ReviewEngine` driven port and its
 * invocation types, plus the run-domain `TerminalState` model and the
 * `WorktreeRef` boundary value. The runReview use case lands in E4.F1.x; the
 * module's second driven port, ProcessRunner, lands in E5.F1.x.
 */
export type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
  ReviewUsage,
} from "./ports/review-engine.js";
export type { TerminalState } from "./terminal-state.js";
export type { WorktreeRef } from "./worktree-ref.js";
```

### Naming / shape decisions (all A-level)

- **dec-007 (A)** — method `review(request)`: verb matching the domain role `ReviewEngine`, avoids the vague/module-colliding `run`. Returns `Promise<ReviewResult>`: a process-spawning adapter is async by nature — there is no viable sync alternative, so this is forced, not a B trade-off.
- **dec-008 (A)** — type names `ReviewRequest` / `ReviewResult` / `ReviewUsage`; `timeoutMs` carries its unit in the name; all boundary members `readonly` (immutable DTOs). Reversible identifiers; shape itself is locked by Q2/Q3/Q4.
- **dec-009 (A)** — `import type` / `export type` throughout: mandatory under `verbatimModuleSyntax: true` (a plain `export { ReviewEngine }` of a type is a tsc error). Load-bearing for a green `tsc --noEmit`.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/core/run/ports/review-engine.ts` | NEW — port + invocation types | low (pure types) |
| `src/core/run/terminal-state.ts` | NEW — `TerminalState` union | low |
| `src/core/run/worktree-ref.ts` | NEW — `WorktreeRef` value object | low |
| `src/core/run/index.ts` | REWRITE — `export {}` → `export type` re-exports | low |
| Other core modules / adapters / main | none touched | none |
| Dependencies | none added (zod whitelist unused) | none |

Blast radius: one core module's types + its public index. Zero runtime, zero behavior, zero new dependency. Downstream unblocked: E0.F2.H2 (#6) contract suite + FakeEngine, E1 spikes, E4.F1.H1/H2, E4.F2.x.

## Interfaces, Data, And State

- Full type surface is listed verbatim above. No runtime data or state transitions — `TerminalState` names the states but H1 ships no transition logic. The port's async signature is the stable contract adapters and the H2 FakeEngine implement.

### Architecture-guard compliance (0-violation by construction)

| Guard (PRD §4.5) | Why it holds |
|---|---|
| core-no-adapters (rule 1) | No file imports `adapters/**` or `main/**`. |
| core-no-io-libs (rule 2) | No npm/builtin import anywhere; the only import is intra-module `import type { WorktreeRef } from "../worktree-ref.js"`. zod whitelist unused (Q5). |
| core-modules-via-index (rule 3) | No cross-module import; the sole import is within `run`. `index.ts` re-exports only run's own files. |
| adapters-isolated (rule 4) | N/A — no adapter touched. |
| wiring-only-in-main (rule 5) | N/A — `main/` not touched. |

`npm run check` = biome (files pre-written in house style: 2-space, double quotes, trailing commas, semicolons, ≤80 cols; executor confirms with `biome check`) + `tsc --noEmit` (pure types compile; `isolatedModules` + `verbatimModuleSyntax` satisfied by the `export type` re-exports) + `depcruise src` (no forbidden edge exists). AC4: no `*.test.ts` added, `package.json` test script untouched.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| `WorktreeRef` as bare `string` | Rejected (dec-005/Q3) | Stringly-typed, not extensible; a named value object is self-documenting and grows without signature churn. |
| Import a `workspace`-owned worktree type | Rejected (dec-005/Q3) | Creates a core-to-core coupling (rule 3) for a boundary that needs only a path. |
| `TerminalState` on the engine return | Rejected (dec-004/Q2) | Leaks E4 verdict/parse scope into H1; engine yields raw output only. |
| One combined `types.ts` file | Rejected | Three unrelated concerns (port / outcome model / boundary value); separate files read better and match the port-per-file convention `ports/` implies. |
| Sync `review(): ReviewResult` | Rejected | An external-CLI adapter is inherently async; sync would force a redesign at E4.F2. |
| `zod` runtime schemas | Rejected (Q5) | Pure type contract; no runtime validation needed here — keeps run's dependency footprint at zero. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None blocking | All shape decisions locked by Q1–Q5 / dec-004 / dec-005; residual calls (dec-006..009) are A-level naming/layout, reversible | — | resolved |
| `exactOptionalPropertyTypes: true` interaction | Optional `usage?` / `*Tokens?` must be absent-or-present, never `= undefined`; the design uses plain optionals with no `| undefined`, which is compliant | executor `tsc --noEmit` | executor-verify (expected green) |

## Approval Notes

- Design gate (dec-002) already satisfied: Q2/Q3 were surfaced with alternatives + recommendation and locked as dec-004/dec-005 before this stage. This design reflects them, does not relitigate them.
- New decisions this stage are all **A-level** (dec-006 layout, dec-007 method/async, dec-008 type names, dec-009 `export type` mandate) — technical, reversible, PRD-aligned; recorded for state.yaml by the orchestrator. **No new [B] items**: the public shape (input = worktree+prompt+timeout, output = raw string + optional usage) is fully bounded by the locked questions; only reversible identifiers/layout were chosen.
- No protocol-C trigger: no scope expansion (FakeEngine/contract suite/verdict parser/ProcessRunner all remain out), no PRD contradiction (§4.3 "verdict" reconciled in spec as the downstream run outcome).
- Next stage: `sddl-plan`.

## Budget Notes

- Above the lite word target because the verbatim type source IS this stage's deliverable (handoff item: "the precise TypeScript interfaces/types … so plan/executor can implement without re-deciding"); prose elsewhere kept minimal.
