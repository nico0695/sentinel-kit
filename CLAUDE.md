# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sentinel

AI-powered code review orchestrator CLI. Hexagonal architecture, TypeScript, Node >=22.

## Current state: pre-implementation

The repo has **no commits and no source code yet** — no `package.json`, no `src/`, no toolchain installed. What exists is the specification (`docs/`), the issue-seeding script, and a vendored `sdd-lite/` package. The first story to land is `[E0.F1.H1]` (scaffold + `npm run check`). Until it does, the commands below do not exist yet; do not assume a working `npm` setup.

## Source of truth
- `docs/prd-sentinel.md` — product definition (v0.3), in English. Architecture rules in §4 are MANDATORY.
- `docs/setup-tecnico-sentinel.md` — stack decisions, in Spanish (recommendations, re-evaluate on implementation with justification).
- `docs/backlog-mvp-sentinel.md` — full backlog, in Spanish. GitHub Issues mirror it 1:1 (one issue per story, milestone per epic).

Persisted artifacts and code stay in English regardless of the doc's language.

## Commands

Defined in `docs/setup-tecnico-sentinel.md` §5.1 — they become real with `[E0.F1.H1]`:

```bash
npm run dev     # node --experimental-strip-types src/main/cli.ts
npm run build   # tsup — ESM bundle of the bin
npm run check   # biome check . && tsc --noEmit && depcruise src
npm test        # vitest run
```

`npm run check` is the quality gate: lint/format + typecheck + **architecture guards in one command**. Both `check` and `test` must pass locally before opening any PR.

Vitest is split into projects (`core` unit / `adapters` contract / `e2e` smoke), so a single suite runs as `npx vitest run --project core` and a single test as `npx vitest run -t "<name>"`.

### create-issues.sh

`./create-issues.sh <owner>/<repo>` seeds GitHub with the 8 epic milestones and 44 story issues from the backlog, via `gh` CLI. Labels and milestones are idempotent; **issues are not** — a second run creates 44 duplicates. One-shot bootstrap only.

## Architecture

Modular hexagonal: ports & adapters as the border rule, modules per domain inside the core (PRD §4.2).

```
src/core/       repos · workspace · review · run · history · shared
                each module declares its own driven ports in <module>/ports
src/adapters/   driving/  → cli, tui
                driven/   → engines (claude-code, opencode), git, exec, storage
src/main/       composition root — the only place adapters are instantiated
```

Ports are owned by the domain module that needs them, not by a central technical folder. The MVP port catalog (PRD §4.3): `ReviewEngine` (run), `GitPort` (repos/workspace), `ConfigStore` (repos/review), `RunStore` (history), `ProcessRunner` (run).

The review flow all stories converge on: **worktree → diff → prompt → engine → parse → terminal state → cleanup**. An ephemeral git worktree per review (never a checkout in the managed clone — that serializes reviews), diffed as `merge-base(base, target)..target` to match PR semantics.

## Architecture guards (also enforced by dependency-cruiser in CI)
- `src/core/**` never imports from `src/adapters/**`, `src/main/**`, or any I/O library (whitelist: zod).
- Core modules import each other only via their public `index`.
- Adapters never import other adapters.
- Adapter instantiation only in `src/main/`.
- Use cases are the ONLY API of the core — no logic in TUI/CLI commands.

These guards are also the extraction guarantee: while they hold, `core/` can be published as a standalone package without refactoring.

## Workflow contract (strict)
1. Work is organized by **epic** (milestone). Only work on stories from the current epic unless explicitly told otherwise.
2. **One PR per story** (`[E2.F1.H2] Title` as PR title). Trivial related stories may share a PR if same feature — say so in the description.
3. **Max 5 open PRs at any time.** If 5 are open, STOP and wait for merges.
4. Every PR: references its issue (`Closes #N`), passes `npm run check` and `npm test` locally before opening, includes what/why in the description.
5. **Never merge PRs. Never push to main.** The human reviews and merges everything.
6. When the epic's stories are all in open/merged PRs: post a summary (done, pending review, blockers, suggestions for next epic) and STOP.
7. Stories marked ⚪ (optional) are skipped unless explicitly requested.
8. If a story conflicts with the PRD or reality contradicts an assumption: STOP and ask, don't improvise scope.

