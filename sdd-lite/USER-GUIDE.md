# sdd-lite — User Guide

Introductory guide to understand and operate `sdd-lite`: a lightweight, AI-driven change workflow package for bounded tasks (features, bug fixes, targeted refactors) with explicit traceability, per-stage approvals, and persisted artifacts.

Persisted artifacts stay in English. Chat interaction may be Spanish or English.

---

## Table of Contents

1. [What is sdd-lite?](#1-what-is-sdd-lite)
2. [When to use it (and when not to)](#2-when-to-use-it-and-when-not-to)
3. [Key concepts](#3-key-concepts)
4. [Setup and basic configuration (`sddl-init`)](#4-setup-and-basic-configuration-sddl-init)
5. [The `config.yaml` file (settings)](#5-the-configyaml-file-settings)
6. [Runtime file layout](#6-runtime-file-layout)
7. [The 10 available skills](#7-the-10-available-skills)
8. [Standard flow and alternative flows](#8-standard-flow-and-alternative-flows)
9. [How changes to the code are controlled](#9-how-changes-to-the-code-are-controlled)
10. [Usage examples](#10-usage-examples)
11. [What NOT to do](#11-what-not-to-do)
12. [Escalating to `sdd-v2`](#12-escalating-to-sdd-v2)

---

## 1. What is sdd-lite?

`sdd-lite` is a lightweight package for bounded changes. It provides:

- Explicit bootstrap before any change work.
- Persisted source of truth instead of chat-memory dependence.
- Compact functional and technical formalization.
- One approved execution stage at a time.
- Unified QA for stage review and final closeout.
- Resumability from persisted state.

It follows a **thin-orchestrator** model: the orchestrator only routes and coordinates; real stage work runs in fresh delegated workers.

Core rule:

> If a task inflates orchestrator context without need, delegate it.

---

## 2. When to use it (and when not to)

### Use `sdd-lite` when

- The user explicitly asks for it: "use sdd", "con sdd-lite", "con sdd", "sddl", "hacerlo con sdd".
- A feature, refactor, or fix is starting and scope or approach is uncertain.
- The task spans multiple files, has unclear acceptance criteria, or carries non-trivial risk.

### Do NOT activate `sdd-lite` automatically for

- Simple questions or explanations.
- Quick one-line fixes the user clearly understands.
- Conversational or exploratory requests.

### Avoid `sdd-lite` in

- Broad migrations.
- Repo-wide redesigns.
- Cross-repo coordination problems.

In those cases, **escalate to `sdd-v2`**.

---

## 3. Key concepts

| Concept | Meaning |
|---|---|
| **Bootstrap** | Initial preparation of the repo: creates `./sdd-lite/` with project context, skill catalog, and `config.yaml`. Mandatory before any change routing. |
| **Orchestrator** | Thin coordinator that reads minimum state, chooses the route, and delegates. It does not implement, run builds/tests, or rewrite other stages' artifacts. |
| **Worker / Skill** | Fresh executor that performs one concrete stage (proposal, design, execution, QA, exploration). |
| **Objective (`objective`)** | `new-feature`, `bug-fix`, `planner`, or `refactor-rework`. |
| **Route (`route`)** | `continue-lite`, `macro-plan-first`, or `escalate-to-sdd-v2`. |
| **`state.yaml`** | Resume anchor. Records lifecycle, current stage, checkpoints, and next action. |
| **Checkpoint / approval** | Explicit confirmation point before each later stage starts (mandatory for code-touching stages). |
| **Digest** | Short summary at the top of each artifact, reusable by downstream stages without rereading the full body. |

---

## 4. Setup and basic configuration (`sddl-init`)

`sddl-init` is the bootstrap skill. Run it the first time, or when the bootstrap becomes stale.

### What it does

1. **Preflight.** Determines whether bootstrap is missing, stale, incomplete, or already usable.
2. **Shallow scan.** Inspects manifests, lockfiles, docs, build/test/lint configs, source and test roots.
3. **AI setup detection.** Scans the project root for:

   | Signal found | AI detected |
   |---|---|
   | `CLAUDE.md` exists | Claude Code |
   | `.claude/` directory exists | Claude Code |
   | `AGENTS.md` exists | Codex |
   | `.codex/` directory exists | Codex |

4. **Selection checkpoint.** Asks the user which AI(s) to configure: Claude Code, Codex, both, or skip.
5. **Skill installation.** The user chooses between two methods:

   | Method | Description | Use when |
   |---|---|---|
   | **Symlink** | Creates a directory symlink from `.claude/skills/<skill>` (or `.agents/skills/<skill>`) to the package skill directory, so `SKILL.md` and `references/` resolve together. | The package stays in this repo. Recommended. |
   | **Copy** | Copies each skill directory (`SKILL.md` plus `references/` when present) to the target and rewrites package-relative paths. | The package may move, or symlinks are unsupported. |

   All 10 canonical skills are installed: `sddl-init`, `sddl-proposal`, `sddl-spec`, `sddl-design`, `sddl-plan`, `sddl-executor`, `sddl-code-review`, `sddl-judgment-day`, `sddl-deep-explorer`, `sddl-qa-review`.

6. **Wrapper injection.** Inserts a demarcated block between `<!-- sdd-lite:start -->` and `<!-- sdd-lite:end -->` in `CLAUDE.md` and/or `AGENTS.md`. If the block already exists, it is replaced; if the file is missing, it is created with only the wrapper. Confirmation is always required before inserting.

7. **Generates the bootstrap artifacts**:
   - `./sdd-lite/project-context.md`
   - `./sdd-lite/skill-catalog.md`
   - `./sdd-lite/openspec/config.yaml`

### Possible preflight states

| State | Meaning | Orchestrator action |
|---|---|---|
| `ready` | Bootstrap exists and is usable. | Continue. |
| `stale` | Exists but refresh is advisable. | Continue only when stale risk does not change route, scope, or file targets. |
| `incomplete` | Files exist but are unusable/contradictory. | Stop and route to `sddl-init`. |
| `missing` | One or more required files do not exist. | Stop and route to `sddl-init`. |

---

## 5. The `config.yaml` file (settings)

`./sdd-lite/openspec/config.yaml` is the project configuration file, generated by `sddl-init`.

Main sections (validated by `schemas/config.schema.yaml`):

| Section | Content |
|---|---|
| `version` | Schema version. |
| `project` | Identity: `name`, `slug`, `root`, `package_root`, `runtime_root` (`./sdd-lite`), `stack` (languages, frameworks, runtime, package manager). |
| `paths` | Fixed canonical paths: `runtime_root`, `project_context_path`, `skill_catalog_path`, `artifact_root`, `config_path`, `changes_root`, and optional `reviews_root`. |
| `quality_commands` | Commands for `install`, `test`, `build`, `lint`, `typecheck`, and optional `format`, `dev`. |
| `bootstrap` | Metadata: `status` (`created`/`refreshed`/`already_usable`), `strategy`, timestamps, refresh flags, observed files and paths. |
| `conventions` | `persisted_language: en`, `chat_language` (`es`/`en`), `asks_only_when_material`, etc. |
| `ai_setups` | Result of `sddl-init` steps 3–6: `detected`, `configured`, `skills_installed` (target + method + timestamp), `wrappers_injected`. |
| `metadata` | `bootstrap_version`, `package_mode: lite`, `planner_terminal_skill: sddl-plan`, `final_closure_skill: sddl-qa-review`. |

All internal paths live under `./sdd-lite/`. A root-level `openspec/` is never used.

---

## 6. Runtime file layout

All runtime files live under `./sdd-lite/`:

```text
./sdd-lite/
  project-context.md         # reusable repo context
  skill-catalog.md           # runtime standards registry
  openspec/
    config.yaml              # project configuration
    changes/
      {change-name}/
        state.yaml           # resume anchor
        proposal.md          # problem framing and feasibility
        spec.md              # scope and acceptance criteria
        design.md            # technical approach
        plan.md              # staged execution plan
        execution-log.md     # execution ledger
        qa-report.md         # findings and closeout
        macro-plan.md        # only on approved macro-plan-first route
        review-ledger.md     # only when a 4R or judgment-day review ran
    reviews/
      {target-slug}/
        review-ledger.md     # standalone reviews without an active change
```

| Artifact | Owner | Purpose |
|---|---|---|
| `project-context.md` | `sddl-init` | Reusable repo context. |
| `skill-catalog.md` | `sddl-init` | Runtime standards registry for prompt injection. |
| `config.yaml` | `sddl-init` | Project identity, paths, quality commands. |
| `state.yaml` | orchestrator + active stage | Lifecycle, checkpoints, next action. |
| `proposal.md` | `sddl-proposal` | Problem framing and feasibility signal. |
| `spec.md` | `sddl-spec` | Scope boundary and acceptance criteria. |
| `design.md` | `sddl-design` | Technical approach and affected areas. |
| `plan.md` | `sddl-plan` | Staged execution plan. |
| `execution-log.md` | `sddl-executor` | Stage-by-stage execution ledger. |
| `qa-report.md` | `sddl-qa-review` | Review findings and closeout evidence. |
| `review-ledger.md` | orchestrator (via `sddl-code-review` / `sddl-judgment-day`) | 4R or judgment-day findings, corroboration, and fix rounds. |

### Artifact budget (guidance)

| Artifact | Budget |
|---|---|
| `proposal.md` | 200 to 400 words |
| `spec.md` | 300 to 500 words |
| `design.md` | 400 to 600 words |
| `plan.md` | 300 to 500 words |
| One `execution-log.md` stage entry | 150 to 300 words plus tables |
| `qa-report.md` stage summary | 300 to 500 words |
| `qa-report.md` final summary | 500 to 800 words |
| `review-ledger.md` | 200 to 400 words plus tables |

---

## 7. The 10 available skills

| Skill | Role | Writes |
|---|---|---|
| `sddl-init` | Bootstrap and package installation. | `project-context.md`, `skill-catalog.md`, `config.yaml`, AI setup files. |
| `sddl-proposal` | Idea consolidation with optional lightweight exploration (first change stage). | `proposal.md`, `state.yaml`. |
| `sddl-spec` | Formal functional specification with firm scope boundary and acceptance criteria. | `spec.md`, `state.yaml`. |
| `sddl-design` | Technical design: architecture, patterns, affected areas. | `design.md`, `state.yaml`. |
| `sddl-plan` | Staged execution plan. Terminal stage for the `planner` objective. | `plan.md`, `state.yaml`, (and `macro-plan.md` when the approved route requires it). |
| `sddl-executor` | Executes **one** approved stage per invocation. | Repo files inside approved scope, `execution-log.md`, `state.yaml`. |
| `sddl-code-review` | 4R code review protocol (Risk, Readability, Reliability, Resilience): triage, read-only lens sweeps, findings ledger, refuter corroboration. | `review-ledger.md` and `state.yaml` (written by the orchestrator). |
| `sddl-judgment-day` | Opt-in adversarial dual review: two blind judges over one immutable target; convergence confirms, contradiction escalates. Works on code or planning artifacts. | `review-ledger.md` and `state.yaml` (written by the orchestrator). |
| `sddl-deep-explorer` | Bounded, **read-only** analysis when a material unknown blocks routing. | Nothing persistent by default. |
| `sddl-qa-review` | Unified review in `stage` or `final` mode. | `qa-report.md`, `state.yaml`. |

Key rules:

- `sddl-executor` performs no hidden git side effects (no commits, rebases, or stashes).
- `sddl-deep-explorer` is strictly read-only.
- `sddl-qa-review` in `stage` mode never marks the change `completed`. Only `final` mode with a `pass` verdict may close it.
- `sddl-code-review` and `sddl-judgment-day` are orchestrator-executed protocols: their lens/judge workers are read-only and only the orchestrator writes `review-ledger.md`. They never close a change and never apply fixes directly — fixes always flow through `plan.md` and `stage_approval`.
- `sddl-judgment-day` is opt-in only and replaces the 4R review for its target (never run both on the same target).

### The two review loops in short

**`sddl-code-review` (4R)** — the default, cost-proportional review:

1. The target diff is frozen and triaged: trivial (docs/formatting only) → no review; standard → exactly one lens by dominant risk; hot path (auth/security/payments/data) or >400 changed lines → all four lenses plus one refuter pass.
2. Each lens (R1 Risk, R2 Readability, R3 Reliability, R4 Resilience) runs one exhaustive read-only sweep and returns findings.
3. Findings land in `review-ledger.md` with severities `BLOCKER/CRITICAL/WARNING/SUGGESTION`. Only BLOCKER/CRITICAL enter the fix loop; the rest is informational.
4. Fixes are user-approved and flow through a fix stage in `plan.md`; maximum two fix rounds.

**`sddl-judgment-day`** — the expensive, high-confidence review (explicit request only: "judgment day", "dual review", "adversarial review"):

1. Two blind judges review the same frozen target independently.
2. Both agree on a severe defect → `confirmed` (fixable). Only one reports it → `suspect` (recorded, never auto-fixed). They contradict → `escalated` to you.
3. Works in `code` mode (a diff/PR) or `artifact` mode (judging a `proposal.md`, `spec.md`, `design.md`, or `plan.md` before execution).
4. Ends in `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`; maximum two fix rounds.

---

## 8. Standard flow and alternative flows

### Standard flow

```text
preflight
  -> sddl-init when bootstrap is missing or materially stale
  -> sddl-deep-explorer only when bounded evidence is needed
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> sddl-plan
  -> sddl-executor (one approved stage at a time)
  -> sddl-code-review offer when the stage diff is non-trivial (4R; skipped for trivial diffs)
  -> sddl-qa-review (stage) when useful
  -> sddl-executor / sddl-code-review / sddl-qa-review (stage) as needed
  -> sddl-qa-review (final, consumes review-ledger.md as evidence when it exists)
```

### Standalone review flows

Both review loops also run without an active change, persisting only `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md`:

```text
"review this diff/PR"            -> sddl-code-review (triage -> lenses -> ledger)
"judgment day on X"              -> sddl-judgment-day (two blind judges -> convergence -> verdict)
```

If a standalone review confirms severe findings, the orchestrator suggests opening a change (mini or full) seeded from the ledger — it never fixes directly.

### `planner` flow

Formalize and plan only, no execution:

```text
preflight
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> sddl-plan
  -> stop(planned)
```

### `macro-plan-first` flow

When the work still fits lite but must be decomposed before execution is safe:

```text
preflight
  -> complexity assessment = macro-plan-first
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> macro_plan_review checkpoint
  -> sddl-plan (produces macro-plan.md)
  -> stop(planned)
```

### Escalation flow

When work exceeds lite safety:

```text
-> stop lite routing
-> persist the escalation reason in state.yaml
-> recommend sdd-v2
```

---

## 9. How changes to the code are controlled

`sdd-lite` applies several mechanisms to keep code changes safe and reviewable:

### Explicit per-stage approval

- Every later stage requires explicit approval before it starts.
- For code-touching stages, the checkpoint must satisfy the minimum `stage_approval` content.
- `sddl-executor` executes **one** planned stage per invocation. It does not auto-advance.

### `sddl-executor` stop rules

The executor stops without widening scope when it detects:

| Condition | Meaning |
|---|---|
| **Contradiction** | Approved artifacts and current reality materially disagree (planned file no longer exists, behavior contract conflicts, prior result missing or invalid). |
| **Scope drift** | Requested or discovered work changes the intended outcome (a "small fix" now requires behavior changes beyond the acceptance target). |
| **Blast-radius expansion** | Completing the stage would require touching files or modules outside the approved scope (unplanned callers, extra mandatory tests/configs). |

In every case: it stops, records the reason in `execution-log.md`, and routes to user review, replanning, or escalation.

### No hidden git side effects

`sddl-executor` does not commit, stash, rebase, or otherwise modify git history. `sdd-lite` does not define git/PR/issue workflows by itself.

If dirty local changes exist:

- Continue only if they do not materially conflict with the approved stage scope.
- Stop and ask the user when changes create ambiguity about what the current stage would modify.
- Never auto-clean, reset, or stash the working tree.

### Proportionate quick checks

After a stage runs, `sddl-executor` performs only the minimum meaningful validation, based on:

- The stage validation notes from `plan.md`.
- The `quality_commands` in `config.yaml`.
- Targeted file or test checks relevant to the stage.

It records what was planned, what ran, and what was skipped. If checks fail materially, execution stops rather than continuing.

### English artifacts, flexible chat

All persisted artifacts remain in English (for auditability and consistency). Chat may be Spanish or English, controlled by `chat_language` in `config.yaml`.

### Resume from persisted state

Chat memory is never trusted. Resume is rebuilt from, in order:

1. Unresolved checkpoint.
2. Missing or stale owning artifact.
3. Next approved stage.
4. Planned or blocked stop state.

---

## 10. Usage examples

### Example 1 — New project: initialize `sdd-lite`

> "Install sdd-lite in this repo and configure it for Claude Code."

The orchestrator runs `sddl-init`:

1. Scans `package.json`, `tsconfig.json`, lint/test configs.
2. Detects `CLAUDE.md` → proposes configuring Claude Code.
3. Asks: symlink or copy → user picks `symlink`.
4. Asks: inject the wrapper into `CLAUDE.md`? → user accepts.
5. Writes `./sdd-lite/project-context.md`, `./sdd-lite/skill-catalog.md`, `./sdd-lite/openspec/config.yaml`.
6. Returns a summary covering bootstrap status and AI setup results.

### Example 2 — Add a bounded feature

> "With sdd-lite, add a `/users/me` endpoint that returns the authenticated user."

Expected flow:

1. **Preflight**: bootstrap is `ready`.
2. **`sddl-proposal`** produces `proposal.md` consolidating the idea: one GET endpoint, desired outcome, feasibility signal.
3. **`sddl-spec`** produces `spec.md` with firm scope (one GET endpoint, no schema changes), acceptance criteria (200 with user data, 401 without auth), and risks.
4. **`sddl-design`** produces `design.md` with the technical approach and affected areas.
5. **`sddl-plan`** produces `plan.md` with an ordered stage table (e.g., `S1: controller + route`, `S2: tests`).
6. **S1 approval** → `sddl-executor` implements S1 only, records in `execution-log.md`.
7. **S2 approval** → `sddl-executor` runs the planned tests.
8. **`sddl-qa-review` in `final` mode** → on a `pass` verdict, marks the change `completed`.

### Example 3 — Bug with unclear root cause

> "With sddl: the login sometimes fails with 500, I'm not sure why."

Likely route:

1. The orchestrator detects a material unknown blocking design.
2. Delegates to **`sddl-deep-explorer`** with a bounded question: "where does the intermittent 500 in login originate?".
3. The explorer inspects handlers, middleware, and logs; returns observed facts, grounded inferences, and remaining unknowns (read-only, touches no code).
4. With that evidence, the flow continues: `sddl-proposal` → `sddl-spec` → `sddl-design` → `sddl-plan` → staged execution.

### Example 4 — Plan only

> "With sdd-lite and `planner` objective, give me a staged plan to migrate logs to structured JSON — do not execute anything."

The orchestrator uses `objective: planner`:

1. `sddl-proposal` → `sddl-spec` → `sddl-design` → `sddl-plan`.
2. Stops with `lifecycle_status: planned`. No execution routing.

### Example 5 — Resume an existing change

> "Resume the `feat-users-me` change."

The orchestrator:

1. Reads `./sdd-lite/openspec/changes/feat-users-me/state.yaml`.
2. Validates it against owning artifacts (proposal, design, execution log).
3. Resumes at the first unresolved item in order: pending checkpoint → missing/stale owning artifact → next approved stage → stop state.

---

## 11. What NOT to do

- Jump straight to `sddl-executor` without `proposal.md`, `spec.md`, `design.md`, and `plan.md`.
- Treat a `stage` review as if it were final closeout.
- Use `macro-plan-first` as implicit approval to implement.
- Force oversized work to stay in lite after the orchestrator recommends escalation.
- Write runtime artifacts outside `./sdd-lite/`.
- Let git side effects happen implicitly.
- Turn the orchestrator into the main repo worker.
- Use a root-level `openspec/`: `sdd-lite` never does.

---

## 12. Escalating to `sdd-v2`

`sdd-lite` keeps the backbone of `sdd-v2` but compresses the lifecycle:

| `sdd-v2` tendency | `sdd-lite` equivalent |
|---|---|
| More phases and artifacts. | Fewer phases and artifacts. |
| Heavier orchestration. | Thin coordinator plus delegated workers. |
| Separate stage QA and final verify. | One `sddl-qa-review` skill with `stage` and `final` modes. |
| Heavier governance. | Faster flow with explicit escalation when safety drops. |

Recommendation: use `sdd-lite` first for bounded work. Escalate to `sdd-v2` when the lite route is no longer safe (broad migrations, redesigns, repo-wide coordination).
