# Execution Log

## Handoff Digest

- change_name:
- route:
- latest_stage_id:
- latest_stage_status:
- latest_files_changed:
- latest_check_result:
- latest_next_action:

## Summary

- change_name:
- objective:
- route:
- lifecycle_status:
- current_stage_id:
- execution_source: plan-stage-table
- qa_handoff_policy: recommend `sddl-qa-review` when a completed stage needs structured review before continuing
- git_side_effects: none

## Stage Overview

| Stage Id | Goal | Touches Code | Approval Status | Execution Status | Last Updated | Notes |
|---|---|---|---|---|---|---|

## Execution Rules

- Execute one approved stage per invocation.
- Use `plan.md` as the source of truth for stage order, expected scope, and validation.
- Keep prior stage history visible; do not erase earlier entries.
- Use this artifact as the execution ledger and resume anchor for implementation progress.
- Record contradiction, scope drift, and blast-radius findings explicitly when they occur.

## Stage Log

### Stage `<stage-id>`

- stage_digest:
- approval_checkpoint_id:
- approval_decision_id:
- planned_scope:
- actual_files_changed:
- touches_code:
- quick_check_status: not_run | planned | passed | warning | failed
- qa_review_status: not_applicable | recommended | pending_user_confirmation | user_deferred | user_declined | completed
- execution_status: pending | in_progress | completed | blocked
- next_action:

#### Planned Work

- 

#### Preconditions And Sync Checks

- 

#### Changes Applied

- 

#### Scope And Blast Radius Notes

- 

#### Quick Check

- checks_planned:
- checks_run:
- checks_skipped:
- findings_summary:
- continue_recommendation: continue | review_before_next_stage | fix_before_continue | replan | stop

#### Evidence

| Kind | Reference | Notes |
|---|---|---|

#### Decisions And Blockers

- 

#### User-Facing Summary

- 

---

### Stage `<next-stage-id>`

- stage_digest:
- approval_checkpoint_id:
- approval_decision_id:
- planned_scope:
- actual_files_changed:
- touches_code:
- quick_check_status:
- qa_review_status:
- execution_status:
- next_action:

#### Planned Work

- 

#### Preconditions And Sync Checks

- 

#### Changes Applied

- 

#### Scope And Blast Radius Notes

- 

#### Quick Check

- checks_planned:
- checks_run:
- checks_skipped:
- findings_summary:
- continue_recommendation:

#### Evidence

| Kind | Reference | Notes |
|---|---|---|

#### Decisions And Blockers

- 

#### User-Facing Summary

- 
