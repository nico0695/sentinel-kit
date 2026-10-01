# sdd-lite — Orchestrator Runtime

Other docs: [architecture.md](./architecture.md) · [flow.md](./flow.md) · [skills.md](./skills.md) · [review-protocols.md](./review-protocols.md) · [config-and-state.md](./config-and-state.md)

`orchestrator/SDDL-RUNTIME.md` is the normative hot-path contract. This document explains its loading model without redefining its routing rules.

## Runtime loading model

1. The host loads its `CLAUDE.md` or `AGENTS.md` instructions.
2. A delegated handoff is checked first. When all worker controls are present, the worker bypasses orchestration and executes only the named skill.
3. Otherwise, when the main agent activates sdd-lite, it explicitly reads `SDDL-RUNTIME.md` once.
4. The main agent keeps routing, approvals, handoffs, and general result processing in its session context.
5. It reads one module only after the corresponding event fires. A link alone is not an instruction to preload the file.

The main runtime remains the sole orchestrator. Modules add event-specific rules; they do not start another event loop or delegate by themselves.

## Hot and conditional responsibilities

| Always in the main runtime | Loaded conditionally |
|---|---|
| session mode and bootstrap preflight | review freeze, fan-out, ledger merge, and fix rounds |
| evidence ladder and accumulation check | combined delivery/archive closeout offer |
| delegation thresholds and complexity route | contradictory resume and incident recovery |
| complete stage routing table | |
| handoff controls and general result processing | |
| normal resume, approvals, stops, guardrails | |

Direct delivery, named archive, accumulation cleanup, and normal resume do not need a module.

## Worker boundary

Every native worker receives these fields before stage-specific instructions:

```yaml
sddl_role: phase-worker # review-worker for lenses, judges, and refuters
stage: sddl-*
execution_profile: sddl-framer # light | explorer | architect | sequencer | executor | reviewer | qa
orchestration_allowed: false
runtime_loading_allowed: false
```

The wrapper checks them before activation. The worker loads its skill, uses injected standards and bounded evidence, returns the shared result contract, and stops. If it needs broader work, it returns `partial` or `blocked`; only the main agent decides the next route.

## Module triggers

- Load `modules/review-runtime.md` before offering, starting, resuming, or merging a 4R/judgment-day review.
- Load `modules/closeout-runtime.md` only after final QA completes a change and the combined closeout decision is unresolved.
- Load `modules/exceptional-recovery.md` only when normal resume cannot reconcile evidence or a material runtime incident occurred.

Modules are loaded once per session. After compaction, reload a module only if its instructions are no longer available and another event of that type occurs.

## Wrapper migration

Wrapper contract `0.4` is intentionally strict. A consuming project with a pre-0.4 marked block must rerun `sddl-init`, preview the replacement, and approve replacing the entire block in `CLAUDE.md` and/or `AGENTS.md`. Do not merge old and new orchestration prose.

`execution_profiles` is an optional config addition. Existing `config.yaml` files without that section stay valid; adapter files then keep template defaults.

## Manual validation checklist

- Normal proposal through plan: wrapper + main runtime only.
- Phase worker: named skill only; no runtime, module, mode question, or child delegation.
- Standard/full-4R/judgment-day: review module loaded before workers; ledger remains main-owned.
- Final QA completed: closeout module loaded and exactly one combined offer shown.
- Consistent resume: main runtime only.
- Contradictory resume or material incident: exceptional recovery module loaded before any write.
- Claude native workers and AGENTS native workers: compact handoff contains worker-bypass controls plus `execution_profile`.
- Named profile launch: Claude Agent type and Codex named role match the stage map; review children are `sddl-reviewer`.
- Inline fallback: same approvals, routing, module triggers, and guardrails without claiming fresh-context isolation or that a named agent ran.
- Interactive and auto: pacing differs; mandatory approvals do not.
- Regenerated wrapper: marker version is `0.4` and points directly to `SDDL-RUNTIME.md`.
- Adapter directory: exactly the eight `profiles.yaml` ids, no stale `sddl-planner.*` file, and each adapter's model/effort matches `profiles.yaml` or the `execution_profiles` override.
