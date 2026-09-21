---
name: sddl-init
description: |
  Bootstrap or refresh sdd-lite in the current project. Use when sdd-lite has not been
  initialized yet, when the bootstrap context is stale, or when AI wrappers, skills,
  and execution-profile agents need to be installed. Triggers on: "sddl-init",
  "bootstrap sdd-lite", "init sdd", "inicializar sdd", "instalar sdd-lite".
---

# sddl-init

You are the explicit bootstrap skill for `sdd-lite`.

## Goal

Prepare durable project bootstrap context under `./sdd-lite/` so later lite stages can operate without rediscovering basic repository facts.
Bootstrap should also prepare a compact runtime standards registry for delegated stage work.

This skill stays shallow and high-signal.
It should gather enough evidence to bootstrap the flow, not perform deep exploration.

## Reads

Read the minimum project evidence needed from:

- top-level manifests and lockfiles
- package manager signals
- build, test, lint, and typecheck configuration
- maintained docs and contributor guidance
- obvious source, app, package, test, and config roots
- executable style config and a small sample of representative source and test files (step 3 budget)
- existing `./sdd-lite/project-context.md`
- existing `./sdd-lite/skill-catalog.md`
- existing `./sdd-lite/openspec/config.yaml`
- `<package-root>/templates/agents/profiles.yaml` when installing execution-profile adapters

## Writes

Write or refresh only:

- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md`
- `./sdd-lite/openspec/config.yaml`

When AI setup configuration is confirmed by the user:

- `.claude/skills/<skill-name>/` (skill directory symlink or copy per user choice, including `references/` when present) for Claude Code
- `.agents/skills/<skill-name>/` (skill directory symlink or copy per user choice, including `references/` when present) for AGENTS.md agents
- `.claude/agents/sddl-*.md` (generated copy) for Claude Code
- `.codex/agents/sddl-*.toml` (generated copy) when `agents` is configured
- `CLAUDE.md` (wrapper block injection, demarcated) for Claude Code
- `AGENTS.md` (wrapper block injection, demarcated) for AGENTS.md agents

Do not write change-scoped artifacts.
Do not write outside `./sdd-lite/` except for AI setup files explicitly confirmed by the user.
Do not create or overwrite `./sdd-lite/templates/`. Those files are user-owned overrides created on request by the owning skill, never by bootstrap, and a rerun must leave them untouched.

## User Interaction

Keep interaction short and selective.

State clearly:

- what you read
- what you inferred from repository evidence
- what you will write
- what remains uncertain

Ask the user only when the answer materially improves bootstrap quality.
Valid reasons to ask include:

- multiple plausible package managers or runtimes
- missing or contradictory quality commands
- ambiguous source roots in a multi-app or multi-package repository
- unclear preferred chat language between `es` and `en`
- which AI setups to configure (step 5)
- whether to install skills as symlinks or copies (step 6)
- whether to inject the wrapper into a detected AI file (step 7)

Do not ask for confirmation of obvious local choices already implied by the approved runtime.

Persisted content must remain in English.
Chat interaction may follow the detected or confirmed `chat_language`.

## Workflow

1. Preflight
   Read existing bootstrap files if they exist and determine whether bootstrap is missing, stale, or already usable.

2. Shallow repo scan
   Inspect only high-signal files and directories to detect:
   - languages, frameworks, runtime, and package manager
   - maintained docs and operating conventions
   - source roots, test roots, and config roots
   - candidate quality commands

3. Convention scan (bounded)
   Capture how this project already writes code, so delegated stages follow it instead of rediscovering it.

   Budget: at most 6 files beyond step 2. This is not exploration — if the answer is not cheap, it is `not established`.

   Read only, stopping as soon as you have enough:
   - contributor docs already found in step 2 (`CONTRIBUTING.md`, architecture notes, ADRs)
   - executable style config (`eslint`, `prettier`, `tsconfig`, `ruff`, `.editorconfig`, equivalents)
   - at most 2 representative source files from the main source root, plus 1 test file

   Record a convention only when it is repeated across the files you read or fixed by executable config.
   Cover: naming and file placement, layering or architectural pattern, testing style, and error handling if a pattern is obvious.

   Cut rules:
   - Never read extra files to confirm a hunch. If it is unclear after the budget, write `not established`.
   - Do not restate rules that already live in `skill-catalog.md`; this step captures project facts only.

4. AI setup detection
   Scan the project root for known AI setup signals. Do not modify any files in this step.

   | Signal found | AI id detected |
   |---|---|
   | `CLAUDE.md` exists | `claude_code` |
   | `.claude/` directory exists | `claude_code` |
   | `AGENTS.md` exists | `agents` |
   | `.agents/` directory exists | `agents` |
   | `.codex/` directory exists | `agents` |

   `agents` is the vendor-neutral id for any agent driven by the `AGENTS.md` / `.agents/` convention (Codex first-class; Grok and OpenCode reuse this id). `.codex/` maps to `agents`; it is not a separate AI id.

   If both are found, list both. Record the detection results for step 5.

5. AI configuration selection (checkpoint)
   Present the detection results and ask the user which AI setups to configure.

   - If exactly one AI detected:
     ```
     Detected: Claude Code (CLAUDE.md found)
     Configure sdd-lite for Claude Code? [y/n]
     ```
   - If multiple AIs detected:
     ```
     Detected AI setups:
       [1] Claude Code (CLAUDE.md / .claude/ found)
       [2] AGENTS.md agents (AGENTS.md / .agents/ found)
     Configure sdd-lite for: all / 1 / 2 / none
     ```
     If the user picks `all` / both, warn once: hosts that load `CLAUDE.md` and `AGENTS.md` together (Grok) will see two wrappers and conflicting launch verbs. Continue if they confirm.
   - If no AI detected:
     ```
     No AI setup found in this project.
     Which AI would you like to configure sdd-lite for?
       [1] Claude Code (will create CLAUDE.md if missing)
       [2] AGENTS.md agents (will create AGENTS.md if missing)
       [3] Both
       [4] Skip AI setup
     ```

   If the user selects `none` or `skip`, omit steps 6 and 7 and proceed to step 8.

6. Skill installation
   For each AI selected in step 5, ask the installation method:

   ```
   Install sdd-lite skills as:
     [1] Symlink — points to package files, no copy needed
                   (recommended when the package stays in this repo)
     [2] Copy    — copies SKILL.md files to the target directory
                   (use when the package may move or symlinks are unsupported)
   ```

   **Skills to install** (all 12 canonical skills):
   - `sddl-init`
   - `sddl-proposal`
   - `sddl-spec`
   - `sddl-design`
   - `sddl-plan`
   - `sddl-executor`
   - `sddl-code-review`
   - `sddl-judgment-day`
   - `sddl-deep-explorer`
   - `sddl-qa-review`
   - `sddl-delivery`
   - `sddl-archive`

   Some skills ship extra protocol files in a `references/` directory next to their `SKILL.md` (currently `sddl-code-review` and `sddl-judgment-day`). Installation always covers the whole skill directory, not only `SKILL.md`.

   **If symlink:**
   - Target parent directory for `claude_code`: `.claude/skills/`
   - Target parent directory for `agents`: `.agents/skills/`
   - Create the parent directory if it does not exist.
   - Create a directory symlink: `<parent-dir>/<skill-name>` → relative path back to `<package-root>/skills/<skill-name>` (the whole skill directory, so `SKILL.md` and `references/` resolve together).
   - On re-run: if the symlink already exists and points to the correct source, skip. If it points elsewhere, warn and ask the user. If a legacy file-level symlink (`<skill-name>/SKILL.md`) exists from an older install, replace it with the directory symlink.
   - After installing: include a note in the final summary that internal package-relative paths in the skills resolve correctly when used through the orchestrator wrapper (via CLAUDE.md), but direct slash command invocation may have path resolution issues for contract references. Use copy mode if direct invocation is the primary use case.

   **If copy:**
   - Create directories if they do not exist.
   - Copy the full content of each `<package-root>/skills/<skill-name>/` directory: `SKILL.md` plus `references/` when present.
   - In each copied `.md` file, rewrite package-relative path prefixes to be project-relative:
     - `skills/_shared/` → `<package-root>/skills/_shared/`
     - `orchestrator/` → `<package-root>/orchestrator/`
     - `templates/artifacts/` → `<package-root>/templates/artifacts/`
     - `templates/bootstrap/` → `<package-root>/templates/bootstrap/`
     - `templates/delivery/` → `<package-root>/templates/delivery/`
   - Do not rewrite `./sdd-lite/` paths — they are already project-relative.
   - Do not rewrite `references/` paths — they are skill-relative and the directory is copied alongside `SKILL.md`.
   - On re-run: if copied files already exist, replace them (they are generated output, not user content).

   After skills are installed for a selected AI, install execution-profile adapters. Do not ask a second method question. Adapters are always **copy** (generated). Profile ids, host files, and defaults come from `<package-root>/templates/agents/profiles.yaml`. Apply `execution_profiles` overrides from the existing or about-to-be-written `config.yaml` when present; otherwise use the template defaults.

   **Profiles to install** (all eight, read the ids from `profiles.yaml`): `sddl-light`, `sddl-framer`, `sddl-explorer`, `sddl-architect`, `sddl-sequencer`, `sddl-executor`, `sddl-reviewer`, `sddl-qa`.

   - `claude_code`: copy each `templates/agents/claude/<profile>.md` to `.claude/agents/<profile>.md`. Replace `<package-root>` with `project.package_root`. If `execution_profiles.<profile>.claude.model` or `.effort` is set, write those values into the frontmatter `model` / `effort` fields.
   - `agents`: copy each `templates/agents/codex/<profile>.toml` to `.codex/agents/<profile>.toml` and replace `<package-root>` with `project.package_root`. Resolve `model` and `effort` independently: use `execution_profiles.<profile>.codex` when that field is present, otherwise keep the profile default from `templates/agents/profiles.yaml`. For Codex, `model: inherit` is a generation sentinel: remove or omit the TOML `model` key entirely; never write `model = "inherit"`. For any explicit model slug, write exactly one `model = "..."` key. Write the resolved effort as exactly one `model_reasoning_effort = "..."` key. Claude keeps its native `model: inherit` frontmatter behavior.
   - Create the parent directory if it does not exist.
   - On re-run: replace existing adapter files. They are generated; user overrides belong in `config.yaml` `execution_profiles`, not in the copied files.
   - On re-run: delete any `sddl-*.md` / `sddl-*.toml` in the adapter directory whose id is not in `profiles.yaml` (for example `sddl-planner.*` from profiles `0.3`) and list the deletions in the final summary. A stale adapter is a launch target the wrapper no longer names.
   - If the existing `config.yaml` carries `execution_profiles.sddl-planner`, move that override to `sddl-architect`, drop the `sddl-planner` key, and say so in the summary. Any other override key absent from `profiles.yaml` is reported and dropped.
   - `sddl-init` itself is not an execution profile.

7. Wrapper injection
   For each AI configured in step 5:

   a. Read the corresponding wrapper template:
      - `claude_code`: `<package-root>/templates/wrappers/claude-orchestrator.md`
      - `agents`: `<package-root>/templates/wrappers/agents-orchestrator.md`
      Both templates are wrapper contract version `0.4` and point directly to `<package-root>/orchestrator/SDDL-RUNTIME.md`.
   b. Resolve placeholders in the template:
      - `<package-root>` → the value of `project.package_root` being written to `config.yaml`
      - `<generated_at>` → current ISO timestamp
   c. Show a short preview of the block to the user (first 5 lines are enough).
   d. Ask for confirmation:
      ```
      Insert sdd-lite wrapper into CLAUDE.md? [y/n]
      ```
   e. If confirmed:
      - If the target file exists and contains `<!-- sdd-lite:start -->`: replace the entire block between `<!-- sdd-lite:start -->` and `<!-- sdd-lite:end -->` with the resolved template.
      - If the target file exists but has no `<!-- sdd-lite:start -->` marker: append the resolved block at the end of the file.
      - If the target file does not exist: create it containing only the resolved block.
      - Treat any existing wrapper with a missing version or a version lower than `0.4` as incompatible (a `0.3` wrapper names the retired `sddl-planner` profile). Replace the full marked block; never preserve or merge legacy orchestration text into the new wrapper.
   f. If the user declines: show the resolved block as plain text with instructions on where to paste it manually.
   g. If both `claude_code` and `agents` are being injected, repeat the dual-load warning before the second confirmation.

8. Infer project bootstrap facts
   Infer project identity, canonical runtime paths, and bootstrap metadata from the evidence collected in step 2.

9. Build project context
   Source template: `<package-root>/templates/bootstrap/project-context.md`
   Generate `./sdd-lite/project-context.md` using compact, reusable facts from steps 2, 3, and 8.

10. Build skill catalog
    Source template: `<package-root>/templates/bootstrap/skill-catalog.md`
    Generate `./sdd-lite/skill-catalog.md` as the runtime standards registry: fill the template sections with compact rules, trigger mappings, delegation heuristics, the execution-profile table, and the `### project_conventions` bullets distilled in step 3.
    This is not a separate skill.

