# Review Ledger

## Review Digest

- target_identity:
- review_mode: 4r | judgment-day
- judgment_target_kind: code | artifact
- tier: trivial | standard | full-4r | not_applicable
- scope: change:<change-name> | standalone:<target-slug>
- round: 0 | 1 | 2
- counts: confirmed=0 suspect=0 escalated=0 info=0
- open_severe_findings: 0
- verdict: pass | pass_with_warnings | fail | not_reached
- next_action_digest:
- updated_at:

The digest is the resume anchor for standalone reviews.
It must always be reconstructible without reading the full ledger body.

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

The sections below always describe the current review lineage.
When a new review starts on a new target for this change, append the finished lineage's summary row here, then reset the working sections to the new target.

## Target

- description:
- target_kind: diff | pr | paths | artifact
- paths_or_diff_reference:
- changed_lines:
- immutable_reference:
- created_at:

`immutable_reference` freezes the review target: a commit SHA, diff hash, or artifact digest.
All sweeps, refutations, and re-judgments run against this reference, never a moving tree.

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|

Field rules:

- `Id`: `{LENS}-{NNN}` for 4R (`R1-001`), `JD-{NNN}` for judgment-day.
- `Lens/Judge`: `risk` | `readability` | `reliability` | `resilience` | `judge-a` | `judge-b` | `both-judges`.
- `Location`: `path/to/file.ext:line` or `path:start-end`; artifact section anchor for `artifact` targets.
- `Severity`: `BLOCKER` | `CRITICAL` | `WARNING` | `SUGGESTION`.
- `Status`: `open` | `suspect` | `fixed` | `verified` | `refuted` | `wont-fix` | `info`.
- `Evidence Class`: `deterministic` | `inferential`.
- `Causal Disposition`: `introduced` | `behavior-activated` | `worsened` | `pre-existing` | `unknown`.
- `Blocking`: `yes` | `no`.
- `Claim`: one-sentence statement of the observable incorrect behavior, copied verbatim from the worker finding (dedup, refutation, and re-judgment match on it).
- `Proof Refs`: concrete proof references backing the claim (`file:line`, command output, spec section).

Governing rules:

- Severity floor: only `BLOCKER` and `CRITICAL` findings may hold `status: open` or `status: suspect`, and only `open` rows enter the fix loop.
- Severe findings reported by exactly one judge (judgment-day) hold `status: suspect`: recorded, never auto-fixed, never blocking.
- `WARNING` and `SUGGESTION` are recorded once with `status: info`, never re-reviewed, never blocking.
- Only `introduced`, `behavior-activated`, or `worsened` findings may be `Blocking: yes`.
- Severity mapping into `state.yaml` risks: `BLOCKER` -> `critical`, `CRITICAL` -> `high`, `WARNING` -> `medium`, `SUGGESTION` -> `low`.

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|

Mechanism values:

- `refuter` (4r): outcomes `corroborated` | `refuted` | `inconclusive`. Malformed or missing verdict means the finding stands.
- `judge-convergence` (judgment-day): outcomes `confirmed` (both judges) | `suspect` (one judge) | `contradiction` (judges disagree).

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|

- Maximum 2 fix rounds per review lineage. No third round exists.
- `Fix Vehicle`: the plan stage id that carried the fix (fixes always flow through `plan.md` and `sddl-executor`), or `external` when the user fixed manually.
- Scoped re-review sees only this frozen ledger plus the immutable fix delta.

## Verdict Rationale

- 

## Next Recommended Action

- 

## Budget Notes

- One exhaustive sweep per lens (two in full-4r). No loop-until-dry.
- Keep the digest short enough for routing and resume.
- Target roughly 200 to 400 words plus tables.
