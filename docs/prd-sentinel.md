# PRD v0.3 — `sentinel`
> AI-powered code review orchestrator CLI. Consolidated definition document. Complemented by `setup-tecnico-sentinel.md`.
> History: v0.1 extensive initial draft → v0.2 short version with architecture, engines and context strategy formalized → v0.3 naming (`sentinel`), stack and single product model closed.

---

## 1. TL;DR

- **What it is**: a local CLI/TUI that orchestrates AI code reviews across multiple git repos. You register repos, define review types in text files (harnesses + skills), and run reviews on branches/PRs in isolated worktrees, with result history.
- **What it is NOT**: not a new code agent. The reasoning is done by existing engines (Claude Code, Codex, OpenCode) invoked in headless mode. The value is in the orchestration layer: reproducible configuration, multi-repo, isolation, and history.
- **Positioning**: operates post-PR, at team level and multi-repo, with rich reviews (severities, verdict) and history. Does not compete with pre-commit gates on the local repo — it is complementary: covers the next stage of the quality pipeline. The approach of delegating to agentic CLIs is proven in production by existing tools in the ecosystem.
- **MVP scope in 5 bullets**: register repos → navigate branches → review in worktree with chosen harness → configurable delegated engine (Claude Code or OpenCode) → persisted md result with parseable verdict.
- **Architecture**: hexagonal (ports & adapters) with modules per domain — the product *is* literally a core with interchangeable adapters (AI engines, git, storage, and in the future GitHub/Bitbucket, crons, messaging).
- **Top 3 risks**: fragility of delegated CLIs (flags/output change), huge diffs, scope creep toward "building your own agent".

---

## 2. Overview

**Problem**: doing code reviews with AI today is artisanal — building context by hand, copying diffs, prompting differently each time. There is no reproducibility or way to control a team's PRs from a single place. Code agents are excellent engines but don't come with repo management, configurable review types, or history.

**Solution**: an orchestration layer over those engines. The review boils down to: choose repo → branch → review type → execute. Everything else (worktree, diff, context, validations, format, persistence) is handled by the tool in a reproducible way.

**Target audience**: individual devs or small teams who want consistent, self-hosted AI reviews with full control over prompts and provider. Typical operator: a tech lead reviewing the team's open PRs.

**Value proposition**: configuration as code (versionable harnesses/skills), total isolation (never touches your working copy), interchangeable engine, comparable history.

**Non-goals**: does not reimplement tool-use or autonomous editing; not a web platform or multi-tenant; does not replace CI.

---

## 3. MVP Scope

### 3.1 Development areas

**A. Repo management**
- ✅ Register repo by URL (clone managed in its own folder) or existing local path
- ✅ List repos, per-repo config (base branch, default harness, skills, validations)
- ⚪ Delete/update registration from the TUI

**B. Git**
- ✅ Fetch + listing of remote branches
- ✅ Worktree per review, configurable automatic cleanup (`always | on-success | keep`)
- ✅ Diff against merge-base with the base branch
- ✅ Large diffs: configurable limit + **warning** (review continues; the agent reads the rest on demand in the worktree)

**C. Harnesses & skills**
- ✅ Harness = folder with instructions + output format + referenced skills
- ✅ Skills as composable md files, shared between harnesses
- ✅ 3 factory harnesses: `pr-review`, `security`, `quick`
- ⚪ Automatic inclusion of the target repo's `AGENTS.md` as a skill

**D. AI engine**
- ✅ `ReviewEngine` interface + **two engines**: Claude Code and OpenCode
- ✅ Engine switch by config: global default → per-repo override → per-run override (`--engine`)
- ✅ Parseable verdict contract (`VERDICT: approve|request-changes|comment`) with ambiguity handling
- ⚪ Per-engine communication mechanism open for evaluation (spike): see §6.2

**E. Validations**
- ✅ Scripts declared per repo (lint/test/typecheck) executed in the worktree, output injected into context
- ✅ Only scripts explicitly in config — never auto-detection

**F. Results & history**
- ✅ Persist each run: md result + prompt used + metadata + validation logs
- ✅ List previous runs per repo
- ⚪ Cost/tokens per run if the engine exposes it