## Conventions
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`...).
- Ports named by domain role (`ReviewEngine`, `RunStore`), never by implementation (`ClaudeService` ❌).
- Adapters named by the technology they implement — the folder says "how", the port says "what".
- Use cases are verb + noun in camelCase (`runReview`). Domain errors carry the `Error` suffix and live in their module (`WorktreeCreationError`).
- No `services/` or `utils/` folders in core.
- Errors: adapters translate raw exceptions into port errors; every run ends in a terminal state (`ok | ambiguous | engine-error | timeout | validation-failed`).
- Tests: core = unit with in-memory fakes; adapters = shared contract suites (fixtures in `fixtures/`); e2e = smoke with FakeEngine.
- Runtime-agnostic code: standard Node APIs only, no `Bun.*` / `Deno.*`.

## Session kickoff
At the start of each session: read the current milestone's open issues (`gh issue list --milestone "<epic>"`, or the GitHub MCP tools in remote sessions), state the plan (which stories, in which PRs), then execute.

## sdd-lite activation policy (project rule — overrides the generic wrapper guidance below)

Activation is deterministic, not suggested:

1. **Mandatory**: every backlog story (`[E*.F*.H*]`) runs as an sdd-lite change. Change name = story id + slug (e.g. `e0-f1-h1-scaffold`), persisted under `sdd-lite/openspec/changes/<change-name>/`.
2. **Mandatory**: any multi-file feature, refactor, or bug fix without a clear one-line cause — even outside the backlog.
3. **Exempt** (proceed directly, no ceremony): doc typos/wording, clear one-line fixes, questions/explanations, session operations (commits, pushes, issue seeding, history entries).
4. When in doubt between 2 and 3, activate sdd-lite.
5. At every stage (proposal → spec → design → plan → executor → qa), validate the work against PRD §4, the architecture guards, and the story's acceptance criteria. Any deviation or contradiction is classified with the decision protocol below and recorded in the audit history.

## Decision protocol (A/B/C)

Every non-trivial decision falls in exactly one level:

- **A — Autonomous**: technical, reversible, aligned with PRD/setup (file naming, test ordering, internal structure). Decide without asking; record it in the audit history with its rationale.
- **B — Consult**: two or more viable alternatives with real trade-offs, or anything affecting public API, UX, config formats, or repo structure. Present options **with a recommendation**; the user decides. Record who decided.
- **C — STOP**: the task contradicts the PRD/backlog, expands scope, or reality refutes a documented assumption. Stop and ask — never improvise scope (workflow contract rule 8).

If a decision sits between two levels, escalate to the higher one (A→B, B→C).

## Audit history (mandatory)

`history/` is the audit trail of the development process (rules in `history/README.md`):

- Every work session produces or updates exactly one entry in `history/entries/`, following `history/TEMPLATE.md`, via the `history-log` skill.
- The entry is written **before closing**: end of session, end of story, or any STOP — whichever comes first. Closing a story without its history entry is as invalid as opening a PR without `npm run check`.
- Every A-level decision, every B/C consultation and its outcome, and every deviation must appear there with explicit authorship (`user` / `claude` / `claude→user`).
- History entries are committed to git (remote environments are ephemeral — uncommitted history is lost).
- sdd-lite changes are not duplicated: entries link to `sdd-lite/openspec/changes/<change>/` artifacts instead of copying them.

---

<!-- sdd-lite:start generated_at="2026-08-01T13:14:29Z" version="0.1" package_root="sdd-lite" -->
You are a development assistant with access to `sdd-lite`, a structured change workflow for bounded repo changes.

## When to use sdd-lite

This project replaces the generic "suggest sdd-lite" guidance with the deterministic **"sdd-lite activation policy"** section defined above, outside this generated block. In short: backlog stories and multi-file changes ALWAYS run through the `sdd-lite` orchestrator (canonical contract at `sdd-lite/orchestrator/SDDL-ORCHESTRATOR.md`); trivial fixes and session operations do not. If `sddl-init` ever regenerates this block, the project policy above still governs.

## When sdd-lite is active

Read and follow the canonical orchestration contract at `sdd-lite/orchestrator/SDDL-ORCHESTRATOR.md`.
That contract is the single source of truth for delegation rules, handoff envelopes, result processing, routing, approvals, and all operational behavior.

Use canonical skills under `sdd-lite/skills/`, runtime standards at `./sdd-lite/skill-catalog.md`, and schemas under `sdd-lite/schemas/`.

Rules:
- Run bootstrap preflight first. If bootstrap files are missing or unusable, stop and run `sddl-init`.
- Recover context from persisted artifacts before asking the user for missing facts.
- Persisted artifacts must remain in English. Chat interaction may be `es` or `en`.

## Platform: Claude Code

### Agent tool delegation

Delegation uses the native **Agent tool**. Each stage worker receives a fresh context via a dedicated Agent call. Pass the compact handoff envelope as the agent prompt. Do not use the Skill tool or Task tool for stage delegation.

`interactive` / `auto` controls pauses between stages only. It does not grant permission to bypass `stage_approval`, skip mandatory checkpoints, or omit approval gates for code-touching stages. These are always required regardless of execution mode.

### Parallelization

Parallelize only independent read-only tasks (e.g., `sddl-deep-explorer` alongside a non-writing stage) or workers with fully disjoint write scopes. Never parallelize workers that write to overlapping artifact paths.

### Review protocols

`sddl-code-review` lenses and `sddl-judgment-day` judges run as parallel read-only Agent workers per the Review Worker Envelope in `SDDL-ORCHESTRATOR.md`. Launch judgment-day judges in one parallel batch, wait for both results before merging, and never let one judge see the other's output. Review workers return `findings` only; the orchestrator writes `review-ledger.md`.

### Worker boundaries

Child workers launched via Agent tool must not launch additional sub-agents. If a worker discovers work beyond its assigned scope, it must return `partial` or `blocked` with a `next_action` — not a new Agent call.

### Fallback if Agent tool is unavailable

If Agent tool delegation is denied or unavailable (e.g., blocked by user permissions):

- State visibly that stages will run without fresh-context isolation.
- Persist `state.yaml` immediately after each stage completes before continuing.
- Apply all canonical result-processing, routing, and approval rules.
- When a mandatory delegation trigger fires, explain the degradation before continuing inline.
<!-- sdd-lite:end -->
