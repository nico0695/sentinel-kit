# Archive Report

## Summary

- change_name:
- disposition: closed | planned | abandoned | superseded
- objective:
- archived_at:
- lifecycle_status_at_archive:
- qa_verdict: pass | pass_with_warnings | not_reached
- source_path:
- archive_path:
- reason:
- superseded_by:
- related_changes:
- archive_checkpoint_id:
- archive_decision_id:

Field rules:

- `reason` is mandatory for `abandoned` and `superseded`, and must quote the user decision.
- `superseded_by` is mandatory for `superseded` and holds the replacing `change-name`.
- `related_changes` is optional and lists sibling `change-name` values detected as related.
- `qa_verdict` is `not_reached` whenever `sddl-qa-review` in `final` mode never ran.

## What Was Done

- 
- 

Two to four bullets. Describe the change outcome, not the archive mechanics.
For `abandoned`, state how far the work got and what was left undone.

## Archived Artifacts

| Artifact | Present |
|---|---|
| state.yaml |  |
| proposal.md |  |
| spec.md |  |
| design.md |  |
| plan.md |  |
| execution-log.md |  |
| qa-report.md |  |
| macro-plan.md |  |
| review-ledger.md |  |
| delivery-report.md |  |

Recommended values: `yes`, `no`.

## How To Reopen

1. Move `{archive_path}` back to `./sdd-lite/openspec/changes/{change-name}/`.
2. In `state.yaml` set `lifecycle_status` to `{lifecycle_status_at_archive}` and `current_stage` to `{stage_at_archive}`.
3. Next step: 

Reopen rules:

- Step 2 must restore the exact pre-archive values recorded in this report, not a guessed state.
- Step 3 must name one concrete stage or action, not a general direction.
- Reopening is a plain move plus a state edit. No archive-specific tooling is required.

## Archive Rules

- This artifact lives only inside the archived folder.
- Archive never deletes anything. `abandoned` changes are moved under `_discarded/` for the user to delete manually.
- Archive never rewrites upstream artifacts. The only state change is the lifecycle transition recorded here.
- Related changes are cross-referenced, never merged. Merging content is a new change, not an archive action.