**G. Interface**
- ✅ Navigation TUI: repos → branches → harness → confirm → rendered result
- ✅ Equivalent direct command for scripting: `sentinel review <repo> <branch> --type pr-review`
- ⚪ `sentinel open`: interactive agent session standing in the worktree

### 3.2 MVP use cases

1. I register a new repo and in <5 min I have my first review.
2. I review a team PR's branch with the `pr-review` harness and get findings with severities + verdict.
3. I run a `security` review on the same branch without repeating setup.
4. Validations fail (broken tests) and the review reflects this in context.
5. I consult a repo's review history and re-read a previous result.
6. I run a review via direct command from my own script.

### 3.3 Out of scope (MVP)

Built-in chat · multiple simultaneous engines · GitHub/Bitbucket APIs (list PRs, post comments) · crons/webhooks/daemon · messaging · web UI.

**Post-MVP in one line**: stage 2 = more engines + GitHub/Bitbucket integration + comment posting; stage 3 = daemon with crons/webhooks + notifiers (Slack/Telegram/Discord) + plugins. VPS deployment is not a separate product: it is the same CLI with the daemon as a driving adapter — installed and configured the same way on a PC as on a server.

---

## 4. Architecture

**Decision**: modular hexagonal — ports & adapters as a border rule, modules per domain within the core. Classic layered architecture was evaluated (discarded: couples business to infrastructure) and full Clean Architecture (discarded: the ceremony of use-case-per-action and DTOs between layers doesn't pay off at this scale; its principles are adopted, not its structure). The product is a hexagon by nature: AI engines, git, storage, and future integrations are literally interchangeable adapters.

### 4.1 Guiding principles

1. **Dependencies inward**: everything points to the core; the core knows nothing about anyone.
2. **Core without I/O**: no filesystem, processes, network, or side-effect libraries in `core/`.
3. **One port per domain need**, not per technology (the core needs "to run a review", not "to call Claude").
4. **Adapters dirty inside, clean outside**: CLI version workarounds are encapsulated; only the port contract comes out toward the core.
5. **Single composition root**: implementation wiring happens in one place, the entrypoint.
6. **Modules with explicit public API**: between core modules, only the other's `index` is consumed, never internals.

### 4.2 Structure and domains

```
src/
├── core/                      # pure domain, no I/O
│   ├── repos/                 # repo registration and configuration
│   ├── workspace/             # worktrees: creation, cleanup policies
│   ├── review/                # harnesses, skills, prompt assembly
│   ├── run/                   # review orchestration, states, verdict
│   ├── history/               # querying previous runs
│   └── shared/                # domain errors, common types
│   # each module declares its driven ports in <module>/ports
├── adapters/
│   ├── driving/               # who invokes the core
│   │   ├── cli/               # direct commands (scripting)
│   │   └── tui/               # interactive menus
│   │   # future: scheduler, webhooks, messaging bots
│   └── driven/                # who the core invokes
│       ├── engines/           # claude-code/ and opencode/ (MVP), codex/ …
│       ├── git/               # git CLI wrapper
│       ├── exec/              # process execution (validations)
│       └── storage/           # config, harnesses, skills and runs (fs + yaml)
│       # future: vcs/ (github, bitbucket), notifiers/ (telegram, discord)
└── main/                      # composition root: wires everything
```

Ports are **owned by the domain module that needs them** (declared alongside it), not by a central technical folder: maintains cohesion per domain and makes evident which module depends on which external capability.

### 4.3 Port catalog (MVP)

| Port (driven) | Declared by | Responsibility | MVP adapter |
|---|---|---|---|
| `ReviewEngine` | `run` | Run the review given worktree + prompt; return raw output + verdict | `engines/claude-code` · `engines/opencode` |
| `GitPort` | `repos` / `workspace` | clone, fetch, branches, worktree add/remove, merge-base, diff | `git` |
| `ConfigStore` | `repos` / `review` | Read/write global config, repos, harnesses, skills | `storage` |
| `RunStore` | `history` | Persist and list full runs | `storage` |
| `ProcessRunner` | `run` | Run validations with timeout and output capture | `exec` |

**Core driving API**: use cases as thin functions per module — `registerRepo`, `listBranches`, `runReview`, `listRuns`, `getRun`. No ceremony classes; the use case signature is the contract consumed equally by TUI and CLI (and the daemon, tomorrow).

### 4.4 Naming conventions

- **Modules and folders**: kebab-case, named by domain (`workspace`), never by technology or pattern (`services/`, `utils/` prohibited in core).
- **Ports**: domain role name (`ReviewEngine`, `RunStore`); `Port` suffix only if the role alone is ambiguous (`GitPort`). Naming ports by their implementation is prohibited (`ClaudeService` ❌).
- **Adapters**: folder per technology they implement (`engines/claude-code`, `git`, `storage`); the name says "how", the port says "what".
- **Use cases**: verb + noun in camelCase (`runReview`).
- **Domain errors**: `Error` suffix, specific per module (`WorktreeCreationError`, `AmbiguousVerdictError`).
- **States and events** (future): states as nouns (`ok`, `ambiguous`), events as past tense (`RunCompleted`).

### 4.5 Architecture guards

Rules automatically verified in CI (dependency-cruiser or eslint boundaries; build fails if broken):

1. `core/**` does not import from `adapters/**` or `main/**`.
2. `core/**` does not import I/O libraries (fs, child_process, git, http, yaml) — whitelist of allowed imports in core.
3. Core modules only import each other via their public API (`index`); imports to internal files of another module are prohibited.
4. Adapters do not import each other; they only share the core's port types.
5. Adapter instantiation only in `main/`.

These guards are also the **extraction guarantee**: if they are met, `core/` is a publishable package without refactoring the day it's needed (e.g., if the stage 3 daemon were to be deployed as a separate process).

### 4.6 Testing and errors per layer

- **Core**: unit tests with in-memory fakes of the ports — most tests live here.
- **Driven adapters**: contract tests — every port implementation passes the same suite (engines with mocked binary). They cover the contract, not re-test domain logic.
- **E2E**: smoke of the full flow (register → review → history) with a fake engine.
- **Errors**: adapters translate technical failures into port errors — they never let raw library exceptions leak to the core. Every run ends in a terminal domain state: `ok | ambiguous | engine-error | timeout | validation-failed`.

### 4.7 Planned evolution

| Future change | Architectural impact |
|---|---|
| New engine (Codex, OpenCode, direct API) | New folder in `engines/` + contract suite. Core intact. |
| GitHub/Bitbucket (stage 2) | New `VcsProvider` port in `repos` + adapters. |
| Daemon with crons/webhooks (stage 3) | New driving adapter over the same use cases. |
| Notifications (stage 3) | New `Notifier` port + adapters. |
| Extraction of `core/` as independent package (if needed) | Guaranteed by the guards; no refactoring. |
| Plugins (stage 3) | Dynamic loading of adapters against existing ports. |

---

## 5. Technical design

### 5.1 Git strategy

- **Worktree vs. checkout**: always ephemeral worktree per review (`worktrees/<repo>/<branch>-<ts>`). Discarded alternative: checkout in the managed clone — serializes reviews and risks dirty state. Worktrees allow parallel reviews and trivial cleanup.
- **Diff**: `merge-base(base, target)..target` — only the PR's changes, not the base's drift. Same semantics GitHub uses to calculate a PR's changes. Base configurable per repo; default: remote's default branch.
- **Large diffs (decided)**: **warning** policy — configurable line/token limit; if exceeded, a warning is issued and the review continues with the diff truncated per file as an index. Never fails due to size: the delegated engine reads full files on demand in the worktree (key advantage of delegating). Complement under evaluation: "autonomous diff" mode where the agent reads the diff by itself (§6.3).
- **Managed clones**: the tool owns its clones (fetch without bothering anyone); registering an existing local path is supported but the tool only creates worktrees, never touches the user's working tree.

### 5.2 Harnesses & skills

**Chosen model — 3-level composition**:

```
harnesses/<type>/
├── harness.md      # role + instructions for the review type
├── output.md       # output format + verdict contract
└── skills.yaml     # skills it includes
skills/*.md         # composable knowledge (checklists, conventions)
repos.yaml          # per repo: extra skills, validations, base branch
```

Final prompt = harness + skills (from harness + from repo) + output + diff + validation output. Deterministic assembly: same input → same prompt. (Corresponds to `inline` mode, the MVP default; alternative context delivery modes in §6.3.)

**Discarded alternatives**: (a) a single rules file per repo — doesn't allow different review types or composition; (b) templates with logic (handlebars/jinja) — unnecessary power, breaks the simplicity of "you edit an md".

**Writing conventions** (best practices for review prompts): short, actionable rules with `REJECT if` / `REQUIRE` / `PREFER` keywords; files of ~100-200 lines; references to other repo files that the agent reads on demand instead of concatenating everything.

**Output contract**: `output.md` requires, in addition to the human format (findings with `[SEV: blocker|major|minor|nit]` + `file:line`), a machine-parsable line `VERDICT: approve|request-changes|comment` at the top. Response without verdict or with contradictory verdicts = `ambiguous` run (still persisted, marked as untrusted).

---

## 6. AI: engines and connection

### 6.1 Delegation to CLIs vs. direct API — **decided: delegation**

| | Delegation (Claude Code, OpenCode, Codex) | Direct API (OpenAI/Anthropic) |
|---|---|---|
| What needs to be built | Build prompt + invoke + parse | A mini-agent: tool use, file reading, context loop |
| Code access | The agent reads the worktree on demand | Only what you send in the prompt |
| Day 1 quality | High | Depends on how much agent you build |
| Risk | Flags/output change between versions | High development cost |

**Decision**: delegation as the MVP model and product anti-scope-creep rule: the CLI orchestrates, never implements its own agent. Direct API is reserved for stage 2 exclusively as a "diff-only" engine (cheap reviews without an agent).

### 6.2 MVP engines — **decided: Claude Code + OpenCode, interchangeable**

Both engines are implemented from the MVP, with cascading engine resolution: global default (`config.yaml`) → per-repo override (`repos.yaml`) → per-run override (`--engine claude-code|opencode`). Having two implementations from day 1 forces the `ReviewEngine` interface to be genuine and not a mirror of Claude Code. Codex and others are left for stage 2.

**Open for evaluation (spike per engine)** — the communication mechanism is not fixed in this document; the spike must resolve for each engine:

- *Input*: prompt via stdin vs. argument vs. file; size limits of each path.
- *Output*: available structured format (Claude Code: `--output-format json`; OpenCode: evaluate `run` with format flags vs. plain text) and how to stably extract the final response.
- *Execution mode*: one-shot vs. reusable session; permissions/non-interactive mode (auto-approval of reads in the worktree); auth handling and availability detection.
- *Closing criteria*: each adapter documents its canonical invocation and passes the shared contract suite (same test prompt → equivalent parsed verdict).

Already fixed operational considerations: workarounds encapsulated per adapter; `isAvailable()` before running; mandatory generous timeout; contract tests with mocked binary; defensive parsing (ANSI, markdown wrappers, contradictory verdicts) as fallback for plain text outputs.

### 6.3 Context delivery to the agent — inline (default) + autonomous (under evaluation)

Two ways to deliver the diff and instructions to the engine:

**a) Inline diff (MVP default)**: the tool calculates the diff and injects it into the prompt along with harness + skills + validations. Deterministic and reproducible (same input → same prompt), auditable in the run history. Cost: consumes agent context and requires the truncation policy.

