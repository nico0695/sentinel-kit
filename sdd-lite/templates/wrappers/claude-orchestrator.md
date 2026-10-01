<!-- sdd-lite:start generated_at="<generated_at>" version="0.4" package_root="<package-root>" -->
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

do not activate or read the sdd-lite runtime, do not load orchestration modules, do not ask for session mode, and do not route stages. Execute only the named canonical skill under `<package-root>/skills/`, honor its scope and injected standards, return its result contract, and stop. A worker never launches descendants.

## Main-session activation

Activate sdd-lite for the main agent when:

- the user explicitly asks for sdd-lite (`sdd`, `sddl`, `con sdd-lite`, or equivalent)
- a feature, refactor, or fix has uncertain scope or approach
- work spans multiple files, lacks acceptance criteria, or carries non-trivial risk

Do not auto-activate for explanations, clear one-line fixes, or conversational exploration. For substantial work not explicitly requesting SDD, offer it once without forcing it; proceed normally if declined or ignored.

## Main-session runtime

When active, read `<package-root>/orchestrator/SDDL-RUNTIME.md` once and keep it as the main session's orchestration authority. Follow its module trigger table; never preload every module. The main agent alone owns routing, approvals, result processing, and orchestrator-owned ledger writes.

Use canonical skills under `<package-root>/skills/`, standards at `./sdd-lite/skill-catalog.md`, and schemas under `<package-root>/schemas/`. Run bootstrap preflight first, recover from persisted evidence before asking, and keep persisted artifacts in English while chat may be `es` or `en`.

## Platform: Claude Code

- Resolve `execution_profile` from the handoff (or the stage map in `skills/_shared/sddl-flow-contract.md`) and delegate through the native Agent tool as that named type (`sddl-light`, `sddl-framer`, `sddl-explorer`, `sddl-architect`, `sddl-sequencer`, `sddl-executor`, `sddl-reviewer`, `sddl-qa`). Fresh context; wait for the result. Do not use the Skill tool or a history fork as the stage launcher. Do not use the built-in Explore type.
- `interactive`/`auto` controls pacing only. It never bypasses `stage_approval` or another mandatory gate.
- Parallelize only independent read-only work or fully disjoint write scopes. Never overlap artifact writes.
- For 4R and judgment-day, first load `<package-root>/orchestrator/modules/review-runtime.md`, then launch each selected lens, judge, or refuter as waited `sddl-reviewer` workers. Judges remain blind; workers return findings only.
- Every child receives the worker-bypass controls including `execution_profile`. If it discovers out-of-scope work, it returns `partial` or `blocked`; it does not delegate.
- If the named `sddl-*` agent type is not available (adapters not installed or stale), launch `general-purpose` with `model` taken from that profile in `<package-root>/templates/agents/profiles.yaml`, paste the body of `<package-root>/templates/agents/claude/<profile>.md` at the top of the handoff, state that host-level tool limits are not enforced, and recommend rerunning `sddl-init`.
- Under `auto` or `bypassPermissions`, the host ignores `permissionMode: plan` in `sddl-explorer`/`sddl-reviewer`; read-only is then prompt-level only. Keep the review-runtime rule: reject and audit any worker file write.

If the Agent tool is denied or unavailable, state that fresh-context isolation is unavailable and execute the named **skill** in the main context — do not claim a named agent ran. Continue under the complete runtime contract, persist state after each stage, and explain the degradation when a mandatory delegation trigger fires.
<!-- sdd-lite:end -->
