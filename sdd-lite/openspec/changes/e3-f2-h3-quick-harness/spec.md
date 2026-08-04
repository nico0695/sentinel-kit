# Spec

## Routing Digest

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Quick harness delivers fast-feedback reviews covering only blockers/majors in Correctness and Critical Design domains.
- scope_digest: 3 files under harnesses/quick/ -- harness.md, output.md, skills.yaml
- acceptance_digest: Same verdict contract, noticeably shorter than pr-review, only blocker/major findings

## Summary

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- spec_status: approved

## Scope Boundary

### In Scope

- `harnesses/quick/harness.md`: lightweight review instructions (~40-60 lines), Correctness and Critical Design domains only, limited to REJECT-level rules
- `harnesses/quick/output.md`: duplicate of `harnesses/pr-review/output.md` (same verdict + findings contract)
- `harnesses/quick/skills.yaml`: `{ skills: [], contextMode: inline }` (no skills for quick reviews)

### Out Of Scope

- New composable skills
- Code changes to `src/`
- Modifications to existing harnesses (pr-review, security)
- Validation or testing domain coverage

### Non-Goals

- Replacing pr-review -- quick is a complement, not a replacement
- Supporting skill composition in the quick harness

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Quick harness assembled for review | Prompt includes harness.md + output.md, no skills | skills.yaml has empty skills list |
| Reviewer uses quick harness | Only blocker and major findings reported | harness.md instructs to skip minor/nit |
| Output parsed by sentinel | Same VERDICT + findings format as pr-review | output.md is identical contract |
| Compared to pr-review | Noticeably shorter instructions (~40-60 vs ~100 lines) | Acceptance criterion |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC1 | `harnesses/quick/output.md` produces the same VERDICT + findings contract as pr-review | Diff output.md against pr-review/output.md -- identical | must |
| AC2 | `harnesses/quick/harness.md` is noticeably shorter than pr-review (~40-60 lines vs ~100) | `wc -l` comparison | must |
| AC3 | harness.md covers only Correctness and Critical Design domains | Keyword check: no Maintainability, Testing, Documentation sections | must |
| AC4 | harness.md instructs reviewer to report only blocker and major severity findings | Keyword check for severity restriction | must |
| AC5 | `harnesses/quick/skills.yaml` declares empty skills and inline context mode | File content matches `{ skills: [], contextMode: inline }` | must |
| AC6 | `npm run check` passes | Run the command | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| None identified | Low | Content-only change following established patterns |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | All decisions resolved by story description | n/a | resolved |

## Approval Notes

- Implicitly approved via orchestrator handoff.
