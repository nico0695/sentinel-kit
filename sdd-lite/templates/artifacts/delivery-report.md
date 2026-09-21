# Delivery Report

## Summary

- target_kind: change | commit-range
- change_name:
- target_slug:
- frozen_target:
- modes_run:
- output_language: en | chat | es | mixed
- match_class: exact | confirmed | strong | moderate | weak | no-match | not-applicable
- qa_verdict: pass | pass_with_warnings | not_reached
- ticket_status: complete | concerns | not_applicable
- new_configuration: yes | no
- report_path:
- delivery_checkpoint_id:
- delivery_decision_id:
- reported_at:

Field rules:

- `frozen_target` holds the resolved commit SHAs, or the `change-name` plus the artifact digests used. It must name what was actually read.
- `change_name` is empty when `match_class` is `no-match`.
- `match_class` is `not-applicable` when the target was a named change rather than a commit range.
- `ticket_status` is `not_applicable` unless `ticket` mode ran.
- Nothing in this report may claim a verdict this stage did not read from `qa-report.md`.

## Correlation Evidence

| Commit | Candidate change | Class | Signals that fired | Signals that did not |
|---|---|---|---|---|

Rules:

- One row per commit considered, including the ones that ended `no-match`.
- Omit this section entirely when the target was a named change.
- A match with no recorded SHA is inferential. Say so in the row rather than presenting it as settled.

## Recorded Commits

| SHA | Subject | Stage id | Recorded at |
|---|---|---|---|

Rules:

- A row exists only when the user confirmed they applied the commit.
- The SHA must resolve with `git rev-parse` at the time it is written.
- This table is the source that makes later correlation `exact` instead of inferential.

## User Decisions

- 
- 

One line per decision taken at the `delivery_gate` or in the selection loop: the selected commits, the output language, the disposition of any ambiguous match, and any question the user answered because the artifacts could not.

## Drafted Outputs

| Output | Drafted | Template source |
|---|---|---|
| commit message |  |  |
| PR description |  |  |
| ticket content |  |  |

`Drafted` is `yes` or `no`. `Template source` is `project` or `package`, and names any section that fell back to the package default.

## Open Points

- 

Anything the user still has to resolve: an unconfirmed ticket reference, an ambiguous match left open, a commit that should be split, or a section the artifacts could not fill.
Write `none` when there is nothing.

## Delivery Rules

- This stage drafts. It never runs git, never calls a tracker, and never applies anything.
- This stage never sets `lifecycle_status` and never closes or archives a change.
- Correlation is a recommendation until the user decides. No rubric row self-applies.
- Report content stays in English. The drafted outputs follow `output_language`.