**b) Autonomous diff (under evaluation)**: the prompt does not include the diff — it instructs the agent to read it by itself in the worktree (`git diff <base>...<target>`, `git log`, files it needs). Pros: zero context consumption by diff, no truncation, the agent decides what to dig into. Cons: less deterministic (two runs may explore differently), weaker audit (the persisted prompt doesn't contain what the agent saw), depends on each engine's tool-use quality.

**c) Materialization of skills as native agent config (under evaluation, complements a and b)**: instead of concatenating everything in the prompt, the tool writes harnesses/skills as files that each agent natively recognizes in the worktree — `CLAUDE.md`/skills for Claude Code, `AGENTS.md` for OpenCode — and the prompt stays minimal (task + verdict contract). Leverages each CLI's natural mechanism and enables the agent to consult them on demand. Requires cleanup when destroying the worktree and per-engine mapping.

**Proposed path**: MVP starts with (a); `contextMode: inline | agent` is defined as a harness option from the start (it's just a branch in the prompt assembler, marginal cost); (b) and (c) are validated in the same engine spike comparing review quality, tokens, and reproducibility over 2-3 real PRs.

---

## 7. Risks and success criteria

**Risks**
1. Breaking changes in delegated CLIs → adapter per engine + contract tests + JSON output where available.
2. Huge diffs/repos → diff as index + on-demand reading + per-file truncation.
3. Scope creep toward own agent → product rule: the CLI orchestrates, it doesn't reason.
4. Execution of scripts from foreign repos → only declared scripts, never auto-run.
5. Core ending up coupled to interactive use and the daemon (stage 3) requiring refactoring → use cases as the only API, guards in CI from commit 1, self-contained runs, engines in non-interactive mode from the spike.
6. Code privacy: repo content goes to the chosen engine's provider → explicit user decision via config (includes the option of local engines in the future); sentinel sends no data to any service of its own and has no telemetry; each engine's auth is the user's responsibility and is never persisted in runs/logs.

**MVP success criteria**
- New repo setup to first review: < 5 min. Recurring review: < 30 s of interaction.
- ≥ 90% of runs with verdict parsed without ambiguity.
- Creating a new review type = editing only md/yaml, zero code.
- Dogfooding from the first week on own PRs.

---

## 8. Decisions

**Taken in this version**
1. **Single product**: no separate "VPS tool" — server deployment is stage 3 of the same CLI (daemon as driving adapter). Single repo, single core.
2. **Git tooling: own wrapper** over the `git` binary (execa + porcelain/machine-readable formats: `worktree list --porcelain`, `for-each-ref --format`, `merge-base`, `diff --numstat`). `simple-git` discarded: no first-class API for worktrees — the central operation of the flow — and small, well-known git surface that doesn't justify the dependency.
3. **Naming: `sentinel`**. On npm: scoped package `@<scope>/sentinel` (`sentinel` and `sentinel-cli` are taken) with `bin: sentinel` + alias `snt` (mitigates collision with HashiCorp Sentinel binary).
4. **Language/runtime/stack**: TypeScript on Node ≥22 (target 24 LTS), runtime-agnostic code (Bun reserved as a compilation channel to single binary), npm distribution. Library stack, configs, executable guards, and pipelines defined in `setup-tecnico-sentinel.md` — **validated as recommendations, re-evaluated when implementing each piece**.

**Open**
5. **`sentinel open` (interactive session)**: does it enter the MVP as optional or straight to stage 2?
6. **License**: open source (MIT) vs. private — affects docs, npm scope, and repo visibility.
7. **Engine spike (§6.2)**: canonical communication mechanism per engine — input, output format, non-interactive execution mode, and permissions. Blocks adapter development; do it first.
8. **Context spike (§6.3)**: validate autonomous diff and materialization of skills as native agent config vs. inline, comparing quality, tokens, and reproducibility over real PRs. Does not block the MVP (inline is the default); defines the roadmap for the assembler.

---

## 9. Glossary

- **Engine**: external agentic CLI (Claude Code, OpenCode) that runs the review reasoning, behind the `ReviewEngine` port.
- **Harness**: definition of a review *type* — instructions, output format, and skills it includes. An editable plain-text directory.
- **Skill**: composable knowledge unit in md (checklist, conventions) reusable across harnesses and repos.
- **Run**: a review execution, fully persisted (result + prompt + metadata + logs) with terminal state `ok | ambiguous | engine-error | timeout | validation-failed`.
- **Verdict**: machine-parsable line of the result (`VERDICT: approve | request-changes | comment`); its absence or contradiction marks the run as `ambiguous`.
- **Worktree**: ephemeral, isolated git working copy where each review runs; sentinel never operates on the user's working tree.
- **Port / Adapter**: interface declared by the core / interchangeable concrete implementation (architecture §4).
