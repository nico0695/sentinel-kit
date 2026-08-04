# Plan

## Execution Digest

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Single execution stage creates 4 content files (harness.md, output.md, skills.yaml, code-quality.md) and deletes 2 .gitkeep placeholders. No code changes.
- stage_plan_digest: 1 stage (content authoring) + validation against 10 acceptance criteria.
- validation_digest: `npm run check` for regressions + line counts + keyword grep + manual content review.

## Summary

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: approved

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Create 4 harness/skill content files and delete 2 .gitkeep placeholders | none | Create `harnesses/pr-review/harness.md` (~100-150 lines), `harnesses/pr-review/output.md` (~40-70 lines), `harnesses/pr-review/skills.yaml` (3 lines), `skills/code-quality.md` (~50-80 lines); delete `harnesses/.gitkeep` and `skills/.gitkeep` | AC-1 through AC-10 (see validation strategy) | No | Yes (stage_approval) | pending |

## Validation Strategy

- **AC-1**: `wc -l harnesses/pr-review/harness.md` returns 100-200.
- **AC-2**: `grep -cE 'REJECT|REQUIRE|PREFER' harnesses/pr-review/harness.md` confirms all three keywords present.
- **AC-3**: Read `harnesses/pr-review/output.md` and verify `VERDICT: approve|request-changes|comment` instruction specifies it must be the first non-empty line.
- **AC-4**: `grep -E '\[SEV:' harnesses/pr-review/output.md` confirms `[SEV: blocker|major|minor|nit]` and `file:line` format.
- **AC-5**: `grep -i 'ambiguous' harnesses/pr-review/output.md` confirms the ambiguity rule is documented.
- **AC-6**: Verify `skills.yaml` content is exactly `{ skills: ["code-quality"], contextMode: "inline" }`.
- **AC-7**: `wc -l skills/code-quality.md` returns >20 lines of actionable content.
- **AC-8**: `ls harnesses/.gitkeep skills/.gitkeep` fails (files deleted).
- **AC-9**: `npm run check` passes with no regressions.
- **AC-10**: Manual scan confirms all content is English.

## Dependencies And Sequencing

- No inter-file dependencies. All 4 files can be created in any order within S1.
- `.gitkeep` deletion is safe because the new files replace the placeholder purpose.
- No code changes means no compilation or test dependencies.

## Planner Stop Note

- Objective is `new-feature` with `continue-lite` route, not `planner`. Execution proceeds after stage approval.

## Approval Notes

- S1 requires `stage_approval` before execution because it creates deliverable content files that ship in the package.
- Single-stage plan -- no complex sequencing or risk boundaries to manage.
- Content structures are fully defined in `design.md`; executor follows them verbatim.

## Budget Notes

- 1 execution stage, 4 content files, 2 deletions. Compact plan for a compact change.
