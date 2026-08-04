# Plan

## Execution Digest

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Single execution stage creates 3 content files under harnesses/quick/.
- stage_plan_digest: S1 creates all files, validation checks line count + keywords + npm run check.
- validation_digest: wc -l comparison, keyword presence/absence, diff against pr-review output.md, npm run check.

## Summary

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: approved

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Create harnesses/quick/ files (harness.md, output.md, skills.yaml) | none | 3 new files under harnesses/quick/ | wc -l, keyword check, diff output.md, npm run check | no (content only) | yes (stage_approval) | pending |

## Validation Strategy

- **AC1**: `diff harnesses/quick/output.md harnesses/pr-review/output.md` -- must be empty (identical files)
- **AC2**: `wc -l harnesses/quick/harness.md` -- must be 40-60 lines; compare against pr-review (~100 lines)
- **AC3**: Verify no Maintainability, Testing, or Documentation section headers in harness.md
- **AC4**: Verify harness.md contains severity restriction language (blocker/major only)
- **AC5**: Verify skills.yaml content is `{ skills: [], contextMode: inline }`
- **AC6**: `npm run check` passes

## Dependencies And Sequencing

- Single stage, no inter-stage dependencies.
- Depends on E3.F2.H1 (pr-review harness) being complete -- confirmed, output.md exists for duplication.

## Planner Stop Note

- Not a planner objective. Execution proceeds after stage approval.

## Approval Notes

- Stage approval implicitly granted via orchestrator handoff with full execution authority.
