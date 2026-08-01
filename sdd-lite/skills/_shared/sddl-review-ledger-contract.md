# Review Ledger Contract

Canonical rules for `review-ledger.md` rows and for the `findings` field of the
common result structure. Shared by `sddl-code-review` and `sddl-judgment-day`.
The document shape lives in `templates/artifacts/review-ledger.md`.

## Worker Findings Contract

Lens workers and judges return findings inside the common result structure as:

```yaml
findings:
  - location: "path/to/file.ext:42"        # or path:start-end; artifact section anchor for artifact targets
    severity: BLOCKER | CRITICAL | WARNING | SUGGESTION
    claim: "observable incorrect behavior, one sentence"
    evidence_class: deterministic | inferential
    causal_disposition: introduced | behavior-activated | worsened | pre-existing | unknown
    proof_refs: ["concrete proof: file:line, command output, spec section"]
evidence: ["what was inspected"]
```

Workers never assign ids or statuses; the orchestrator does when merging.

## Severity Model

| Severity | Meaning | May hold `open`? | Blocks? |
|---|---|---|---|
| `BLOCKER` | must not ship; incident or data loss likely | yes | yes |
| `CRITICAL` | severe defect with a concrete failure path | yes | yes |
| `WARNING` | real weakness, tolerable short-term | no — recorded once as `info` | never |
| `SUGGESTION` | improvement opportunity | no — recorded once as `info` | never |

Severity floor: only `BLOCKER`/`CRITICAL` enter refutation, fix rounds, and re-review.

Blocking additionally requires `causal_disposition` in `introduced`, `behavior-activated`, or `worsened`.
`pre-existing` and `unknown` findings are reported but never block this change.

Mapping into `state.yaml` `open_risks` severity: `BLOCKER -> critical`, `CRITICAL -> high`, `WARNING -> medium`, `SUGGESTION -> low`.

## Id And Status Rules

- Ids: `R1|R2|R3|R4-{NNN}` per lens for 4R; `JD-{NNN}` for judgment-day. Ids never change once assigned.
- Status values: `open` | `suspect` | `fixed` | `verified` | `refuted` | `wont-fix` | `info`. `suspect` exists only in judgment-day (4R corroboration is refuter-based and leaves severe findings `open` unless `refuted`).
- Status transitions (only these):
  - severe findings reported by exactly one judge (judgment-day) are created directly as `suspect`: recorded, outside the fix loop, never blocking
  - `suspect -> open` only by explicit user decision (`review_gate`) or when a later round has both judges confirm the same defect
  - `suspect -> wont-fix` only by explicit user decision recorded through a checkpoint
  - `open -> fixed` when a fix stage applies a change for the finding
  - `fixed -> verified` when the scoped re-review confirms the fix delta resolves it
  - `open -> refuted` via refuter outcome `refuted` (4r) or judge contradiction resolved against it
  - `open -> wont-fix` only by explicit user decision recorded through a checkpoint
  - `WARNING`/`SUGGESTION` rows are created directly as `info` and stay `info`
- A row is never deleted within a review lineage; findings history stays in the ledger until the lineage terminates.
- One ledger file per change: the working sections (digest, target, findings, corroboration, fix rounds) always describe the current review lineage. When a new review starts on a new target for the same change, append the finished lineage's summary row to the ledger's `Review History` section, then reset the working sections to the new target. Standalone reviews get one ledger per `target-slug`, so their history section rarely grows.

## Convergence Buckets (judgment-day only)

| Bucket | Condition | Effect |
|---|---|---|
| `confirmed` | both judges report the same severe defect (same location and compatible claim) | eligible for the fix loop |
| `suspect` | exactly one judge reports it | recorded with `status: suspect`, never auto-fixed |
| `contradiction` | judges make incompatible claims about the same location | escalated to explicit human decision via `review_gate` |
| `info` | any `WARNING`/`SUGGESTION` from either judge | informational only |

## Digest Rules

The Review Digest at the top of the ledger is the routing and resume anchor:

- always current: rewrite it on every merge, fix round, and re-review
- counts line uses fixed keys: `confirmed`, `suspect`, `escalated`, `info`
- counts mapping by mode: `judgment-day` uses the convergence buckets directly; `4r` uses `confirmed` = severe findings standing after corroboration (deterministic, `corroborated`, or `inconclusive`), `suspect` = 0, `escalated` = 0 (no judge adjudication exists in 4R), `info` = `WARNING`/`SUGGESTION` rows
- `open_severe_findings` counts only rows with `status: open`; `suspect` rows never count as open
- verdict: `pass` (no open severe findings and no suspects), `pass_with_warnings` (only `info` and/or `suspect` rows remain), `fail` (open severe findings after budget exhaustion or an unresolved contradiction), `not_reached` (review in progress)
- standalone reviews have no `state.yaml`; the digest alone must explain where the review stands

## Budgets (hard caps)

- one exhaustive sweep per lens; two per lens only in `full-4r`
- exactly one refuter pass, and only in `full-4r` reviews; zero in `trivial`/`standard` tiers and in judgment-day (convergence corroborates)
- maximum two fix rounds per review lineage; no third round, no lineage reset
- scoped re-reviews see only the frozen ledger plus the immutable fix delta
