# MVP Backlog — `sentinel`

> Derived from PRD v0.3 and the technical setup. Traceability: acceptance criteria map to the ✅/⚪ of PRD §3.1.
> Format: Epic (objective + DoD) → Feature (description + priority) → Story (ticket).
> Priority: 🔴 required (no MVP without this) · ⚪ optional.

---

## Stages and dependencies

```
E0 Foundations ──┬── E1 Engine spike ─────────┐
                 ├── E2 Repos & git ──┐        ▼
                 └── E3 Harnesses ────┴──► E4 Run & engines ──► E5 Valid. & history ──► E6 Interface ──► E7 Wrap-up
```

E2 and E3 run in parallel with E1 (development against `FakeEngine`). E1 only blocks E4.

| Epic | 🔴 Stories | ⚪ Stories |
|---|---|---|
| E0 Foundations | 5 | 0 |
| E1 Engine spike | 3 | 1 |
| E2 Repos & git | 7 | 1 |
| E3 Harnesses & prompt | 6 | 1 |
| E4 Run & engines | 5 | 0 |
| E5 Validations & history | 4 | 1 |
| E6 Interface | 4 | 1 |
| E7 Wrap-up | 5 | 0 |
| **Total** | **39** | **5** |

---

## E0 — Foundations

**Objective**: repo base with architecture protected from commit 1.
**DoD**: CI green (lint + types + guards + tests + build) and `FakeEngine` passing the contract suite.

### E0.F1 — Repo and tooling · 🔴

#### E0.F1.H1 — Create repo and scaffold the hexagonal structure
🔴 required · Depends on: —
Objective: project existence with the structure from PRD §4.2.
Description: create `sentinel` repo, reserve `@<scope>/sentinel` on npm, scaffold `src/{core,adapters,main}` with empty modules + `harnesses/`, `skills/`, `fixtures/`. Base configs: package.json (ESM, bin `sentinel`+`snt`, engines ≥22), strict tsconfig, biome.
Acceptance: [ ] complete structure per PRD §4.2 · [ ] `npm run check` runs biome+tsc · [ ] npm package reserved.

#### E0.F1.H2 — Executable architecture guards
🔴 required · Depends on: E0.F1.H1
Objective: the 5 rules from PRD §4.5 automatically verified.
Description: configure dependency-cruiser with the rules from setup §5.3 (core-no-adapters, core-no-io-libs with whitelist, modules via index, isolated adapters, wiring only in main); integrate it into `npm run check`.
Acceptance: [ ] prohibited import breaks the check · [ ] core whitelist documented in the config.

#### E0.F1.H3 — CI pipeline
🔴 required · Depends on: E0.F1.H2
Objective: nothing enters main without passing quality + guards.
Description: GitHub Actions `ci.yml` with jobs check (biome, tsc, depcruise), test (vitest, Node matrix 22/24), and build (tsup + smoke `sentinel --version`).
Acceptance: [ ] all 3 jobs run on PR and push to main · [ ] broken guard = red pipeline.

### E0.F2 — Base contracts · 🔴

#### E0.F2.H1 — `ReviewEngine` port and run domain
🔴 required · Depends on: E0.F1.H1
Objective: the central contract that decouples all spike development.
Description: define in `core/run` the `ReviewEngine` port (input: worktree + prompt + timeout; output: raw output + optional usage) and the run domain types with terminal states `ok | ambiguous | engine-error | timeout | validation-failed`.
Acceptance: [ ] port typed in `core/run/ports` · [ ] terminal states modeled · [ ] zero I/O imports (guard green).

#### E0.F2.H2 — `FakeEngine` + shared contract suite
🔴 required · Depends on: E0.F2.H1
Objective: develop and test the entire MVP without real engines.
Description: implement `FakeEngine` (configurable responses: valid verdict, ambiguous, timeout, error) and the `ReviewEngine.contract` contract suite that every implementation must pass.
Acceptance: [ ] FakeEngine passes the suite · [ ] suite reusable by future adapters · [ ] error scenarios covered.

---

## E1 — Engine spike

**Objective**: canonical invocation of Claude Code and OpenCode resolved with evidence.
**DoD**: invocation doc per engine + real output fixtures captured for contract tests.

### E1.F1 — Spike · 🔴

