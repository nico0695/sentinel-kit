# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sentinel

AI-powered code review orchestrator CLI. Hexagonal architecture, TypeScript, Node >=22.

## Current state: E0–E6 complete

The toolchain, `src/` tree, and product surfaces are real. Merged: E0 (scaffold, guards, CI), E1 (engine spikes + fixtures), E2 (git wrapper, worktrees/diff, config store, repo management), E3 (harness system + factory harnesses), E4 (`runReview`, verdict parser, real `claude-code`/`opencode` engine adapters, cascading resolution), E5 (`ProcessRunner` + declared validations, run history), and E6.F1 (the `sentinel` CLI with documented review exit codes). E6.F2 closed the interactive TUI: `[E6.F2.H1]` added the navigation flow — bare `sentinel` on a TTY walks repo → branch → harness → confirm → progress → result — and `[E6.F2.H2]` made the result step readable, rendering a digest (state, verdict, failure, findings grouped by the harnesses' `[SEV: …]` convention, run directory and a `Full review:` pointer at the persisted `result.md`) and then offering the engine's raw markdown behind one opt-in prompt that cannot change the exit code. `sentinel review …` remains the scripting surface (exit codes 0 / configurable-default-1 via `--changes-exit-code` / 2, fail-closed on ok-without-verdict). Runtime deps: `commander`, `execa`, `yaml`, `zod`, `@clack/prompts` (exact-pinned; confined to `tui/clack-prompter.ts`) and `picocolors` (exact-pinned `1.1.1`; confined to `tui/colors.ts`). E6's ⚪ `[E6.F2.H3]` (`sentinel open`) is skipped, not built — workflow contract rule 7.

Remaining MVP work: E7 (E2E smoke, dogfooding, user docs, license, release). The live status is `history/INDEX.md` plus the GitHub milestones — update this section only when an epic-level fact changes.

## Source of truth
- `docs/prd-sentinel.md` — product definition (v0.3). Architecture rules in §4 are MANDATORY.
- `docs/setup-tecnico-sentinel.md` — stack decisions (recommendations, re-evaluate on implementation with justification).
- `docs/backlog-mvp-sentinel.md` — full backlog. GitHub Issues mirror it 1:1 (one issue per story, milestone per epic).
- `docs/architecture.md` · `docs/coding-standards.md` · `docs/testing.md` — human-readable distillation of the standards (structure + the five guards, naming/errors/TS, testing). Validate work against these; they must stay consistent with PRD §4 and `.dependency-cruiser.cjs` (the enforcement). Contributor entry points: `README.md`, `CONTRIBUTING.md`.

## Language policy (strict)

**Everything persisted in this repository is English**: code, comments, identifiers, docs, README files, history entries, sdd-lite artifacts, commit messages, PR and issue titles/bodies. Chat interaction with the user may be Spanish, but nothing Spanish lands in the repo. The only exemption is vendored third-party content (`sdd-lite/` package files such as `USER_GUIDE_ES.md`), which is not ours to edit.

## Commands

Defined in `docs/setup-tecnico-sentinel.md` §5.1:

```bash
npm run dev     # tsup --silent && node dist/cli.js — rebuild (~1s), then run the bundle
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

Driving surfaces: bare `sentinel` on a TTY opens the TUI (non-TTY prints guidance and exits 1); every other invocation reaches the commander CLI unchanged. Both drive the same use cases — the TUI holds zero domain logic, gets its dependencies via `createTuiDeps` in `src/main/container.ts`, and keeps each terminal library confined to one module (`@clack/prompts` to `tui/clack-prompter.ts`, `picocolors` to `tui/colors.ts`, whose palette the pure renderers take as a required argument). Tests use scripted prompter doubles and an injected plain palette — no real TTY, no ambient colour detection.

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

<!-- sdd-lite:start generated_at="2026-09-21T01:32:13Z" version="0.4" package_root="sdd-lite" -->
You have access to `sdd-lite`, a structured workflow for bounded repository changes.

## Worker bypass — evaluate first

If the current prompt is a delegated handoff containing all of these controls:

```yaml
sddl_role: phase-worker | review-worker
stage: sddl-*
execution_profile: sddl-light | sddl-framer | sddl-explorer | sddl-architect | sddl-sequencer | sddl-executor | sddl-reviewer | sddl-qa
orchestration_allowed: false
runtime_loading_allowed: false
```

do not activate or read the sdd-lite runtime, do not load orchestration modules, do not ask for session mode, and do not route stages. Execute only the named canonical skill under `sdd-lite/skills/`, honor its scope and injected standards, return its result contract, and stop. A worker never launches descendants.

## Main-session activation

Activate sdd-lite for the main agent when:

- the user explicitly asks for sdd-lite (`sdd`, `sddl`, `con sdd-lite`, or equivalent)
- a feature, refactor, or fix has uncertain scope or approach
- work spans multiple files, lacks acceptance criteria, or carries non-trivial risk

Do not auto-activate for explanations, clear one-line fixes, or conversational exploration. For substantial work not explicitly requesting SDD, offer it once without forcing it; proceed normally if declined or ignored.

## Main-session runtime

When active, read `sdd-lite/orchestrator/SDDL-RUNTIME.md` once and keep it as the main session's orchestration authority. Follow its module trigger table; never preload every module. The main agent alone owns routing, approvals, result processing, and orchestrator-owned ledger writes.

Use canonical skills under `sdd-lite/skills/`, standards at `./sdd-lite/skill-catalog.md`, and schemas under `sdd-lite/schemas/`. Run bootstrap preflight first, recover from persisted evidence before asking, and keep persisted artifacts in English while chat may be `es` or `en`.

## Platform: Claude Code

- Resolve `execution_profile` from the handoff (or the stage map in `skills/_shared/sddl-flow-contract.md`) and delegate through the native Agent tool as that named type (`sddl-light`, `sddl-framer`, `sddl-explorer`, `sddl-architect`, `sddl-sequencer`, `sddl-executor`, `sddl-reviewer`, `sddl-qa`). Fresh context; wait for the result. Do not use the Skill tool or a history fork as the stage launcher. Do not use the built-in Explore type.
- `interactive`/`auto` controls pacing only. It never bypasses `stage_approval` or another mandatory gate.
- Parallelize only independent read-only work or fully disjoint write scopes. Never overlap artifact writes.
- For 4R and judgment-day, first load `sdd-lite/orchestrator/modules/review-runtime.md`, then launch each selected lens, judge, or refuter as waited `sddl-reviewer` workers. Judges remain blind; workers return findings only.
- Every child receives the worker-bypass controls including `execution_profile`. If it discovers out-of-scope work, it returns `partial` or `blocked`; it does not delegate.
- If the named `sddl-*` agent type is not available (adapters not installed or stale), launch `general-purpose` with `model` taken from that profile in `sdd-lite/templates/agents/profiles.yaml`, paste the body of `sdd-lite/templates/agents/claude/<profile>.md` at the top of the handoff, state that host-level tool limits are not enforced, and recommend rerunning `sddl-init`.
- Under `auto` or `bypassPermissions`, the host ignores `permissionMode: plan` in `sddl-explorer`/`sddl-reviewer`; read-only is then prompt-level only. Keep the review-runtime rule: reject and audit any worker file write.

If the Agent tool is denied or unavailable, state that fresh-context isolation is unavailable and execute the named **skill** in the main context — do not claim a named agent ran. Continue under the complete runtime contract, persist state after each stage, and explain the degradation when a mandatory delegation trigger fires.
<!-- sdd-lite:end -->
