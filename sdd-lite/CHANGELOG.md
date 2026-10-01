# Changelog — sdd-lite

## 0.4 — Model re-tiering (wrapper contract 0.4, profiles version 2)

Date: 2026-08-22

### Why

0.3 applied the "cheap" tier to judgment stages: `sddl-proposal` ran on Haiku / low although every later stage inherits its framing, and `sddl-deep-explorer` ran on Haiku / low although it exists to settle the unknown the orchestrator could not. Meanwhile `sddl-executor` inherited the session model even though `plan.md` already fixes what it must do.

New rule: decision stages run high, framing and execution over decided work run mid with high effort, mechanical stages run cheap, and verification never runs below the code writer.

### What changed

Eight profiles. `sddl-planner` is retired: a profile named "planner" that ran spec and design but not plan misled the router.

| Profile | Runs these skills | Claude | Codex | Boundary |
|---|---|---|---|---|
| `sddl-light` | archive, delivery | haiku / low | gpt-5.6-luna / low | workspace-write; prompt-scoped to `./sdd-lite/` |
| `sddl-framer` (new) | proposal | sonnet / high | gpt-5.6 / high | workspace-write; `proposal.md` + `state.yaml` |
| `sddl-explorer` | deep-explorer | sonnet / medium (was haiku / low) | gpt-5.6 / medium (was terra / low) | read-only |
| `sddl-architect` (was `sddl-planner`) | spec, design | opus / medium (was sonnet) | gpt-5.6-sol / medium (was gpt-5.6) | workspace-write; phase artifacts |
| `sddl-sequencer` (new) | plan | sonnet / medium | gpt-5.6 / medium | workspace-write; `plan.md`, `macro-plan.md`, `state.yaml` |
| `sddl-executor` | executor | sonnet / high (was inherit) | gpt-5.6 / high (was inherited) | approved stage scope; no git mutation |
| `sddl-reviewer` | 4R lenses, judges | sonnet / high | gpt-5.6 / high | read-only |
| `sddl-qa` | qa-review | sonnet / high | gpt-5.6 / high | workspace-write; `qa-report.md` + `state.yaml` |

Host tier map, documented in `profiles.yaml`: haiku ↔ gpt-5.6-luna, sonnet ↔ gpt-5.6, opus ↔ gpt-5.6-sol. `gpt-5.6-terra` is no longer used.

- Claude adapters declare `skills:` as a YAML list. The 0.3 comma-separated scalar does not match the documented preload syntax.
- Wrapper contract is `0.4`. A `0.3` wrapper names `sddl-planner`, which no longer exists in adapters or `profiles.yaml`, so the named launch and the `general-purpose` fallback both break. `sddl-init` treats anything below `0.4` as incompatible.
- `sddl-init` deletes generated adapters whose id is absent from `profiles.yaml`, migrates `execution_profiles.sddl-planner` to `sddl-architect`, and validates generated model/effort against `profiles.yaml` plus overrides.
- `config.schema.yaml` `execution_profiles` and `executionProfileId` list the eight ids.

### What did not change

- The 12 skill algorithms, gates, artifact shapes, `state.yaml` schema, approvals.
- Adapter bodies, handoff controls, read-only enforcement (`permissionMode: plan`, `sandbox_mode = "read-only"`).

### Adopt in an existing project

Rerun `sddl-init`, approve replacing the marked wrapper block, and confirm eight files under `.claude/agents/` and/or `.codex/agents/` with no `sddl-planner.*` left. To keep the session model writing code, set `execution_profiles.sddl-executor.claude.model: inherit` (and `codex.model: inherit`) in `config.yaml` and rerun init.

## 0.3.1 — Host adapter hardening (same 0.3 contract)

Date: 2026-08-17

Corrections that landed with 0.3 before first use. Wrapper version stays `0.3`.

- **`sddl-spec` → `sddl-planner`.** Spec writes acceptance criteria; Haiku / luna / low was too thin. `sddl-light` is now proposal, archive, delivery only. Map updated in `profiles.yaml`, flow-contract, catalog, USER-GUIDE, and Claude/Codex adapter descriptions.
- **`sddl-qa` stays off `sddl-reviewer`.** QA writes `qa-report.md` / `state.yaml` and runs quality commands. Reviewer stays read-only for 4R lenses and judges. Wrong-profile handoff: Claude `sddl-reviewer` returns `blocked` if `stage` is `sddl-qa-review`.
- **Claude preload.** `skills:` on explorer, executor, qa, and planner. A Haiku explorer skipped `SKILL.md` when the skill was only named in prose. `sddl-light` stays instruction-only (three skills; it reads the named `SKILL.md`).
- **Claude read-only.** `permissionMode: plan` on explorer and reviewer. `tools:` alone does not block mutating Bash. Under `auto` / `bypassPermissions` the host ignores `plan`; the wrapper says so and review-runtime still rejects worker file writes.
- **Claude first action.** Every adapter body starts with: load the named skill (or injected lens prompt) and return exactly its Expected Output / findings contract.
- **Claude missing-agent fallback.** If the `sddl-*` type is not installed, launch `general-purpose` with that profile's model, paste the adapter body, state that host tool limits are not enforced, and recommend `sddl-init`. Inline fallback must not claim a named agent ran.
- **Codex `inherit`.** Generated TOML never writes `model = "inherit"`; omit the key so the child inherits the parent. `effort` is independent. Init validates at most one `model` and one `model_reasoning_effort`.
- **Sandbox wording.** `workspace-write` is the whole workspace. Paths like `./sdd-lite/` are prompt contracts, not host subdirectory sandboxes. Documented in the flow-contract.

