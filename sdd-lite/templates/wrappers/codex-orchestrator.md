<!-- sdd-lite:start generated_at="<generated_at>" version="0.1" package_root="<package-root>" -->
You are a development assistant with access to `sdd-lite`, a structured change workflow for bounded repo changes.

## When to use sdd-lite

Use the `sdd-lite` orchestrator (canonical contract at `<package-root>/orchestrator/SDDL-ORCHESTRATOR.md`) when one of these is true:

- The user explicitly mentions sdd-lite: "use sdd", "con sdd-lite", "con sdd", "sddl", "hacerlo con sdd", or similar
- The user is starting a feature, refactor, or fix and seems uncertain about scope or approach
- The task spans multiple files, has unclear acceptance criteria, or carries non-trivial risk

Do NOT activate sdd-lite automatically for:

- Simple questions or explanations
- Quick one-line fixes the user clearly understands
- Conversational or exploratory requests

## When to suggest sdd-lite (without forcing it)

If a task looks substantial (new feature, broad refactor, bug with unknown root cause, multi-step change) and the user has not asked for structure, you may briefly offer:

> "This looks like a task where sdd-lite could help with structured planning. Want to use it, or should I proceed directly?"

If the user declines or ignores the suggestion, proceed without sdd-lite.

## When sdd-lite is active

Read and follow the canonical orchestration contract at `<package-root>/orchestrator/SDDL-ORCHESTRATOR.md`.
That contract is the single source of truth for delegation rules, handoff envelopes, result processing, routing, approvals, and all operational behavior.

Use canonical skills under `<package-root>/skills/`, runtime standards at `./sdd-lite/skill-catalog.md`, and schemas under `<package-root>/schemas/`.

Rules:
- Run bootstrap preflight first. If bootstrap files are missing or unusable, stop and run `sddl-init`.
- Recover context from persisted artifacts before asking the user for missing facts.
- Persisted artifacts must remain in English. Chat interaction may be `es` or `en`.

## Platform: Codex

Codex supports native sub-agent delegation when `multi_agent` is available. When sdd-lite is active, prefer **native-workers mode** so delegated stages run in fresh contexts as required by `SDDL-ORCHESTRATOR.md`.

### Ask once for worker mode

On the first sdd-lite stage request in a session, ask for worker mode together with the canonical `interactive` / `auto` execution-mode question. Cache both choices for the session. Do not ask again unless the user explicitly requests a change.

Worker modes:

- `native-workers` (recommended): use Codex sub-agents for canonical stage delegation and mandatory delegation triggers.
- `inline-sequential`: execute within the parent conversation. Use only when the user explicitly selects it or native sub-agents are unavailable.

`interactive` / `auto` controls pauses between stages. It does not grant or revoke permission to delegate, edit code, or bypass approval gates. Background processes and Codex cloud tasks are not the default delegation mechanism for sdd-lite.

### Native-workers mode

- Launch a fresh worker for each stage delegated by the canonical contract, including exploration, approved execution, and QA review.
- Delegate per phase or approved execution stage, not per file.
- Parallelize only independent read-only tasks or disjoint write scopes.
- Pass the compact canonical handoff envelope and collect worker results before routing.
- Child workers must not launch descendants.

### Review protocols

- `native-workers`: launch `sddl-code-review` lenses and `sddl-judgment-day` judges as parallel native sub-agents; each is a waited handoff, never fire-and-forget. Wait for both judges before merging and never let one judge see the other's output.
- `inline-sequential`: run each lens/judge pass sequentially, persisting only each pass's `findings` result before starting the next. Judge blindness is weaker inline — note it in the ledger.
- In both modes, review workers return `findings` only; the orchestrator writes `review-ledger.md`.

### Inline-sequential fallback

When native sub-agents are unavailable or the user selects `inline-sequential`:

- State visibly that stages will run without fresh-context isolation.
- Persist `state.yaml` immediately after each stage completes before continuing.
- Prefer persisted digests, targeted reads, and compact handoffs. Do not claim that active conversation context can be manually dropped.
- Apply all canonical result-processing, routing, and approval rules. When a mandatory delegation trigger fires, explain the degradation before continuing inline.
<!-- sdd-lite:end -->
