# sdd-lite — Review Protocols

Other docs: [architecture.md](./architecture.md) · [orchestrator.md](./orchestrator.md) · [flow.md](./flow.md) · [skills.md](./skills.md) · [config-and-state.md](./config-and-state.md)

Deep dive on `sddl-code-review` (4R) and `sddl-judgment-day`. Both are **orchestrator-executed protocols**, not linear stages: the orchestrator freezes the target, launches read-only lens/judge workers, and writes `review-ledger.md` itself — workers never write files. The normative shared mechanics are lazy-loaded from `../orchestrator/modules/review-runtime.md`; see [orchestrator.md](./orchestrator.md) for the runtime loading model.

They are mutually exclusive per target: `sddl-code-review` is the default, auto-offered path; `sddl-judgment-day` is opt-in only, never auto-routed, and replaces 4R for that specific target.

## Sequence overview

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant W as sddl-reviewer (lens / judge)
    participant L as review-ledger.md

    O->>O: Freeze target (commit SHA / diff hash / artifact digest)
    O->>O: Triage (4R only) or confirm mode+target (judgment-day)
    O->>W: Launch read-only sddl-reviewer worker(s), Review Worker Envelope
    Note over W: 4R: 0/1/4 lenses by tier, one prompt per lens<br/>Judgment-day: 2 blind judges, byte-identical envelopes
    W-->>O: findings rows (never write files)
    O->>O: Merge by location + claim (dedup / convergence)
    alt 4R full-4r tier
        O->>W: Launch 1 refuter pass (severe inferential findings only)
        W-->>O: corroborated / refuted / inconclusive per finding
    end
    O->>L: Write digest, findings, corroboration/convergence log, verdict
    alt confirmed severe findings
        O->>O: Raise review_gate → fix route (always via plan.md + stage_approval)
    else contradiction (judgment-day only)
        O->>O: Raise review_gate → user adjudicates
    else clean / info only
        O->>O: Continue routing; ledger feeds sddl-qa-review
    end