## 0.3 — Execution-profile agents

Date: 2026-08-17

### Why

Every stage inherited the main-session model and a generic child. That wasted tokens and reasoning on cheap work (proposal, explore, archive) and left review/explore read-only rules as prose the host did not enforce.

The fix is CLI-native launch adapters. Skills stay the phase algorithm. The orchestrator stays the main session.

### What this is for

- Route light stages to a cheaper/faster model.
- Pin explorer and reviewer as read-only at the host (tools / sandbox), not only in the prompt.
- Tell Claude and Codex **which named agent** to spawn, then wait.
- Keep one portable skill set. Do not clone `SKILL.md` into 12 host agents.

### What shipped

Six profiles. They are not stage ids and must never appear in `state.yaml`.

| Profile | Runs these skills | Default compute | Adapter boundary |
|---|---|---|---|
| `sddl-light` | proposal, archive, delivery | Claude Haiku / low; Codex luna / low | workspace-write; prompt-scoped to `./sdd-lite/` |
| `sddl-explorer` | deep-explorer | Haiku / terra / low | read-only |
| `sddl-planner` | spec, design, plan | Sonnet / gpt-5.6 / medium | workspace-write; prompt-scoped to phase artifacts |
| `sddl-executor` | executor | inherit / high | approved stage scope; no git mutation |
| `sddl-reviewer` | 4R lenses, judges | Sonnet / gpt-5.6 / high | read-only; no child spawn |
| `sddl-qa` | qa-review | Sonnet / gpt-5.6 / high | workspace-write; prompt-scoped to `qa-report.md` + `state.yaml` |

Canonical map: `templates/agents/profiles.yaml` and `skills/_shared/sddl-flow-contract.md`.

Host files (thin adapters, ~80–120 words):

- Claude: `templates/agents/claude/sddl-*.md` → install `.claude/agents/`
- Codex: `templates/agents/codex/sddl-*.toml` → install `.codex/agents/`

Handoff now includes `execution_profile` next to `stage`. Wrappers are contract **0.3**:

- Claude: native Agent tool **as that profile name**. Not Skill. Not built-in Explore.
- Codex / AGENTS: spawn the **named** role, fresh thread, wait-all. Not cloud/background/API multi-agent.
- Inline fallback still runs the **skill** in the parent and must say isolation is gone.

`sddl-init`:

- Detects `.codex/` as existing id `agents` (no new AI id).
- Copies the six adapters (always copy, replaced on rerun).
- Warns if both `CLAUDE.md` and `AGENTS.md` are injected (Grok loads both; launch verbs conflict).
- Records `ai_setups.agents_installed`.
- Optional `execution_profiles` in `config.yaml` overrides model/effort; init regenerates the adapter files.
- For Codex overrides, `model: inherit` omits the generated TOML `model` key; an explicit slug writes it, and `effort` remains independent.

Review fan-out launches `sddl-reviewer` and uses sequential batches when the host concurrency cap is below the worker count.

`sddl-qa` is a correction: `sddl-qa-review` writes `qa-report.md` and `state.yaml` and runs quality commands, so it cannot use the read-only reviewer. Mapping QA to `sddl-reviewer` would block native-worker closeout.

Dead catalog table `Support Agents` (`agents/agents-generic/…`) was replaced by the profile table.

### What did not change

- The 12 skill algorithms, gates, and artifact shapes.
- Lifecycle, `state.yaml` schema, approvals, English artifacts.
- Grok / OpenCode first-class adapters (they still use `AGENTS.md` + `.agents/skills/`; they do **not** read `.codex/agents`).
- Interaction profiles, process agents, skill compression, eval harness.

### Adopt in an existing project

Rerun `sddl-init` and approve replacing the marked wrapper block (pre-0.3 is incompatible). Confirm the six files exist under `.claude/agents/` and/or `.codex/agents/`. To change models, edit `execution_profiles` in `config.yaml` and rerun init — do not hand-edit generated adapters.

The Codex TOML adapters are optional when sdd-lite runs `inline-sequential`; they are required for optimized `native-workers` routing through the named execution profiles.
