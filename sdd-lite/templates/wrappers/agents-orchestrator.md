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

do not activate or read the sdd-lite runtime, do not load orchestration modules, do not ask for session or worker mode, and do not route stages. Execute only the named canonical skill under `<package-root>/skills/`, honor its scope and injected standards, return its result contract, and stop. A worker never launches descendants.

## Main-session activation

Activate sdd-lite for the main agent when:

- the user explicitly asks for sdd-lite (`sdd`, `sddl`, `con sdd-lite`, or equivalent)
- a feature, refactor, or fix has uncertain scope or approach
- work spans multiple files, lacks acceptance criteria, or carries non-trivial risk

Do not auto-activate for explanations, clear one-line fixes, or conversational exploration. For substantial work not explicitly requesting SDD, offer it once without forcing it; proceed normally if declined or ignored.

## Main-session runtime

When active, read `<package-root>/orchestrator/SDDL-RUNTIME.md` once and keep it as the main session's orchestration authority. Follow its module trigger table; never preload every module. The main agent alone owns routing, approvals, result processing, and orchestrator-owned ledger writes.

Use canonical skills under `<package-root>/skills/`, standards at `./sdd-lite/skill-catalog.md`, and schemas under `<package-root>/schemas/`. Run bootstrap preflight first, recover from persisted evidence before asking, and keep persisted artifacts in English while chat may be `es` or `en`.

## Platform: AGENTS.md

This wrapper is vendor-neutral for assistants driven by `AGENTS.md`/`.agents/`. Codex CLI is first-class: named roles live in `.codex/agents/`. Grok and OpenCode reuse this wrapper and `.agents/skills/`; they do not load `.codex/agents` and may fall back to a generic child or inline.

Codex TOML adapters are optional for `inline-sequential` operation. All named profile files are required for optimized `native-workers` routing.

After bootstrap preflight passes on the first main-session SDD stage request, ask worker mode together with the runtime's execution-mode question and cache both:

- `native-workers` (recommended when supported): spawn the named execution profile as a fresh native sub-agent and wait.
- `inline-sequential`: main context executes the named skill sequentially when selected or native delegation is unavailable.

Worker mode controls isolation only; `interactive`/`auto` controls pacing only. Neither changes approvals or guardrails. Codex cloud tasks, background terminals, and API multi-agent are not the stage bus.

### Native workers

- Resolve `execution_profile` from the handoff (or the stage map in `skills/_shared/sddl-flow-contract.md`).
- Spawn that named role (`sddl-light`, `sddl-framer`, `sddl-explorer`, `sddl-architect`, `sddl-sequencer`, `sddl-executor`, `sddl-reviewer`, `sddl-qa`) in a fresh thread — do not fork the parent conversation. Wait for the result before routing. Do not name Claude `Agent` or OpenCode `Task` tools.
- Delegate per phase or approved execution stage, not per file.
- Pass the compact runtime handoff, including every worker-bypass control and `execution_profile`.
- Parallelize only independent read-only work or fully disjoint writes. Children never launch descendants.
- For 4R and judgment-day, first load `<package-root>/orchestrator/modules/review-runtime.md`, then spawn waited `sddl-reviewer` children. If the host concurrency cap is below the batch size, run sequential batches. Judges remain blind; workers return findings only.

### Inline fallback

State that fresh-context isolation is unavailable. Execute the named **skill** in the main context — do not claim a named agent ran. Retain state, decisions, digests, and the current handoff; prefer targeted persisted reads and do not claim conversation context was manually removed. Persist state after every stage and apply the full runtime result, routing, approval, and module rules. Explain the degradation when a mandatory delegation trigger fires.
<!-- sdd-lite:end -->
