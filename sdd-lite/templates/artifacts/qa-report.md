# QA Report

## Closeout Digest

- change_name:
- review_mode:
- reviewed_scope:
- verdict:
- blocking_findings_digest:
- residual_risk_digest:
- next_action_digest:

## Summary

- change_name:
- objective:
- route:
- review_mode: stage | final
- reviewed_scope: stage:<stage-id> | full-change
- target_stage_id:
- lifecycle_status_before_review:
- lifecycle_status_after_review:
- code_touched:
- verdict: pass | pass_with_warnings | fail
- completion_eligible: true | false
- final_review_checkpoint_id:
- final_review_decision_id:
- reported_at:

## Review History

| Review Id | Mode | Reviewed Scope | Verdict | Reported At | Next Action |
|---|---|---|---|---|---|

## Review Context

- proposal_spec_reviewed:
- design_plan_reviewed:
- execution_log_reviewed:
- previous_qa_report_reviewed:
- changed_scope_reviewed:
- quality_commands_considered:
- review_trigger:
- review_notes:

## Review Evidence

Filled only when `review-ledger.md` exists for this change.

- review_ledger_path:
- review_mode: 4r | judgment-day
- ledger_verdict:
- ledger_counts: confirmed= suspect= escalated= info=
- open_severe_findings:
- ledger_findings_reused_instead_of_reanalyzed: true | false
- notes:

Severity mapping when citing ledger rows in QA findings (QA scale has no `critical`): `BLOCKER -> high` with `Blocking: yes`, `CRITICAL -> high`, `WARNING -> medium`, `SUGGESTION -> low`. In `state.yaml` `open_risks`, `BLOCKER` maps to `critical`.
Open severe ledger findings must be reflected in the QA verdict.

## Validation Plan And Results

| Check Id | Category | Source | Planned Check | Outcome | Notes |
|---|---|---|---|---|---|

Recommended category values:

- `artifact`
- `file`
- `command`
- `behavior`
- `observation`

Recommended source values:

- `proposal`
- `spec`
- `design`
- `plan`
- `execution-log`
- `config`
- `repo-state`

Recommended outcome values:

- `passed`
- `warning`
- `failed`
- `not_run`
- `not_applicable`

## Findings

| Finding Id | Severity | Summary | Scope | Blocking | Recommended Action |
|---|---|---|---|---|---|

Recommended severity values:

- `low`
- `medium`
- `high`

Recommended blocking values:

- `yes`
- `no`

## Evidence Log

| Kind | Reference | Notes |
|---|---|---|

Recommended kind values:

- `artifact`
- `file`
- `command`
- `test`
- `observation`

## Verdict Rationale

- 

## Mode-Specific Closeout Notes

- `stage` mode never marks the change `completed`.
- `final` mode may set the change to `completed` only when the verdict is a clean `pass`.
- `pass_with_warnings` or `fail` in `final` mode must not silently close the change.

## Next Recommended Action

- 

## State Sync Notes

- `state.yaml` should keep only the operational QA summary, active risks, checkpoints, decisions, and next action.
- This report owns the detailed findings, evidence, and review rationale for both `stage` and `final` mode.

## Budget Notes

- Keep the digest short enough for routing and resume.
- Target roughly 300 to 500 words for stage review and 500 to 800 words for final review, plus tables, when possible.