```

## `sddl-code-review` (4R)

Default, cost-proportional review of one frozen diff/PR/branch/stage change set. Judges the quality of the change itself — it does not replace `sddl-qa-review`, which judges the change against its spec/plan and remains the only lifecycle closer.

### Triage rubric

| Tier | Criteria | Lenses run |
|---|---|---|
| `trivial` | only docs/comments/formatting/string typos, zero executable code or config changed | none — skip recorded, stop |
| `standard` | everything else | exactly 1, the dominant risk signal |
| `full-4r` | touches auth/security/payments/sensitive data/migrations, or >400 changed lines | all 4 plus 1 refuter pass |

Dominant risk signal for `standard` (pick the highest-impact match when several signals fire; never add lenses to a `standard` review):

| Signal in diff | Lens |
|---|---|
| naming, structure, maintainability, small refactors | Readability (R2) |
| behavior, state, tests, determinism, regressions | Reliability (R3) |
| process/shell integration, partial failures, recovery | Resilience (R4) |
| security, permissions, data exposure, dependency/architecture boundaries | Risk (R1) |

### The four lenses

Prompts live in `skills/sddl-code-review/references/lens-prompts.md`, injected per worker with the target, scope, and standards block filled in.

| Lens | Finds |
|---|---|
| **R1 — Risk** | hardcoded secrets, client-only authz, string-built queries/shell commands, unvalidated trust-boundary input, unsafe deserialization/path traversal, attack-surface widening, missing controls in critical zones |
| **R2 — Readability** | misleading names, dead code introduced by the change, functions past one responsibility (~50 lines), cross-file mental simulation required, undocumented non-obvious logic |
| **R3 — Reliability** | untested behavior changes, vanity tests, swallowed errors, missing timeouts, unhandled edge cases, introduced nondeterminism |
| **R4 — Resilience** | missing retry/backoff, no graceful degradation, silent new failure paths, migrations with no rollback, retry storms/non-idempotent duplication |

Every lens prompt ends with a shared **precision gate** (report only real, user-impacting, evidence-backed defects; stay silent when in doubt; style/preference findings are banned unless they obscure a defect) and a **worker boundary** (read-only, no edits, no sub-agents, one exhaustive sweep, stop).

### Corroboration (refuter)

`full-4r` only, after merging lens findings: collect `BLOCKER`/`CRITICAL` findings with `evidence_class: inferential` (deterministic findings are never refuted), launch exactly one refuter worker with the full candidate batch. Outcomes: `corroborated` / `refuted` / `inconclusive` (a missing or malformed verdict means the finding stands). `refuted` findings leave the fix loop.

## `sddl-judgment-day`

Opt-in, expensive, high-confidence review. Triggered only by explicit request ("judgment day", "dual review", "adversarial review"). No refuter — convergence between two independent judges is the corroboration mechanism itself.

### Target modes

| Mode | Target | Fix path |
|---|---|---|
| `code` | frozen diff, PR, branch, or stage change set | confirmed findings route through `plan.md`, same as 4R |
| `artifact` | one planning artifact (`proposal.md`/`spec.md`/`design.md`/`plan.md`/`macro-plan.md`) | no fix loop; confirmed findings feed a rerun of the owning stage |

### Blind convergence

Both judges get byte-identical envelopes (except the judge letter) and never see each other's output before the orchestrator merges both results — no partial judgment is ever accepted.

| Bucket | Condition | Effect |
|---|---|---|
| `confirmed` | both judges report the same defect (same location, compatible claim) | eligible for the fix loop |
| `suspect` | exactly one judge reports it | recorded `status: suspect`, never auto-fixed |
| `contradiction` | judges make incompatible claims about the same location | escalated to the user (`review_gate`) |
| `info` | any `WARNING`/`SUGGESTION` from either judge | informational only |

Platform blindness note: parallel-worker platforms give real isolation; inline-sequential platforms run Judge A, persist only its findings, then run Judge B without showing it Judge A's output — weaker blindness, which the ledger must record as a documented limitation.

### Terminal states

Exactly one of:

- `JUDGMENT: APPROVED` — no confirmed severe findings remain open (suspects may remain, capping the verdict at `pass_with_warnings`)
- `JUDGMENT: ESCALATED` — a confirmed severe finding survives past round two, or a contradiction stays unresolved

## Severity model (shared by both protocols)

Defined once in `skills/_shared/sddl-review-ledger-contract.md`; both protocols conform to it.

| Severity | Meaning | May be `open`? | Blocks? |
|---|---|---|---|
| `BLOCKER` | must not ship; incident/data-loss likely | yes | yes |
| `CRITICAL` | severe defect with a concrete failure path | yes | yes |
| `WARNING` | real weakness, tolerable short-term | no — recorded once as `info` | never |
| `SUGGESTION` | improvement opportunity | no — recorded once as `info` | never |

Blocking additionally requires `causal_disposition` in `introduced` / `behavior-activated` / `worsened`. `pre-existing` and `unknown` findings are reported but never block the current change.

Severity maps into `state.yaml` `open_risks`: `BLOCKER → critical`, `CRITICAL → high`, `WARNING → medium`, `SUGGESTION → low`.

Ids: `R1-NNN`..`R4-NNN` per lens (4R), `JD-NNN` (judgment-day) — never reassigned once given. Full status lifecycle (`open` → `fixed` → `verified`, `open` → `refuted`/`wont-fix`, `suspect` → `open`/`wont-fix`) lives in `skills/_shared/sddl-review-ledger-contract.md`.

## Fix routing (both protocols)

Confirmed severe findings never trigger a direct edit. The orchestrator raises a `review_gate` and the user decides the route:

| Context | Route |
|---|---|
| active change, findings inside approved scope | rerun `sddl-plan` to insert a fix stage from confirmed ledger ids, then `stage_approval`, then `sddl-executor` |
| active change, findings exceed spec/design scope | reopen `sddl-design`/`sddl-plan` with the findings in the envelope, or record a `scope_change` follow-up |
| standalone, bounded findings | open a mini change seeded from the ledger (`proposal.md` first), expedited formalization |
| standalone, substantial findings | open a full new change, ledger seeds `proposal.md` |

Hard budgets: one exhaustive sweep per lens (two only in `full-4r`), exactly one refuter pass (`full-4r` only), maximum two fix rounds per review lineage — no third round, no lineage reset. A scoped re-review after a fix round sees only the frozen ledger plus the immutable fix delta, never the original diff/target again.

## When to use which

Use `sddl-code-review` (4R) as the default for any non-trivial execution-stage diff or standalone review request — it is cost-proportional and auto-offered.

Reach for `sddl-judgment-day` only when the stakes justify the extra cost: security-critical code, a design decision you want independently stress-tested before execution starts, or when a prior 4R pass left doubt that a second, more adversarial pass should resolve. It must be requested explicitly — the orchestrator never routes into it on its own.