#### E1.F1.H1 — Spike Claude Code headless
🔴 required · Depends on: —
Objective: resolve the 4 points from PRD §6.2 for Claude Code.
Description: on a test worktree with known diff, determine input (stdin/arg/file + limits), output (`--output-format json`: structure and stable extraction), non-interactive mode (auto-approved read permissions, auth via env), timeout, and exit codes.
Acceptance: [ ] canonical invocation documented · [ ] successful manual end-to-end test review · [ ] limitations noted.

#### E1.F1.H2 — Spike OpenCode headless
🔴 required · Depends on: —
Objective: same as H1 for OpenCode.
Description: same protocol; evaluate `opencode run` and available format flags vs. plain text; document the need for defensive parsing if there is no structured output.
Acceptance: [ ] canonical invocation documented · [ ] successful test review · [ ] parsing strategy defined.

#### E1.F1.H3 — Capture real fixtures
🔴 required · Depends on: E1.F1.H1, E1.F1.H2
Objective: feed contract tests with real outputs, not invented ones.
Description: capture in `fixtures/` complete outputs from both engines for the cases: valid verdict, response without verdict, response with noise (ANSI/markdown), timeout.
Acceptance: [ ] ≥4 fixtures per engine versioned · [ ] anonymized (no personal paths or tokens).

#### E1.F1.H4 — Context mode measurement
⚪ optional · Depends on: E1.F1.H1, E1.F1.H2
Objective: data for the context spike (PRD §6.3) without blocking anything.
Description: over 2-3 real PRs, compare inline vs. autonomous diff vs. skill materialization (`CLAUDE.md`/`AGENTS.md`) measuring perceived quality, tokens, and reproducibility.
Acceptance: [ ] comparison table · [ ] recommendation for the assembler roadmap.

---

## E2 — Repos & git

**Objective**: complete management of repos, clones, and worktrees.
**DoD**: `sentinel` registers a repo and produces a worktree with correct diff from any branch, never touching another's working tree.

### E2.F1 — Git wrapper · 🔴

#### E2.F1.H1 — Base git wrapper
🔴 required · Depends on: E0.F1.H1
Objective: implementation of the `GitPort` port for repo operations.
Description: `git/` adapter over execa using machine-readable outputs: clone, fetch, branch listing (`for-each-ref --format`), remote default branch detection. Errors translated to port errors.
Acceptance: [ ] operations work on real repo and test repo · [ ] stable parsed output · [ ] no raw exceptions toward the core.

#### E2.F1.H2 — Worktrees, merge-base, and diff
🔴 required · Depends on: E2.F1.H1
Objective: the central operations of the review flow.
Description: `worktree add/remove/list --porcelain`, `merge-base`, `diff base..target` (+ `--numstat` for size metrics).
Acceptance: [ ] worktree created/destroyed cleanly · [ ] diff matches PR semantics (merge-base) · [ ] tests against temporary git repo.

### E2.F2 — Repo management · 🔴

#### E2.F2.H1 — ConfigStore: schemas and persistence
🔴 required · Depends on: E0.F1.H1
Objective: all configuration validated and typed from disk.
Description: zod schemas for `config.yaml` and `repos.yaml`; `storage/` adapter (fs + yaml) implementing `ConfigStore`; user-readable validation errors (field + reason).
Acceptance: [ ] invalid config produces clear error · [ ] lossless read/write roundtrip · [ ] inferred types in the core.

