---
name: sddl-init
description: |
  Bootstrap or refresh sdd-lite in the current project. Use when sdd-lite has not been
  initialized yet, when the bootstrap context is stale, or when AI wrappers and skills
  need to be installed. Triggers on: "sddl-init", "bootstrap sdd-lite", "init sdd",
  "inicializar sdd", "instalar sdd-lite".
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
- existing `./sdd-lite/project-context.md`
- existing `./sdd-lite/skill-catalog.md`
- existing `./sdd-lite/openspec/config.yaml`

## Writes

Write or refresh only:

- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md`
- `./sdd-lite/openspec/config.yaml`

When AI setup configuration is confirmed by the user:

- `.claude/skills/<skill-name>/` (skill directory symlink or copy per user choice, including `references/` when present) for Claude Code
- `.agents/skills/<skill-name>/` (skill directory symlink or copy per user choice, including `references/` when present) for Codex
- `CLAUDE.md` (wrapper block injection, demarcated) for Claude Code
- `AGENTS.md` (wrapper block injection, demarcated) for Codex

Do not write change-scoped artifacts.
Do not write outside `./sdd-lite/` except for AI setup files explicitly confirmed by the user.

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
- which AI setups to configure (step 4)
- whether to install skills as symlinks or copies (step 5)
- whether to inject the wrapper into a detected AI file (step 6)

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

3. AI setup detection
   Scan the project root for known AI setup signals. Do not modify any files in this step.

   | Signal found | AI detected |
   |---|---|
   | `CLAUDE.md` exists | Claude Code |
   | `.claude/` directory exists | Claude Code |
   | `AGENTS.md` exists | Codex |
   | `.codex/` directory exists | Codex |

   If both are found, list both. Record the detection results for step 4.

4. AI configuration selection (checkpoint)
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
       [2] Codex (AGENTS.md found)
     Configure sdd-lite for: all / 1 / 2 / none
     ```
   - If no AI detected:
     ```
     No AI setup found in this project.
     Which AI would you like to configure sdd-lite for?
       [1] Claude Code (will create CLAUDE.md if missing)
       [2] Codex (will create AGENTS.md if missing)
       [3] Both
       [4] Skip AI setup
     ```

   If the user selects `none` or `skip`, omit steps 5 and 6 and proceed to step 7.

5. Skill installation
   For each AI selected in step 4, ask the installation method:

   ```
   Install sdd-lite skills as:
     [1] Symlink — points to package files, no copy needed
                   (recommended when the package stays in this repo)
     [2] Copy    — copies SKILL.md files to the target directory
                   (use when the package may move or symlinks are unsupported)
   ```

   **Skills to install** (all 10 canonical skills):
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

   Some skills ship extra protocol files in a `references/` directory next to their `SKILL.md` (currently `sddl-code-review` and `sddl-judgment-day`). Installation always covers the whole skill directory, not only `SKILL.md`.

   **If symlink:**
   - Target parent directory for Claude Code: `.claude/skills/`
   - Target parent directory for Codex: `.agents/skills/`
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
   - Do not rewrite `./sdd-lite/` paths — they are already project-relative.
   - Do not rewrite `references/` paths — they are skill-relative and the directory is copied alongside `SKILL.md`.
   - On re-run: if copied files already exist, replace them (they are generated output, not user content).

6. Wrapper injection
   For each AI configured in step 4:

   a. Read the corresponding wrapper template:
      - Claude Code: `<package-root>/templates/wrappers/claude-orchestrator.md`
      - Codex: `<package-root>/templates/wrappers/codex-orchestrator.md`
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
   f. If the user declines: show the resolved block as plain text with instructions on where to paste it manually.

7. Infer project bootstrap facts
   Infer project identity, canonical runtime paths, and bootstrap metadata from the evidence collected in step 2.

8. Build project context
   Generate `./sdd-lite/project-context.md` from the bootstrap template using compact, reusable facts.

9. Build skill catalog
   Generate `./sdd-lite/skill-catalog.md` through an internal helper flow as the runtime standards registry.
   It should include compact rules, trigger mappings, delegation heuristics, and support-agent references.
   This is not a separate skill.

10. Build config
    Generate `./sdd-lite/openspec/config.yaml` with the approved local runtime:
    - runtime root: `./sdd-lite/`
    - artifact root: `./sdd-lite/openspec/`
    - `ai_setups` section recording the results of steps 3–6:
      - `detected`: list of AI ids found in step 3
      - `configured`: list of AI ids the user selected in step 4
      - `skills_installed`: one entry per AI with `target`, `method`, `installed_at`, and `skills` list
      - `wrappers_injected`: one entry per AI where wrapper injection was confirmed, with `ai`, `target_file`, and `injected_at`

11. Final summary
    Return a short bootstrap summary that distinguishes reads, writes, inferences, and any questions asked.
    Include a dedicated AI setup section in the summary covering:
    - AI setups detected
    - AI setups configured
    - Skills installed (method and target directory per AI)
    - Wrapper injection status per AI (injected, declined, or skipped)

## Validation

Before finishing, verify:

- bootstrap writes only target `./sdd-lite/` (except AI setup files explicitly confirmed by the user)
- detected paths match the approved local runtime layout
- `project-context.md` captures stack, directories, docs, commands, conventions, and risks
- `skill-catalog.md` acts as the runtime standards registry and includes compact rules usable in delegated prompts
- `config.yaml` includes project identity, stack, quality commands, bootstrap metadata, canonical paths, chat language support, and `ai_setups`
- persisted artifacts remain English even when `chat_language` is `es`
- skill files exist at the expected target paths for each configured AI, including `references/` files for skills that ship them
- wrapper blocks in `CLAUDE.md` / `AGENTS.md` use demarcated markers and contain the correct resolved `package_root`
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
  - wrapper injection status per AI (injected / declined / skipped)

Use `partial` when bootstrap is usable but one or more high-value signals remain uncertain, or when AI setup was skipped or partially declined.
Use `blocked` only when the project cannot be scanned safely or a material contradiction prevents a reliable bootstrap.