11. Build config
    Source template: `<package-root>/templates/bootstrap/config.yaml`
    Must validate against: `<package-root>/schemas/config.schema.yaml`
    Generate `./sdd-lite/openspec/config.yaml` with the approved local runtime:
    - runtime root: `./sdd-lite/`
    - artifact root: `./sdd-lite/openspec/`
    - `ai_setups` section recording the results of steps 4–7:
      - `detected`: list of AI ids found in step 4
      - `configured`: list of AI ids the user selected in step 5
      - `skills_installed`: one entry per install target with `target`, `method`, `installed_at`, and `skills` list
      - `agents_installed`: one entry per adapter target with `target`, `method: copy`, `installed_at`, and `profiles` list
      - `wrappers_injected`: one entry per AI where wrapper injection was confirmed, with `ai`, `target_file`, and `injected_at`
    - copy `execution_profiles` from the previous config when the user had overrides; otherwise omit the section so template defaults apply

12. Final summary
    Return a short bootstrap summary that distinguishes reads, writes, inferences, and any questions asked.
    Include a dedicated AI setup section in the summary covering:
    - AI setups detected
    - AI setups configured
    - Skills installed (method and target directory per AI)
    - Execution-profile adapters installed (target directory per AI)
    - Wrapper injection status per AI (injected, declined, or skipped)
    - Dual-wrapper warning if both hosts were configured