#### E2.F2.H2 — Register repo
🔴 required · Depends on: E2.F1.H1, E2.F2.H1
Objective: `registerRepo` use case — the product's entry door.
Description: register by URL (clone managed in the tool's directory) or by existing local path (only worktrees are created, the working tree is never touched). Initial repo config: base branch, default harness.
Acceptance: [ ] both paths work · [ ] re-registration detected · [ ] managed clone in the correct location.

#### E2.F2.H3 — List repos and branches
🔴 required · Depends on: E2.F2.H2
Objective: `listRepos` and `listBranches` use cases (with prior fetch).
Description: listing of registered repos with their config; updated remote branches of a given repo.
Acceptance: [ ] branches reflect the remote after fetch · [ ] non-existent repo = clear domain error.

#### E2.F2.H4 — Delete/update registration
⚪ optional · Depends on: E2.F2.H2
Objective: complete registration lifecycle management.
Description: `removeRepo` (with optional cleanup of the managed clone) and editing of repo config.
Acceptance: [ ] removal leaves no orphaned worktrees · [ ] explicit confirmation to delete the clone.

### E2.F3 — Workspace · 🔴

#### E2.F3.H1 — Per-review worktree lifecycle
🔴 required · Depends on: E2.F1.H2
Objective: isolation guaranteed per review.
Description: `workspace` module: create ephemeral worktree (`worktrees/<repo>/<branch>-<ts>`), cleanup policies `always | on-success | keep`, orphan cleanup on startup.
Acceptance: [ ] parallel reviews don't collide · [ ] configurable policy respected · [ ] orphans detected and reported.

#### E2.F3.H2 — Diff with size policy
🔴 required · Depends on: E2.F1.H2
Objective: diff ready for the prompt with the PRD's warning policy.
Description: diff calculation against merge-base; if it exceeds the configurable limit (lines/tokens), warning + per-file truncation keeping the diff as an index. Never fails due to size.
Acceptance: [ ] configurable limit · [ ] warning visible in the run · [ ] truncation preserves the full list of affected files.

---

## E3 — Harnesses & prompt

**Objective**: 100% configurable review types in plain text.
**DoD**: complete deterministic prompt generated from harness + skills + repo config, with the 3 factory harnesses ready.

### E3.F1 — Harness system · 🔴

#### E3.F1.H1 — Harness/skill loading and validation
🔴 required · Depends on: E2.F2.H1
Objective: the registry of review types available to the core.
Description: `review` module: load `harnesses/<type>/` (harness.md, output.md, skills.yaml) and `skills/*.md`; validate references (non-existent skill = clear error); resolve harness + repo skills.
Acceptance: [ ] invalid harness reported in detail · [ ] skills resolved in deterministic order · [ ] factory and user harnesses coexist.

#### E3.F1.H2 — Deterministic prompt assembler
🔴 required · Depends on: E3.F1.H1
Objective: same input → same prompt, auditable in history.
Description: composition harness + skills + output + diff + validations (`inline` mode); delimited sections; snapshot tests of the resulting prompt.
Acceptance: [ ] stable snapshot for same input · [ ] section order documented · [ ] complete prompt persistable in the run.

#### E3.F1.H3 — `contextMode` option in harness
🔴 required · Depends on: E3.F1.H2
Objective: leave the door open for autonomous mode without implementing it (PRD §6.3).
Description: harness schema accepts `contextMode: inline | agent`; `inline` implemented and default; `agent` reserved (error "not yet implemented" with clear message).
Acceptance: [ ] schema accepts it · [ ] default inline · [ ] agent fails with explicit message, not silent.

### E3.F2 — Factory harnesses · 🔴

#### E3.F2.H1 — `pr-review` harness
🔴 required · Depends on: E3.F1.H1
Objective: the product's main harness.
Description: design harness.md (role + instructions with REJECT/REQUIRE/PREFER keywords), output.md (findings `[SEV: blocker|major|minor|nit]` + `file:line`, `VERDICT:` at the top), and base skills.
Acceptance: [ ] follows PRD §5.2 conventions · [ ] tested with FakeEngine and in the spike · [ ] ~100-200 lines.

#### E3.F2.H2 — `security` harness
🔴 required · Depends on: E3.F2.H1
Objective: review focused on vulnerabilities and sensitive data handling.
Description: same format; security checklist (secrets, injection, authz, dependencies) as a reusable skill.
Acceptance: [ ] same output contract · [ ] security skill composable by other harnesses.

#### E3.F2.H3 — `quick` harness
🔴 required · Depends on: E3.F2.H1
Objective: lightweight review for fast feedback.
Description: minimal version (only blockers/majors, no validations), designed for fast iteration.
Acceptance: [ ] produces verdict with the same contract · [ ] notably shorter than pr-review.

#### E3.F2.H4 — Automatic inclusion of the target repo's `AGENTS.md`
⚪ optional · Depends on: E3.F1.H1
Objective: leverage existing conventions of the reviewed repo.
Description: if the target repo has `AGENTS.md`, offer to include it as a skill (opt-in via repo config).
Acceptance: [ ] explicit opt-in · [ ] visible in the persisted prompt.

---

## E4 — Run & engines

**Objective**: the real end-to-end review.
**DoD**: `sentinel review <repo> <branch> --type pr-review` produces a result with verdict using Claude Code or OpenCode.

### E4.F1 — Orchestration · 🔴

#### E4.F1.H1 — `runReview` use case
🔴 required · Depends on: E2.F3.H1, E3.F1.H2, E0.F2.H2
Objective: the product's central flow, complete against FakeEngine.
Description: orchestrate in `core/run`: worktree → diff → (validations when E5 exists) → prompt → engine → parsing → terminal state → cleanup per policy. Handling of each error state.
Acceptance: [ ] flow green with FakeEngine · [ ] each terminal state reachable by test · [ ] correct cleanup even on error.

#### E4.F1.H2 — Verdict parser and ambiguity
🔴 required · Depends on: E0.F2.H1
Objective: the reliable output contract (success criterion ≥90% parsed).
Description: extract `VERDICT: approve|request-changes|comment` with defensive normalization (ANSI, md wrappers); absence or contradiction = `ambiguous`. Tested against real fixtures from E1.
Acceptance: [ ] fixtures from both engines parsed correctly · [ ] ambiguous cases detected · [ ] ambiguous run persisted with mark.

### E4.F2 — Real adapters · 🔴

#### E4.F2.H1 — `engines/claude-code` adapter
🔴 required · Depends on: E1.F1.H1, E1.F1.H3, E0.F2.H2
Objective: first real engine behind the port.
Description: implement the spike's canonical invocation (JSON output, non-interactive, timeout, `isAvailable()`); passes the contract suite with binary mocked by fixtures.
Acceptance: [ ] contract suite green · [ ] successful real review · [ ] absent/unauthenticated engine reported clearly before running.

#### E4.F2.H2 — `engines/opencode` adapter
🔴 required · Depends on: E1.F1.H2, E1.F1.H3, E0.F2.H2
Objective: second engine — validates the interface is genuine.
Description: same as H1 with OpenCode's canonical invocation and its parsing strategy.
Acceptance: [ ] same contract suite green · [ ] successful real review · [ ] zero changes needed in the core to add it.

#### E4.F2.H3 — Cascading engine resolution
🔴 required · Depends on: E4.F2.H1, E4.F2.H2
Objective: engine switch from PRD §3.1-D.
Description: global default (`config.yaml`) → per-repo override → per-run override (`--engine`); unknown engine validation.
Acceptance: [ ] cascade respected with tests · [ ] engine used recorded in run metadata.

---

## E5 — Validations & history

**Objective**: context enriched with validations and product memory.
**DoD**: complete persisted runs, queryable; declared validations running in the worktree.

### E5.F1 — Validations · 🔴

#### E5.F1.H1 — `ProcessRunner` port + `exec` adapter
🔴 required · Depends on: E0.F1.H1
Objective: safe execution of declared processes.
Description: port in `core/run`; adapter over execa with timeout, stdout/stderr capture, and cwd in the worktree.
Acceptance: [ ] timeout kills the process · [ ] complete output captured · [ ] exit code available to the domain.

#### E5.F1.H2 — Declared validations in the review flow
🔴 required · Depends on: E5.F1.H1, E4.F1.H1
Objective: repo scripts feed the review context (PRD §3.1-E).
Description: run only scripts declared in the repo config (never auto-detection), in order, with per-script timeout; inject summary+output into the prompt; validation failures don't abort the review (they are reflected).
Acceptance: [ ] only declared scripts executable · [ ] output visible in the persisted prompt · [ ] failed validation = review continues with the evidence.

### E5.F2 — History · 🔴

#### E5.F2.H1 — `RunStore`: complete persistence
🔴 required · Depends on: E4.F1.H1
Objective: self-contained run (requirement for the future daemon).
Description: persist in `runs/<repo>/<ts>/`: md result, prompt used, json metadata (engine, harness, branch, state, duration), validation logs.
Acceptance: [ ] run readable without the tool (plain files) · [ ] nothing sensitive persisted (no tokens/env) · [ ] atomic write (partial run identifiable).

#### E5.F2.H2 — Query history
🔴 required · Depends on: E5.F2.H1
Objective: `listRuns` and `getRun` use cases.
Description: listing per repo (date, branch, harness, state, verdict) and retrieval of a complete run.
Acceptance: [ ] chronological order · [ ] corrupt/partial runs listed with mark, without breaking the listing.

#### E5.F2.H3 — Cost/tokens per run
⚪ optional · Depends on: E5.F2.H1
Objective: cost visibility if the engine exposes it.
Description: capture usage from engine output (Claude Code JSON includes it) and display it in metadata and listings.
Acceptance: [ ] present when engine provides it · [ ] absence doesn't break anything.

---

## E6 — Interface

**Objective**: the MVP user experience.
**DoD**: the 6 use cases from PRD §3.2 executable from TUI or direct command.

### E6.F1 — Commands · 🔴

#### E6.F1.H1 — Base command CLI
🔴 required · Depends on: E2.F2.H3, E5.F2.H2
Objective: scriptable surface of the product.
Description: commander with `repo add|list`, `review`, `runs list|show`, `--version`, `--help`; output suitable for terminal and pipes.
Acceptance: [ ] each command invokes its use case (zero logic in the command) · [ ] useful `--help` per command.

#### E6.F1.H2 — `sentinel review` non-interactive with exit codes
🔴 required · Depends on: E6.F1.H1, E4.F2.H3
Objective: use case 6 from the PRD (scripting) and seed of gate mode.
Description: `sentinel review <repo> <branch> --type <harness> [--engine <e>]` with exit codes documented per terminal state (ok/approve=0, request-changes≠0 configurable, error/timeout≠0).
Acceptance: [ ] exit codes documented and tested · [ ] usable from a script without TTY.

### E6.F2 — TUI · 🔴

#### E6.F2.H1 — TUI navigation flow
🔴 required · Depends on: E6.F1.H1
Objective: the main interactive flow (PRD §3.1-G).
Description: clack: select repo → branch (with fetch) → harness → confirmation (summary of what will happen) → progress → result.
Acceptance: [ ] complete flow without leaving the TUI · [ ] cancelable at each step · [ ] errors shown without raw stack traces.

#### E6.F2.H2 — Terminal result rendering
🔴 required · Depends on: E6.F2.H1
Objective: readable result on completion + file path.
Description: render the review md (basic: highlighted sections and severities; marked-terminal optional) + location of the persisted run.
Acceptance: [ ] verdict and blockers visible at a glance · [ ] run path shown.

#### E6.F2.H3 — `sentinel open`: interactive session in the worktree
⚪ optional · Depends on: E4.F2.H3
Objective: dig into findings with the agent in context (PRD §3.1-G ⚪).
Description: launch the chosen engine in interactive mode standing in the review's worktree.
Acceptance: [ ] session opens in the correct worktree · [ ] engine respects the run config.

---

## E7 — Wrap-up

**Objective**: MVP validated with real use and published.
**DoD**: success criteria from PRD §7 verified + first release on npm.

### E7.F1 — Quality · 🔴

#### E7.F1.H1 — E2E smoke of the full flow
🔴 required · Depends on: E6.F1.H2
Objective: safety net for the entire flow.
Description: e2e test with temporary git repo + FakeEngine: register → review → history, verifying persisted artifacts.
Acceptance: [ ] runs in CI · [ ] fails if any piece of the flow breaks.

#### E7.F1.H2 — Dogfooding and harness tuning
🔴 required · Depends on: E6.F2.H2
Objective: validate success criteria with own real PRs.
Description: ≥1 week of use on real PRs; measure setup <5 min, recurring review <30 s, ≥90% parsed verdicts; iterate factory harnesses with what was learned.
Acceptance: [ ] metrics recorded · [ ] harness adjustments committed · [ ] friction issues created.

### E7.F2 — Release · 🔴

#### E7.F2.H1 — User documentation
🔴 required · Depends on: E6.F1.H1
Objective: anyone installs and configures without this context conversation.
Description: README (what it is, quick start, commands), configuration docs (config.yaml, repos.yaml, creating your own harness), privacy note (code goes to the chosen engine).
Acceptance: [ ] quick start reproducible from scratch · [ ] "create your harness" guide with complete example.

#### E7.F2.H2 — License applied
🔴 required · Depends on: —
Objective: close open decision 6 from the PRD before publishing.
Description: decide MIT vs. private; apply LICENSE, field in package.json, and repo visibility accordingly.
Acceptance: [ ] decision recorded in the PRD · [ ] consistent LICENSE in repo and package.

#### E7.F2.H3 — Release pipeline and first publication
🔴 required · Depends on: E7.F1.H1, E7.F2.H2
Objective: `npm i -g @<scope>/sentinel` working in the real world.
Description: changesets + `release.yml` (publish with `--provenance` via OIDC); publish v0.1.0; verify clean installation on a machine other than the development one.
Acceptance: [ ] published with provenance · [ ] clean global install + `sentinel --version` OK · [ ] alias `snt` working.
