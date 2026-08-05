# E1 — Engine Spike: Working Guide

> **Audience**: the human operator running the spikes (E1 requires real CLI sessions with
> authenticated engines, so it is executed manually, not by an agent).
> **Status**: guide — the permanent deliverables produced by these tasks live elsewhere
> (see [Deliverables](#deliverables)).

## Index

| Doc | Story | Priority | Depends on |
|-----|-------|----------|------------|
| [00-prerequisites.md](00-prerequisites.md) | (shared setup) | — | — |
| [01-spike-claude-code.md](01-spike-claude-code.md) | E1.F1.H1 (issue [#7](https://github.com/nico0695/sentinel-kit/issues/7)) | 🔴 required | — |
| [02-spike-opencode.md](02-spike-opencode.md) | E1.F1.H2 (issue [#8](https://github.com/nico0695/sentinel-kit/issues/8)) | 🔴 required | — |
| [03-capture-fixtures.md](03-capture-fixtures.md) | E1.F1.H3 (issue [#9](https://github.com/nico0695/sentinel-kit/issues/9)) | 🔴 required | H1, H2 |
| [04-context-modes.md](04-context-modes.md) | E1.F1.H4 (issue [#10](https://github.com/nico0695/sentinel-kit/issues/10)) | ⚪ optional | H1, H2 |

Suggested order: `00 → (01 and 02 in any order) → 03 → (04 if doing it)`.

## What this epic is and why it exists

Sentinel delegates the actual code review to external agent CLIs (Claude Code and OpenCode)
instead of implementing its own agent (PRD §6.1 — "the CLI orchestrates, it doesn't reason").
Before the real engine adapters can be written, we need **evidence** of how each CLI behaves
when invoked headlessly: how to feed it a prompt, how to get output back reliably, how it runs
without a human approving actions, and what happens on timeout.

That evidence is this epic. It produces **no production code** — its deliverables are
documentation and captured output fixtures.

**Epic objective** (backlog): canonical invocation of Claude Code and OpenCode resolved with evidence.
**Definition of Done**: invocation doc per engine + real output fixtures captured for contract tests.

## What E1 blocks (and what it doesn't)

```
E0 Foundations ──┬── E1 Engine spike ─────────┐
                 ├── E2 Repos & git ──┐        ▼
                 └── E3 Harnesses ────┴──► E4 Run & engines ──► E5 ──► E6 ──► E7
```

E0, E2, and E3 are **done** (developed against `FakeEngine`). E1 is the only thing standing
between us and E4:

| E4 story | Blocked by |
|----------|-----------|
| E4.F1.H1 `runReview` use case | not blocked by E1 (uses FakeEngine) |
| E4.F1.H2 Verdict parser | E1.F1.H3 (tested against real fixtures) |
| E4.F2.H1 `engines/claude-code` adapter | E1.F1.H1 + E1.F1.H3 |
| E4.F2.H2 `engines/opencode` adapter | E1.F1.H2 + E1.F1.H3 |
| E4.F2.H3 Cascading engine resolution | not directly blocked by E1 |

## The contract the spikes must inform

The `ReviewEngine` port (`src/core/run/ports/review-engine.ts`) is deliberately thin:

```typescript
interface ReviewEngine {
  review(request: ReviewRequest): Promise<ReviewResult>;
}
// ReviewRequest: { worktree: { path }, prompt, timeoutMs }
// ReviewResult:  { output: string, usage?: { inputTokens?, outputTokens?, totalTokens? } }
```

Two consequences that shape what the spikes need to answer:

1. **The engine returns raw output only.** No verdict parsing, no terminal-state decision —
   that happens downstream in the run domain (E4.F1). The spike's job is to find the most
   *reliable way to capture the complete final response text* (and usage data if available),
   not to interpret it.
2. **One `review()` call = one engine invocation.** One-shot invocation is the model; no
   session reuse is required by the port.

The **verdict contract** the engines will be asked to follow (defined by each harness's
`output.md`, e.g. `harnesses/pr-review/output.md`): the first non-empty line of the response
must be `VERDICT: approve|request-changes|comment`. Missing/contradictory verdict ⇒ run is
`ambiguous`. Terminal states downstream: `ok | ambiguous | engine-error | timeout | validation-failed`.

## The four spike questions (PRD §6.2)

For **each** engine, resolve:

1. **Input** — prompt via stdin vs. argument vs. file; size limits of each path.
2. **Output** — available structured format (Claude Code: `--output-format json`; OpenCode:
   evaluate `run` format flags vs. plain text) and how to stably extract the final response.
3. **Execution mode** — one-shot vs. reusable session; permissions/non-interactive mode
   (auto-approval of reads in the worktree); auth via env; availability detection.
4. **Timeout and exit codes** — behavior when killed; exit-code semantics.

Already fixed by the PRD (not up for re-evaluation in the spike): workarounds are encapsulated
per adapter; `isAvailable()` runs before invoking; timeout is mandatory and generous; contract
tests use a mocked binary fed with real fixtures; defensive parsing (ANSI, markdown wrappers,
contradictory verdicts) is the fallback for plain-text outputs.

## Deliverables

| Deliverable | Location | Produced by |
|-------------|----------|-------------|
| Canonical invocation doc — Claude Code | `docs/engines/claude-code.md` | 01 |
| Canonical invocation doc — OpenCode | `docs/engines/opencode.md` | 02 |
| ≥4 real output fixtures per engine | `fixtures/claude-code/`, `fixtures/opencode/` | 03 |
| Context-mode comparison + recommendation (optional) | `docs/engines/context-modes.md` | 04 |

The templates for the `docs/engines/*` files are embedded in docs 01/02/04.

## Epic-level checklist (Definition of Done)

- [ ] `docs/engines/claude-code.md` exists: canonical invocation, limitations, verified against
      the installed version. Manual end-to-end review succeeded. (E1.F1.H1)
- [ ] `docs/engines/opencode.md` exists: canonical invocation, parsing strategy defined.
      Manual test review succeeded. (E1.F1.H2)
- [ ] `fixtures/` holds ≥4 complete, anonymized outputs per engine covering: valid verdict,
      no verdict, noisy output, timeout. (E1.F1.H3)
- [ ] (optional) Context-mode comparison table + assembler-roadmap recommendation. (E1.F1.H4)
- [ ] Everything committed in English, no tokens or personal paths in any artifact.