## Validation

Before finishing, verify:

- bootstrap writes only target `./sdd-lite/` (except AI setup files explicitly confirmed by the user)
- detected paths match the approved local runtime layout
- `project-context.md` captures stack, directories, docs, commands, conventions, and risks
- every `Conventions` row in `project-context.md` is either backed by evidence or marked `not established`
- `skill-catalog.md` acts as the runtime standards registry and includes compact rules usable in delegated prompts
- `### project_conventions` in `skill-catalog.md` holds project facts, not sdd-lite rules, and stays within 6 bullets
- `config.yaml` includes project identity, stack, quality commands, bootstrap metadata, canonical paths, chat language support, and `ai_setups`
- persisted artifacts remain English even when `chat_language` is `es`
- skill files exist at the expected target paths for each configured AI, including `references/` files for skills that ship them
- for each configured AI, all eight adapter files exist at `.claude/agents/` or `.codex/agents/`, contain the resolved `package_root`, and no `sddl-*` adapter remains for an id absent from `profiles.yaml`
- for each configured AI, the `model` / `effort` in every generated adapter equals the `profiles.yaml` default or the `execution_profiles` override, and `config.yaml` holds no `execution_profiles` key outside the `profiles.yaml` ids
- for `claude_code`, every skill named in an adapter's `skills:` frontmatter exists under `.claude/skills/<skill-name>/`
- every generated Codex adapter parses as TOML, contains at most one `model` and one `model_reasoning_effort` key, and never contains `model = "inherit"`
- in copy mode, every rewritten package-relative path resolves to an existing file
- wrapper blocks in `CLAUDE.md` / `AGENTS.md` use demarcated markers and contain the correct resolved `package_root`
- wrapper blocks use contract version `0.4`, point to `orchestrator/SDDL-RUNTIME.md`, contain worker-bypass controls, and name `execution_profile`
- no installed wrapper still references a pre-0.4 runtime path or the retired `sddl-planner` profile
- no wrapper block was inserted without explicit user confirmation

## Expected Output

On success, provide:

- bootstrap status: `created`, `refreshed`, or `already_usable`
- files written or kept
- detected stack and package manager
- key docs, source roots, and quality commands found
- inferred items versus user-confirmed items
- unresolved bootstrap questions, if any
- whether the runtime standards registry is ready for prompt injection
- AI setup summary:
  - AI setups detected
  - AI setups configured
  - skills installed per AI (method: symlink or copy, target directory)
  - execution-profile adapters installed per AI (always copy; `.claude/agents` or `.codex/agents`)
  - wrapper injection status per AI (injected / declined / skipped)

Use `partial` when bootstrap is usable but one or more high-value signals remain uncertain, or when AI setup was skipped or partially declined.
Use `blocked` only when the project cannot be scanned safely or a material contradiction prevents a reliable bootstrap.
